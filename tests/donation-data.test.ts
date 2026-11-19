import { collectSourceDonations, filterDonations, mergeLocalDonations, processStreamElements } from '../src/utility/donation-data';
import { makeConfig } from './fixtures';

const now = new Date(2026, 9, 23, 12);
const timestamp = new Date(2026, 9, 20, 12).toISOString();

test('retains donor details across polls without double counting goal totals or local merges', () => {
    const config = makeConfig().streamElements;
    const session = { data: {
        'tip-goal': { amount: 100 }, 'cheer-goal': { amount: 1000 }, 'subscriber-goal': { amount: 2 },
        'tip-recent': [{ name: 'Alice', amount: 20, createdAt: timestamp }],
        'cheer-recent': [{ name: 'Alice', amount: 1000, createdAt: timestamp }],
        'subscriber-recent': [{ name: 'Bob', tier: '3000', createdAt: timestamp }]
    } };
    let history = collectSourceDonations(session, []);
    history = collectSourceDonations(session, history);
    const first = processStreamElements(session, history, config, now);
    expect(first.donations).toHaveLength(2);
    expect(first.overall_total.amount).toBe(125); // $100 tips, $10 bits, known $12.50 tier 3 + unknown $2.50 sub.
    const later = { data: { ...session.data, 'tip-recent': [] } };
    const second = processStreamElements(later, collectSourceDonations(later, history), config, now);
    expect(second).toEqual(first);
    const local = filterDonations([{ name: 'Alice', total_amount: 99, total_donations: 99, individual_donations: [{ id: 'local', amount: 5, timestamp, donationType: 'local' }] }], 'monthly', now);
    expect(mergeLocalDonations(second, local).overall_total.amount).toBe(130);
    expect(second.overall_total.amount).toBe(125);
});

test('recalculates filtered donor totals and excludes pre-reset source events', () => {
    const config = makeConfig().streamElements;
    const session = { data: { 'tip-recent': [{ name: 'Alice', amount: 20, createdAt: timestamp }] } };
    const history = collectSourceDonations(session, []);
    expect(collectSourceDonations(session, history, new Date(2026, 9, 21).toISOString())).toEqual([]);
    const local = filterDonations([{ name: 'Alice', total_amount: 100, total_donations: 2, individual_donations: [
        { amount: 5, timestamp }, { amount: 95, timestamp: new Date(2026, 8, 20).toISOString() }
    ] }], 'monthly', now);
    expect(local.donations[0].total_amount).toBe(5);
    expect(local.overall_total.amount).toBe(5);
    expect(processStreamElements({ data: {} }, [], config, now).overall_total.amount).toBe(0);
});
