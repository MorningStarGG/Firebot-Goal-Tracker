import { goalLogic } from '../shared/goal-logic';
import { GoalStore } from './goal-store';

export const STREAM_ELEMENTS_GOAL_FIELDS = [
    'follower-goal', 'subscriber-goal', 'tip-goal', 'cheer-goal',
    'merch-goal-total', 'merch-goal-items', 'merch-goal-orders'
] as const;

export interface StreamElementsSession { data: Record<string, unknown>; }
export interface ResetState {
    schedule: 'weekly' | 'monthly';
    lastCompletedPeriod: string;
    enabledAt: string;
    lastResetAt?: string;
}

export class StreamElementsClient {
    constructor(private request: typeof fetch = (...args) => fetch(...args)) { }

    private async send(channel: string, token: string, method: 'GET' | 'PUT', body?: unknown): Promise<unknown> {
        if (!/^[a-f0-9]{24}$/i.test(channel)) throw new Error('StreamElements Account ID must be a 24-character hexadecimal ID');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await this.request(`https://api.streamelements.com/kappa/v2/sessions/${channel}`, {
                method,
                signal: controller.signal,
                headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                ...(body ? { body: JSON.stringify(body) } : {})
            });
            if (!response.ok) throw new Error(`StreamElements ${method} failed (${response.status})`);
            return method === 'GET' ? await response.json() : undefined;
        } finally { clearTimeout(timeout); }
    }

    async get(channel: string, token: string): Promise<StreamElementsSession> {
        const result = await this.send(channel, token, 'GET') as StreamElementsSession;
        if (!result || !result.data || typeof result.data !== 'object' || Array.isArray(result.data)) {
            throw new Error('StreamElements returned invalid session data');
        }
        return result;
    }

    async resetGoals(channel: string, token: string): Promise<void> {
        const fields = Object.fromEntries(STREAM_ELEMENTS_GOAL_FIELDS.map(field => [field, { amount: 0 }]));
        await this.send(channel, token, 'PUT', fields);
    }
}

/** A scheduled goal reset belongs to an account, not to an overlay or goal poller. */
export class StreamElementsResets {
    private locks = new Map<string, Promise<unknown>>();
    async drain(): Promise<void> {
        while (this.locks.size) await Promise.allSettled(this.locks.values());
    }
    constructor(private store: GoalStore, private client: StreamElementsClient, private now = () => new Date()) { }

    private path(channel: string): string {
        if (!/^[a-f0-9]{24}$/i.test(channel)) throw new Error('Invalid StreamElements Account ID');
        return `/streamElementsAccounts/${channel.toLowerCase()}/reset`;
    }

    private exclusive<T>(channel: string, work: () => Promise<T>): Promise<T> {
        const key = channel.toLowerCase();
        const task = (this.locks.get(key) || Promise.resolve()).catch(() => undefined).then(work);
        this.locks.set(key, task);
        void task.finally(() => { if (this.locks.get(key) === task) this.locks.delete(key); }).catch(() => undefined);
        return task;
    }

    async configure(channel: string, schedule: 'weekly' | 'monthly', rearm = false): Promise<void> {
        await this.exclusive(channel, async () => {
            const path = this.path(channel);
            const previous = await this.store.read<ResetState>(path);
            if (previous?.schedule === schedule && !rearm) return;
            await this.arm(path, schedule, previous);
        });
    }

    private async arm(path: string, schedule: ResetState['schedule'], previous?: ResetState): Promise<void> {
        const now = this.now();
        await this.store.db.push(path, {
            schedule, enabledAt: now.toISOString(),
            lastCompletedPeriod: goalLogic.periodKey(schedule, now),
            ...(previous?.lastResetAt ? { lastResetAt: previous.lastResetAt } : {})
        }, true);
    }

    async state(channel: string): Promise<ResetState | undefined> { return this.store.read(this.path(channel)); }

    async run(channel: string, token: string, schedule: 'weekly' | 'monthly', manual = false): Promise<boolean> {
        return this.exclusive(channel, async () => {
            const path = this.path(channel);
            const previous = await this.store.read<ResetState>(path);
            const now = this.now();
            const period = goalLogic.periodKey(schedule, now);
            // First enable or a changed Date Range arms the next boundary, including after upgrades/restarts.
            if (!manual && (!previous || previous.schedule !== schedule)) {
                await this.arm(path, schedule, previous);
                return false;
            }
            if (!manual && previous?.lastCompletedPeriod && previous.lastCompletedPeriod >= period) return false;
            await this.client.resetGoals(channel, token);
            const completed = this.now();
            await this.store.db.push(path, {
                schedule, enabledAt: previous?.enabledAt || now.toISOString(),
                lastCompletedPeriod: goalLogic.periodKey(schedule, completed), lastResetAt: completed.toISOString()
            }, true);
            return true;
        });
    }
}
