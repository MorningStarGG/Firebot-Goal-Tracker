
import { randomUUID } from 'crypto';
import { GoalOverlayEvent, GoalState, GoalTrackerConfig, GoalUpdateData, LocalDonationData, ProcessedExtraLifeData } from '../types/types';
import { logger } from '../logger';
import { goalLogic as logic } from '../shared/goal-logic';
import { clone, GoalDatabase, goalId, GoalStore } from './goal-store';
import { PollingRegistry } from './polling-registry';
import { StreamElementsClient, StreamElementsResets, StreamElementsSession } from './stream-elements';
import { collectSourceDonations, emptyLocalData, filterDonations, goalCounters, groupDonations, mergeLocalDonations, processStreamElements, SourceDonation } from './donation-data';

interface AccountHistory {
    events: SourceDonation[];
    counters?: Record<string, number>;
    cutoff?: string;
}

/** Coordinates independent goals while sharing account history and remote reset ownership. */
export class GoalManager {
    readonly store: GoalStore;
    readonly resets: StreamElementsResets;
    private pollers = new PollingRegistry();
    private maintenance?: NodeJS.Timeout;
    private accountJobs = new Map<string, Promise<unknown>>();
    private sessions = new Map<string, { at: number; data: StreamElementsSession }>();
    private starting?: Promise<void>;
    private stopped = false;
    private jobs = new Set<Promise<unknown>>();
    // Display/polling activation belongs to this plugin activation, never to saved configuration.
    private activeGoals = new Map<string, { uuid: string; revision: number; overlayInstance: string }>();

    constructor(db: GoalDatabase, private publish: (event: GoalOverlayEvent, overlayInstance: string) => void,
        private client = new StreamElementsClient(), private request: typeof fetch = (...args) => fetch(...args)) {
        this.store = new GoalStore(db);
        this.resets = new StreamElementsResets(this.store, client);
    }

    async initialize(): Promise<void> {
        if (!this.starting) this.starting = this.start().catch(error => { this.starting = undefined; throw error; });
        return this.starting;
    }

    private async start(): Promise<void> {
        await this.store.initialize();
        if (this.stopped) return;
        // Saved goals stay idle until their tracker effect runs. Account reset schedules are independent.
        // Scheduled resets also run when a configured widget is hidden.
        await this.checkScheduledResets();
        if (this.stopped) return;
        this.maintenance = setInterval(() => { void this.track(this.checkScheduledResets()).catch(error => logger.error('Goal reset check failed:', error)); }, 30000);
    }

    stop(): void {
        if (this.stopped) return;
        this.stopped = true;
        this.pollers.stopAll();
        for (const [id, goal] of this.activeGoals) {
            this.publish({ type: 'remove', goalId: id, revision: goal.revision + 1 }, goal.overlayInstance);
        }
        this.activeGoals.clear();
        if (this.maintenance) clearInterval(this.maintenance);
        this.sessions.clear();
    }

    private track<T>(job: Promise<T>): Promise<T> {
        this.jobs.add(job);
        void job.then(() => this.jobs.delete(job), () => this.jobs.delete(job));
        return job;
    }

    async dispose(): Promise<void> {
        this.stop();
        if (this.starting) await this.starting.catch(() => undefined);
        while (this.jobs.size || this.accountJobs.size) {
            await Promise.allSettled([...this.jobs, ...this.accountJobs.values()]);
        }
        await this.resets.drain();
        await this.store.drain();
    }

    isActive(id: string, uuid?: string): boolean {
        const active = this.activeGoals.get(goalId(id));
        return !this.stopped && !!active && (!uuid || active.uuid === uuid);
    }

    private async accountTask<T>(channel: string, work: () => Promise<T>): Promise<T> {
        const previous = this.accountJobs.get(channel) || Promise.resolve();
        const task = previous.catch(() => undefined).then(work);
        this.accountJobs.set(channel, task);
        try { return await task; }
        finally { if (this.accountJobs.get(channel) === task) this.accountJobs.delete(channel); }
    }

    private async assertResetSchedule(config: GoalTrackerConfig): Promise<void> {
        const se = config.streamElements;
        if (!se.useStreamElements || !se.autoReset) return;
        const schedule = se.summaryType || 'monthly';
        const conflicts = (await this.store.list()).filter(goal => goal.goalId !== config.goalId &&
            goal.config?.streamElements?.useStreamElements && goal.config.streamElements.autoReset &&
            goal.config.streamElements.channelId.toLowerCase() === se.channelId.toLowerCase() &&
            (goal.config.streamElements.summaryType || 'monthly') !== schedule);
        if (conflicts.length) throw new Error(`StreamElements account already has a different Date Range for automatic resets in goal ${conflicts[0].goalId}. Use the same Date Range for goals automatically resetting this account.`);
    }

    async activate(config: GoalTrackerConfig, overlayInstance: string, uuid: string = randomUUID()): Promise<void> {
        overlayInstance = overlayInstance === 'Default' ? '' : overlayInstance;
        await this.initialize();
        const id = goalId(config.goalId);
        config.goalId = id;
        await this.assertResetSchedule(config);
        const previous = await this.store.get(id);
        const se = config.streamElements;
        if (se.useStreamElements && se.autoReset) {
            const otherSchedules = (await this.store.list()).some(goal => goal.goalId !== id &&
                goal.config?.streamElements?.useStreamElements && goal.config.streamElements.autoReset &&
                goal.config.streamElements.channelId.toLowerCase() === se.channelId.toLowerCase());
            await this.resets.configure(se.channelId, se.summaryType || 'monthly', !previous?.config.streamElements.autoReset && !otherSchedules);
        }
        if (this.stopped) return;
        const activated = await this.store.update(id, current => {
            const state: GoalState = {
                ...current, goalId: id, uuid, revision: (current?.revision || 0) + 1, config: clone(config), overlayInstance,
                createdAt: current?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
            };
            delete state.active;
            if (current?.config.streamElements.channelId !== se.channelId) delete state.streamElements;
            if (current?.config.extraLife.participantId !== config.extraLife.participantId) delete state.extraLife;
            return { state, result: state };
        });
        if (this.stopped) return;
        this.activeGoals.set(id, { uuid, revision: activated.revision || 0, overlayInstance });
        if (previous && previous.overlayInstance !== overlayInstance) {
            this.publish({ type: 'remove', goalId: id, revision: (previous.revision || 0) + 1 }, previous.overlayInstance);
        }
        await this.sendGoalState(id, 'show', undefined, uuid);
        if (this.isActive(id, uuid)) this.startPolling(activated);
    }

    private startPolling(state: GoalState): void {
        if (!this.isActive(state.goalId, state.uuid)) return;
        const config = state.config;
        const interval = config.extraLife.useExtraLife ? config.extraLife.dataPollInterval :
            config.streamElements.useStreamElements ? config.streamElements.pollInterval : config.timing.dataPollInterval;
        this.pollers.start(state.goalId, Math.max(1, logic.number(interval, 60)), async isCurrent => {
            try { await this.track(this.poll(state.goalId, state.uuid, isCurrent)); }
            catch (error) { logger.error(`Goal ${state.goalId} update failed:`, error); }
        });
    }

    private async poll(id: string, uuid: string, isCurrent: () => boolean): Promise<void> {
        const state = await this.store.get(id);
        if (!state || state.uuid !== uuid || !isCurrent() || !this.isActive(id, uuid)) return;
        let data: GoalUpdateData = {};
        if (state.config.extraLife.useExtraLife) {
            data.extraLife = await this.fetchExtraLife(state);
        } else if (state.config.streamElements.useStreamElements) {
            const se = state.config.streamElements;
            const source = await this.getAccountSource(state.config);
            const now = new Date();
            data.streamElements = {
                current: processStreamElements(source.session, source.events, se, now),
                metadata: { month: now.getMonth(), year: now.getFullYear(), lastUpdated: now.toISOString() }
            };
        }
        if (!isCurrent() || this.stopped) return;
        const applied = await this.store.update(id, current => {
            if (!current || current.uuid !== uuid || !isCurrent()) return { state: current!, result: false };
            if (data.streamElements) current.streamElements = { lastUpdated: new Date().toISOString(), data: data.streamElements };
            if (data.extraLife) {
                const stored = clone(data.extraLife);
                delete stored.newDonations;
                current.extraLife = { lastUpdated: new Date().toISOString(), data: stored };
            }
            return { state: current, result: true };
        });
        if (applied && isCurrent()) await this.sendUpdate(id, data.extraLife?.newDonations);
    }

    private async getAccountSource(config: GoalTrackerConfig): Promise<{ session: StreamElementsSession; events: SourceDonation[] }> {
        const se = config.streamElements;
        const channel = se.channelId.toLowerCase();
        return this.accountTask(channel, async () => {
            if (se.autoReset) {
                await this.assertResetSchedule(config);
                if (await this.resets.run(channel, se.jwtToken, se.summaryType || 'monthly')) {
                    this.sessions.delete(channel);
                    await this.refreshAccount(channel);
                }
            }
            const cached = this.sessions.get(channel);
            const session = cached && Date.now() - cached.at < 1000 ? cached.data : await this.client.get(channel, se.jwtToken);
            this.sessions.set(channel, { at: Date.now(), data: session });
            const path = `/streamElementsAccounts/${channel}/source`;
            const old = await this.store.read<AccountHistory>(path) || { events: await this.legacySourceHistory(channel) };
            const reset = await this.resets.state(channel);
            const counters = goalCounters(session);
            let cutoff = old.cutoff;
            const knownReset = !!reset?.lastResetAt && (!cutoff || reset.lastResetAt > cutoff);
            if (knownReset) cutoff = reset!.lastResetAt;
            // The user can also reset goal progress directly in the SE dashboard.
            if (!knownReset && old.counters && Object.keys(counters).some(key => Number.isFinite(old.counters![key]) && counters[key] < old.counters![key])) {
                cutoff = new Date().toISOString();
            }
            const events = collectSourceDonations(session, old.events, cutoff);
            await this.store.db.push(path, { events, counters, ...(cutoff ? { cutoff } : {}) }, true);
            return { session, events };
        });
    }

    private async legacySourceHistory(channel: string): Promise<SourceDonation[]> {
        const rows: SourceDonation[] = [];
        for (const goal of await this.store.list()) {
            const se = goal.config?.streamElements;
            if (!se) continue;
            if (se.channelId.toLowerCase() !== channel) continue;
            for (const donor of goal.streamElements?.data.current.donations || []) {
                for (const donation of donor.individual_donations) {
                    if (donation.donationType === 'local') continue;
                    const kind = donation.donationType || 'tip';
                    const amount = kind === 'subscription' ? 1 : kind === 'bits' ? donation.amount / se.bitsValue : donation.amount;
                    if (!Number.isFinite(amount) || amount <= 0) continue;
                    const rawTier = String(donation.subTier || 'tier1');
                    const tier = rawTier === '3000' ? 'tier3' : rawTier === '2000' ? 'tier2' : rawTier === 'prime' ? 'prime' : rawTier === 'tier3' ? 'tier3' : rawTier === 'tier2' ? 'tier2' : 'tier1';
                    const identity = donation.id || `${kind}:${donor.name.toLowerCase()}:${donation.timestamp}:${amount}:${kind === 'subscription' ? tier : ''}`;
                    rows.push({ id: identity, name: donor.name, timestamp: donation.timestamp, kind, amount, ...(kind === 'subscription' ? { tier } : {}) });
                }
            }
        }
        return rows;
    }

    private async checkScheduledResets(): Promise<void> {
        const seen = new Set<string>();
        for (const goal of await this.store.list()) {
            const se = goal.config?.streamElements;
            if (!se?.useStreamElements || !se.autoReset || seen.has(se.channelId.toLowerCase()) || this.stopped) continue;
            seen.add(se.channelId.toLowerCase());
            try {
                await this.assertResetSchedule(goal.config);
                const changed = await this.accountTask(se.channelId.toLowerCase(), async () => {
                    const result = await this.resets.run(se.channelId, se.jwtToken, se.summaryType || 'monthly');
                    if (result) this.sessions.delete(se.channelId.toLowerCase());
                    return result;
                });
                if (changed) await this.refreshAccount(se.channelId);
            } catch (error) { logger.error(`StreamElements reset failed for goal ${goal.goalId}:`, error); }
        }
    }

    async resetRemoteGoals(id = 'default'): Promise<void> {
        const state = await this.requireGoal(id);
        if (this.stopped) throw new Error('Goal Tracker plugin is unloading');
        const se = state.config.streamElements;
        if (!se.useStreamElements) throw new Error('Enable StreamElements on the selected goal before resetting its account goals');
        await this.accountTask(se.channelId.toLowerCase(), async () => {
            await this.resets.run(se.channelId, se.jwtToken, se.summaryType || 'monthly', true);
            this.sessions.delete(se.channelId.toLowerCase());
        });
        await this.refreshAccount(se.channelId);
    }

    private async refreshAccount(channel: string): Promise<void> {
        for (const goal of await this.store.list()) {
            if (goal.config && !goal.config.extraLife.useExtraLife && goal.config.streamElements.useStreamElements &&
                goal.config.streamElements.channelId.toLowerCase() === channel.toLowerCase()) {
                await this.store.update(goal.goalId, state => { delete state!.streamElements; return { state: state!, result: undefined }; });
                await this.sendUpdate(goal.goalId);
                const current = await this.store.get(goal.goalId);
                if (current && this.isActive(current.goalId, current.uuid)) this.startPolling(current);
            }
        }
    }

    private async fetchExtraLife(state: GoalState): Promise<ProcessedExtraLifeData> {
        const participantId = state.config.extraLife.participantId;
        if (!participantId || !/^\d+$/.test(participantId)) throw new Error('Extra Life Participant ID must contain only digits');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        let participant: any;
        let incoming: any[];
        try {
            [participant, incoming] = await Promise.all([
                `https://www.extra-life.org/api/participants/${participantId}`,
                `https://www.extra-life.org/api/participants/${participantId}/donations`
            ].map(async url => {
                const response = await this.request(url, { signal: controller.signal });
                if (!response.ok) throw new Error(`Extra Life request failed (${response.status})`);
                return response.json();
            }));
        } finally { controller.abort(); clearTimeout(timeout); }
        if (!Array.isArray(incoming) || !Number.isFinite(Number(participant.sumDonations))) throw new Error('Extra Life returned invalid donation data');
        const eventID = String(participant.eventID);
        const previous = state.extraLife?.data;
        const old = previous?.metadata.participantId === participantId && String(previous.metadata.eventID) === eventID ? previous.donations : [];
        const donations = new Map(old.map(donation => [String(donation.donationID), donation]));
        const newDonations: ProcessedExtraLifeData['donations'] = [];
        for (const raw of incoming) {
            const amount = logic.number(raw.amount, NaN);
            if (String(raw.eventID) !== eventID || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(Date.parse(raw.createdDateUTC)) || raw.donationID == null) continue;
            const donation = { amount: logic.round(amount), displayName: String(raw.displayName || 'Anonymous'), message: String(raw.message || ''), donationID: String(raw.donationID), createdDateUTC: raw.createdDateUTC, eventID };
            if (!donations.has(donation.donationID)) newDonations.push(donation);
            donations.set(donation.donationID, donation);
        }
        return {
            sumDonations: logic.round(Number(participant.sumDonations)),
            fundraisingGoal: logic.number(participant.fundraisingGoal) > 0 ? logic.round(Number(participant.fundraisingGoal)) : state.config.donationGoal,
            donations: [...donations.values()].sort((a, b) => Date.parse(b.createdDateUTC) - Date.parse(a.createdDateUTC)),
            ...(newDonations.length ? { newDonations } : {}),
            metadata: { lastUpdated: new Date().toISOString(), participantId, eventID }
        };
    }

    private async requireGoal(id: string): Promise<GoalState> {
        const state = await this.store.get(id);
        if (!state?.config) throw new Error(`Goal '${id}' does not exist. Run its Advanced Goal Tracker effect first.`);
        return state;
    }

    async getGoalData(id = 'default'): Promise<GoalState | undefined> {
        const state = await this.store.get(id);
        if (!state?.config) return state;
        state.active = this.isActive(state.goalId, state.uuid);
        const period = state.config.streamElements.useStreamElements ? state.config.streamElements.summaryType : state.config.streamElements.localDonationsPeriod;
        const filtered = filterDonations(state.localDonations?.data.donations || [], period || 'monthly');
        state.localDonations = { data: { ...filtered, metadata: { lastUpdated: state.updatedAt } } };
        if (state.config.streamElements.useStreamElements && state.config.streamElements.useLocalDonations && !state.streamElements) {
            state.streamElements = { lastUpdated: state.updatedAt, data: { current: { donations: [], overall_total: { amount: 0, donation_count: 0 } }, metadata: { month: 0, year: 0, lastUpdated: state.updatedAt } } };
        }
        if (state.config.streamElements.useLocalDonations && state.streamElements) {
            state.streamElements.data.current = mergeLocalDonations(state.streamElements.data.current, filtered);
        }
        return state;
    }

    async getLocalDonations(id = 'default'): Promise<LocalDonationData | undefined> { return (await this.store.get(id))?.localDonations; }

    private async editLocal(id: string, edit: (data: LocalDonationData) => void): Promise<LocalDonationData> {
        const result = await this.store.update(id, state => {
            if (!state) throw new Error(`Goal '${id}' does not exist`);
            const data = state.localDonations || emptyLocalData();
            edit(data);
            const grouped = groupDonations(data.data.donations.flatMap(donor => donor.individual_donations.map(donation => ({ name: donor.name, donation }))));
            state.localDonations = { data: { ...grouped, metadata: { lastUpdated: new Date().toISOString() } } };
            return { state, result: state.localDonations };
        });
        await this.sendUpdate(id);
        return result;
    }

    async updateLocalDonation(donation: { name: string; amount: number }, id = 'default'): Promise<LocalDonationData> {
        if (!donation.name?.trim()) throw new Error('Donor name is required');
        if (!Number.isFinite(donation.amount) || logic.round(donation.amount) <= 0) throw new Error('Donation amount must be a finite positive amount of at least 0.01');
        return this.editLocal(id, local => {
            let donor = local.data.donations.find(item => item.name.toLowerCase() === donation.name.trim().toLowerCase());
            if (!donor) { donor = { name: donation.name.trim(), individual_donations: [], total_amount: 0, total_donations: 0 }; local.data.donations.push(donor); }
            donor.individual_donations.push({ id: randomUUID(), amount: logic.round(donation.amount), timestamp: new Date().toISOString(), donationType: 'local' });
        });
    }

    async removeLocalDonation(identity: string, id = 'default'): Promise<LocalDonationData> {
        return this.editLocal(id, local => {
            for (const donor of local.data.donations) {
                const index = donor.individual_donations.findIndex(donation => (donation.id || donation.timestamp) === identity);
                if (index !== -1) { donor.individual_donations.splice(index, 1); return; }
            }
            throw new Error('Donation not found');
        });
    }

    async resetUserDonations(name: string, id = 'default'): Promise<LocalDonationData> {
        if (!name?.trim()) throw new Error('Donor name is required');
        return this.editLocal(id, local => {
            const index = local.data.donations.findIndex(donor => donor.name.toLowerCase() === name.trim().toLowerCase());
            if (index === -1) throw new Error('Donor not found');
            local.data.donations.splice(index, 1);
        });
    }

    async resetLocalData(id = 'default'): Promise<void> { await this.editLocal(id, local => { local.data.donations = []; }); }

    async resetStreamElementsData(id = 'default'): Promise<void> {
        await this.store.update(id, state => { if (!state) throw new Error('Goal not found'); delete state.streamElements; return { state, result: undefined }; });
        await this.sendUpdate(id);
    }

    async resetExtraLifeData(id = 'default'): Promise<void> {
        await this.store.update(id, state => { if (!state) throw new Error('Goal not found'); delete state.extraLife; return { state, result: undefined }; });
        await this.sendUpdate(id);
    }

    async hide(id = 'default'): Promise<void> {
        const state = await this.requireGoal(id);
        id = state.goalId;
        this.pollers.stop(id);
        this.activeGoals.delete(id);
        const revision = await this.store.update(id, current => {
            const next = (current!.revision || 0) + 1;
            const state = { ...current!, revision: next };
            delete state.active;
            return { state, result: next };
        });
        this.publish({ type: 'remove', goalId: id, revision }, state.overlayInstance);
    }

    private async sendUpdate(id: string, newDonations?: ProcessedExtraLifeData['donations']): Promise<void> {
        await this.sendGoalState(id, 'update', newDonations);
    }

    private async sendGoalState(id: string, type: 'show' | 'update', newDonations?: ProcessedExtraLifeData['donations'], expectedUuid?: string): Promise<void> {
        const state = await this.getGoalData(id);
        if (!state?.active || !this.isActive(state.goalId, state.uuid) || (expectedUuid && state.uuid !== expectedUuid)) return;
        const config = clone(state.config);
        // Browser overlays do not need account credentials.
        config.streamElements.jwtToken = '';
        delete config.content.branding.logo.default.resourcePath;
        const data: GoalUpdateData = state.config.extraLife.useExtraLife ? {
            extraLife: state.extraLife ? { ...state.extraLife.data, ...(newDonations?.length ? { newDonations } : {}) } : {
                sumDonations: 0, fundraisingGoal: state.config.donationGoal, donations: [],
                metadata: { lastUpdated: state.updatedAt, participantId: state.config.extraLife.participantId || '', eventID: '' }
            }
        } : state.config.streamElements.useStreamElements ? {
            streamElements: state.streamElements?.data || { current: { donations: [], overall_total: { amount: 0, donation_count: 0 } }, metadata: { month: 0, year: 0, lastUpdated: state.updatedAt } }
        } : { localDonations: state.localDonations || emptyLocalData() };
        const common = { goalId: state.goalId, uuid: state.uuid, revision: state.revision || 0, overlayInstance: state.overlayInstance, data };
        this.publish(type === 'show' ? { ...common, type, config } : { ...common, type }, state.overlayInstance);
    }
}

export let goalManager: GoalManager;

export async function disposeGoalManager(): Promise<void> {
    const previous = goalManager;
    goalManager = undefined!;
    await previous?.dispose();
}

export function createGoalManager(db: GoalDatabase, publish: (event: GoalOverlayEvent, overlay: string) => void): GoalManager {
    if (!goalManager) {
        goalManager = new GoalManager(db, publish);
    }
    return goalManager;
}
