import { DonationData, IndividualDonation, LocalDonationData, StreamElementsConfig, StreamElementsResult } from '../types/types';
import { goalLogic as logic } from '../shared/goal-logic';
import { StreamElementsSession } from './stream-elements';

export interface SourceDonation {
    id: string;
    name: string;
    timestamp: string;
    kind: 'tip' | 'bits' | 'subscription';
    amount: number;
    tier?: 'prime' | 'tier1' | 'tier2' | 'tier3';
}

export function emptyLocalData(): LocalDonationData {
    return { data: { donations: [], overall_total: { amount: 0, donation_count: 0 }, metadata: { lastUpdated: new Date().toISOString() } } };
}

export function groupDonations(rows: Array<{ name: string; donation: IndividualDonation }>): StreamElementsResult {
    const donors = new Map<string, DonationData>();
    const seen = new Set<string>();
    for (const { name, donation } of rows) {
        if (!name?.trim() || !Number.isFinite(donation.amount) || donation.amount < 0 || !Number.isFinite(Date.parse(donation.timestamp))) continue;
        const identity = `${name.toLowerCase()}:${donation.id || `${donation.donationType}:${donation.subTier}:${donation.timestamp}:${donation.amount}`}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        const key = name.trim().toLowerCase();
        const donor = donors.get(key) || { name: name.trim(), total_amount: 0, total_donations: 0, individual_donations: [] };
        donor.individual_donations.push({ ...donation, amount: logic.round(donation.amount) });
        donor.total_amount = logic.add(donor.total_amount, donation.amount);
        donor.total_donations++;
        donors.set(key, donor);
    }
    const donations = [...donors.values()];
    donations.forEach(donor => donor.individual_donations.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)));
    donations.sort((a, b) => Date.parse(b.individual_donations[0].timestamp) - Date.parse(a.individual_donations[0].timestamp));
    return {
        donations,
        overall_total: donations.reduce((total, donor) => ({ amount: logic.add(total.amount, donor.total_amount), donation_count: total.donation_count + donor.total_donations }), { amount: 0, donation_count: 0 })
    };
}

export function filterDonations(donations: DonationData[], period: 'all' | 'daily' | 'weekly' | 'monthly', now = new Date()) {
    return groupDonations(donations.flatMap(donor => donor.individual_donations
        .filter(donation => logic.inPeriod(donation.timestamp, period, now))
        .map(donation => ({ name: donor.name, donation }))));
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function goalCounters(session: StreamElementsSession): Record<string, number> {
    const result: Record<string, number> = {};
    for (const type of ['tip', 'cheer', 'subscriber']) {
        const value = logic.number(record(session.data[`${type}-goal`]).amount, NaN);
        if (Number.isFinite(value) && value >= 0) result[type] = value;
    }
    return result;
}

/** Keep raw event units so two goals can independently price bits and subscription tiers. */
export function collectSourceDonations(session: StreamElementsSession, previous: SourceDonation[], cutoff?: string): SourceDonation[] {
    const after = cutoff ? Date.parse(cutoff) : -Infinity;
    const events = new Map<string, SourceDonation>();
    for (const event of previous) if (Date.parse(event.timestamp) > after) events.set(event.id, event);
    for (const [type, kind] of [['tip', 'tip'], ['cheer', 'bits'], ['subscriber', 'subscription']] as const) {
        const recent = session.data[`${type}-recent`];
        if (!Array.isArray(recent)) continue;
        for (const raw of recent) {
            const row = record(raw);
            const timestamp = typeof row.createdAt === 'string' ? row.createdAt : '';
            if (!Number.isFinite(Date.parse(timestamp)) || Date.parse(timestamp) <= after) continue;
            const name = typeof row.sender === 'string' && row.sender ? row.sender : typeof row.name === 'string' ? row.name : 'Anonymous';
            const amount = kind === 'subscription' ? 1 : logic.number(row.amount, NaN);
            if (!Number.isFinite(amount) || amount <= 0) continue;
            const tier = row.tier === '3000' || row.tier === 'tier3' ? 'tier3' : row.tier === '2000' || row.tier === 'tier2' ? 'tier2' : row.tier === 'prime' ? 'prime' : 'tier1';
            const identity = String(row._id || row.id || `${kind}:${name.toLowerCase()}:${timestamp}:${amount}:${kind === 'subscription' ? tier : ''}`);
            events.set(identity, { id: identity, name, timestamp, kind, amount, ...(kind === 'subscription' ? { tier } : {}) });
        }
    }
    return [...events.values()].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

export function processStreamElements(session: StreamElementsSession, history: SourceDonation[], config: StreamElementsConfig, now = new Date()): StreamElementsResult {
    const rows = history.filter(event => logic.inPeriod(event.timestamp, config.summaryType || 'monthly', now));
    const priced = rows.map(event => ({
        name: event.name, donation: {
            id: event.id, timestamp: event.timestamp, donationType: event.kind,
            amount: logic.round(event.kind === 'bits' ? event.amount * config.bitsValue : event.kind === 'subscription' ? config.subscriptionValues[event.tier || 'tier1'] : event.amount),
            ...(event.tier ? { subTier: event.tier } : {})
        }
    }));
    const grouped = groupDonations(priced);
    const known = { tip: 0, bits: 0, subscription: 0, subscriptions: 0 };
    priced.forEach(({ donation }) => {
        known[donation.donationType] = logic.add(known[donation.donationType], donation.amount);
        if (donation.donationType === 'subscription') known.subscriptions++;
    });
    const counters = goalCounters(session);
    // These are alternate measurements of the same source contributions, never additive copies.
    const tips = Math.max(known.tip, counters.tip || 0);
    const bits = Math.max(known.bits, (counters.cheer || 0) * config.bitsValue);
    const subscriptions = known.subscription + Math.max(0, (counters.subscriber || 0) - known.subscriptions) * config.subscriptionValues.tier1;
    grouped.overall_total.amount = logic.round(tips + bits + subscriptions);
    return grouped;
}

export function mergeLocalDonations(source: StreamElementsResult, local: StreamElementsResult): StreamElementsResult {
    const merged = groupDonations([...source.donations, ...local.donations].flatMap(donor => donor.individual_donations.map(donation => ({ name: donor.name, donation }))));
    // Preserve anonymous amounts filled from account counters, which are absent from donor rows.
    merged.overall_total.amount = logic.add(source.overall_total.amount, local.overall_total.amount);
    return merged;
}
