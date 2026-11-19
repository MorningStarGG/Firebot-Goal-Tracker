import { GoalManager } from '../src/utility/goal-manager';
import { StreamElementsClient } from '../src/utility/stream-elements';
import { makeConfig } from './fixtures';
import { MemoryDatabase } from './helpers';

let manager: GoalManager;
const channel = '0123456789abcdef01234567';
const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 23, 12)); });
afterEach(async () => { manager?.stop(); await flush(); jest.useRealTimers(); });

test('independent goals preserve concurrent local donations and sanitize routed snapshots', async () => {
    const publish = jest.fn();
    manager = new GoalManager(new MemoryDatabase(), publish);
    await manager.activate(makeConfig('a'), 'One');
    await manager.activate(makeConfig('b'), 'Two');
    await Promise.all(Array.from({ length: 10 }, () => manager.updateLocalDonation({ name: 'Alice', amount: 0.1 }, 'a')));
    expect((await manager.getGoalData('a'))?.localDonations?.data.overall_total.amount).toBe(1);
    expect((await manager.getGoalData('b'))?.localDonations?.data.overall_total.amount).toBe(0);
    await manager.activate(makeConfig('a'), 'One');
    expect((await manager.getGoalData('a'))?.localDonations?.data.overall_total.amount).toBe(1);
    const last = publish.mock.calls.filter(([event]) => event.goalId === 'goal_a').pop()!;
    expect(last[1]).toBe('One');
    expect(last[0].config.streamElements.jwtToken).toBe('');
    await expect(manager.updateLocalDonation({ name: 'Alice', amount: Infinity }, 'a')).rejects.toThrow();
    await expect(manager.updateLocalDonation({ name: '', amount: 1 }, 'a')).rejects.toThrow();
});

test('ID spelling variants target one goal, route updates/removals correctly, and preserve display titles', async () => {
    const publish = jest.fn();
    manager = new GoalManager(new MemoryDatabase(), publish);
    const config = makeConfig('Monthly Support');
    config.content.templates.default.titles.progressBar = 'Monthly Support — Our Goal';
    await manager.activate(config, 'One');
    await manager.activate(makeConfig('other'), 'One');
    await manager.updateLocalDonation({ name: 'Alice', amount: 5 }, 'MONTHLY   SUPPORT');
    const state = await manager.getGoalData('Monthly Support');
    expect(state?.goalId).toBe('goal_monthly_support');
    expect(state?.localDonations?.data.overall_total.amount).toBe(5);
    expect(state?.config.content.templates.default.titles.progressBar).toBe('Monthly Support — Our Goal');
    const donationEvent = publish.mock.calls.map(([event]) => event).filter(event => event.data?.localDonations?.data.overall_total.amount === 5).pop();
    expect(donationEvent?.goalId).toBe('goal_monthly_support');
    const timers = jest.getTimerCount();
    await manager.hide(' Monthly Support ');
    expect(jest.getTimerCount()).toBe(timers - 1);
    expect(publish.mock.calls.map(([event]) => event)).toContainEqual(expect.objectContaining({ type: 'remove', goalId: 'goal_monthly_support' }));
    expect((await manager.getGoalData('other'))?.active).toBe(true);
    await manager.activate(makeConfig('GOAL_MONTHLY_SUPPORT'), 'Two');
    expect(await manager.store.list()).toHaveLength(2);
    expect((await manager.getGoalData('Monthly Support'))?.localDonations?.data.overall_total.amount).toBe(5);
});

test('saved goals stay idle after restart until explicitly run, and hidden goals stop polling', async () => {
    const db = new MemoryDatabase();
    const client = { get: jest.fn(async () => ({ data: {} })), resetGoals: jest.fn(async () => undefined) };
    const publish = jest.fn();
    manager = new GoalManager(db, publish, client as unknown as StreamElementsClient);
    for (const id of ['a', 'b']) {
        const config = makeConfig(id);
        Object.assign(config.streamElements, { useStreamElements: true, channelId: channel, jwtToken: 'secret' });
        await manager.activate(config, 'One');
    }
    await flush();
    await manager.updateLocalDonation({ name: 'Saved', amount: 5 }, 'a');
    manager.stop();
    await flush();
    // Old versions persisted this flag; it must never resume a dormant goal.
    db.data.goals.goal_a.active = true;
    publish.mockClear(); client.get.mockClear();
    manager = new GoalManager(db, publish, client as unknown as StreamElementsClient);
    await manager.initialize();
    jest.advanceTimersByTime(120000);
    await flush();
    expect(client.get).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(manager.isActive('a')).toBe(false);
    expect((await manager.getGoalData('a'))?.active).toBe(false);
    await manager.updateLocalDonation({ name: 'Saved', amount: 2 }, 'a');
    expect((await manager.getLocalDonations('a'))?.data.overall_total.amount).toBe(7);
    expect(publish).not.toHaveBeenCalled();
    const b = (await manager.store.get('b'))!.config;
    await manager.activate(b, 'One');
    await flush();
    expect(publish.mock.calls.filter(([event]) => event.type === 'show').map(([event]) => event.goalId)).toEqual(['goal_b']);
    expect(client.get).toHaveBeenCalledTimes(1);
    expect(manager.isActive('a')).toBe(false);
    expect(manager.isActive('b')).toBe(true);
    await manager.hide('b');
    client.get.mockClear();
    jest.advanceTimersByTime(120000);
    await flush();
    expect(client.get).not.toHaveBeenCalled();
    expect(manager.isActive('b')).toBe(false);
    expect(await manager.store.list()).toHaveLength(2);
});

test('only tracker activation sends a show event; edits and polling send data-only updates', async () => {
    const publish = jest.fn();
    manager = new GoalManager(new MemoryDatabase(), publish);
    await manager.activate(makeConfig('a'), 'One');
    await flush();
    const shown = publish.mock.calls.filter(([event]) => event.type === 'show');
    expect(shown).toHaveLength(1);
    expect(shown[0][0]).toMatchObject({ goalId: 'goal_a', config: { goalId: 'goal_a' } });
    publish.mockClear();
    await manager.updateLocalDonation({ name: 'Alice', amount: 5 }, 'a');
    jest.advanceTimersByTime(60000);
    await flush();
    expect(publish).toHaveBeenCalled();
    for (const [event] of publish.mock.calls) {
        expect(event.type).toBe('update');
        expect(event.uuid).toBe(shown[0][0].uuid);
        expect(event).not.toHaveProperty('config');
    }
});

test('deliberately running two goals on one overlay keeps both active until individually hidden', async () => {
    const publish = jest.fn();
    manager = new GoalManager(new MemoryDatabase(), publish);
    await manager.activate(makeConfig('a'), '');
    await manager.activate(makeConfig('b'), '');
    await flush();
    await manager.updateLocalDonation({ name: 'Saved', amount: 5 }, 'a');
    publish.mockClear();
    await manager.hide('a');
    expect(publish.mock.calls).toEqual([[expect.objectContaining({ type: 'remove', goalId: 'goal_a' }), '']]);
    expect(manager.isActive('a')).toBe(false);
    expect(manager.isActive('b')).toBe(true);
    jest.advanceTimersByTime(60000);
    await flush();
    expect(publish.mock.calls.filter(([event]) => event.type === 'show')).toHaveLength(0);
    expect(publish.mock.calls.filter(([event]) => event.type === 'update').map(([event]) => event.goalId)).toEqual(['goal_b']);
    await manager.activate(makeConfig('c'), '');
    expect(manager.isActive('a')).toBe(false);
    expect(manager.isActive('c')).toBe(true);
    expect((await manager.getLocalDonations('a'))?.data.overall_total.amount).toBe(5);
    expect(await manager.store.list()).toHaveLength(3);
});

test('hiding a goal rejects its in-flight source poll and stops future polling', async () => {
    let resolve!: (data: unknown) => void;
    const get = jest.fn(() => new Promise(done => { resolve = done; }));
    const publish = jest.fn();
    manager = new GoalManager(new MemoryDatabase(), publish, { get } as unknown as StreamElementsClient);
    const config = makeConfig('old');
    Object.assign(config.streamElements, { useStreamElements: true, channelId: channel, jwtToken: 'secret' });
    await manager.activate(config, '');
    await flush();
    expect(get).toHaveBeenCalledTimes(1);
    await manager.hide('old');
    publish.mockClear();
    resolve({ data: { 'tip-goal': { amount: 999 } } });
    await flush();
    expect(publish).not.toHaveBeenCalled();
    expect(manager.isActive('old')).toBe(false);
    expect((await manager.getGoalData('old'))?.streamElements).toBeUndefined();
    jest.advanceTimersByTime(120000);
    await flush();
    expect(get).toHaveBeenCalledTimes(1);
});

test('a replaced in-flight poll cannot overwrite the new source configuration', async () => {
    let resolve!: (value: unknown) => void;
    const get = jest.fn(() => new Promise(done => { resolve = done; }));
    manager = new GoalManager(new MemoryDatabase(), jest.fn(), { get } as unknown as StreamElementsClient);
    const first = makeConfig('a');
    Object.assign(first.streamElements, { useStreamElements: true, channelId: channel, jwtToken: 'secret' });
    await manager.activate(first, 'One');
    await flush();
    expect(get).toHaveBeenCalled();
    await manager.activate(makeConfig('a'), 'One');
    resolve({ data: { 'tip-goal': { amount: 999 } } });
    await flush();
    expect((await manager.getGoalData('a'))?.config.streamElements.useStreamElements).toBe(false);
    expect((await manager.getGoalData('a'))?.streamElements).toBeUndefined();
});

test('same-account goals share donor history; one remote reset refreshes all and preserves local money', async () => {
    const timestamp = new Date(2026, 9, 23, 10).toISOString();
    const data: any = { 'tip-goal': { amount: 20 }, 'cheer-goal': { amount: 0 }, 'subscriber-goal': { amount: 0 }, 'tip-recent': [{ name: 'Alice', amount: 20, createdAt: timestamp }] };
    const client = {
        get: jest.fn(async () => ({ data: { ...data } })),
        resetGoals: jest.fn(async () => { data['tip-goal'] = { amount: 0 }; })
    };
    manager = new GoalManager(new MemoryDatabase(), jest.fn(), client as unknown as StreamElementsClient);
    for (const id of ['a', 'b']) {
        const config = makeConfig(id);
        Object.assign(config.streamElements, { useStreamElements: true, useLocalDonations: true, channelId: channel, jwtToken: 'secret' });
        await manager.activate(config, 'One');
    }
    await flush();
    await manager.updateLocalDonation({ name: 'Local', amount: 5 }, 'a');
    expect((await manager.getGoalData('a'))?.streamElements?.data.current.overall_total.amount).toBe(25);
    expect((await manager.getGoalData('b'))?.streamElements?.data.current.overall_total.amount).toBe(20);
    await manager.resetRemoteGoals('a');
    await flush();
    expect(client.resetGoals).toHaveBeenCalledTimes(1);
    expect((await manager.getGoalData('a'))?.streamElements?.data.current.overall_total.amount).toBe(5);
    expect((await manager.getGoalData('b'))?.streamElements?.data.current.overall_total.amount).toBe(0);
    expect((await manager.getLocalDonations('a'))?.data.overall_total.amount).toBe(5);
});

test('rejects conflicting Date Ranges for automatic resets on one account before changing saved goals', async () => {
    manager = new GoalManager(new MemoryDatabase(), jest.fn(), { get: async () => ({ data: {} }) } as unknown as StreamElementsClient);
    const first = makeConfig('a');
    Object.assign(first.streamElements, { useStreamElements: true, autoReset: true, summaryType: 'monthly', channelId: channel, jwtToken: 'secret' });
    await manager.activate(first, 'One');
    const second = makeConfig('b');
    Object.assign(second.streamElements, { ...first.streamElements, summaryType: 'weekly' });
    await expect(manager.activate(second, 'Two')).rejects.toThrow('different Date Range');
    expect(await manager.getGoalData('b')).toBeUndefined();
});

test('startup catches up one missed account reset even when all of its goals are hidden', async () => {
    const db = new MemoryDatabase();
    const client = { get: jest.fn(async () => ({ data: {} })), resetGoals: jest.fn(async () => undefined) };
    manager = new GoalManager(db, jest.fn(), client as unknown as StreamElementsClient);
    for (const id of ['a', 'b']) {
        const config = makeConfig(id);
        Object.assign(config.streamElements, { useStreamElements: true, autoReset: true, summaryType: 'monthly', channelId: channel, jwtToken: 'secret' });
        await manager.activate(config, 'One');
        await manager.hide(id);
    }
    await manager.updateLocalDonation({ name: 'Local', amount: 5 }, 'a');
    manager.stop();
    await flush();
    expect(client.resetGoals).not.toHaveBeenCalled();
    client.get.mockClear();
    jest.setSystemTime(new Date(2027, 0, 12, 12));
    manager = new GoalManager(db, jest.fn(), client as unknown as StreamElementsClient);
    await manager.initialize();
    expect(client.resetGoals).toHaveBeenCalledTimes(1);
    expect(client.get).not.toHaveBeenCalled();
    expect((await manager.resets.state(channel))?.lastCompletedPeriod).toBe('monthly:2027-01-01');
    expect((await manager.getLocalDonations('a'))?.data.overall_total.amount).toBe(5);
    jest.advanceTimersByTime(60000);
    await flush();
    expect(client.resetGoals).toHaveBeenCalledTimes(1);
});

test.each([
    ['weekly', false], ['weekly', true], ['monthly', false], ['monthly', true]
] as const)('Date Range %s always filters; autoReset=%s controls the additional account reset', async (range, autoReset) => {
    let total = 20;
    const session = () => ({ data: {
        'tip-goal': { amount: total }, 'cheer-goal': { amount: 0 }, 'subscriber-goal': { amount: 0 },
        'tip-recent': [{ name: 'Alice', amount: 20, createdAt: new Date(2026, 9, 20, 12).toISOString() }]
    } });
    const client = {
        get: jest.fn(async () => session()),
        resetGoals: jest.fn(async () => { total = 0; })
    };
    manager = new GoalManager(new MemoryDatabase(), jest.fn(), client as unknown as StreamElementsClient);
    const config = makeConfig('date-range');
    Object.assign(config.streamElements, {
        useStreamElements: true, useLocalDonations: true, autoReset, summaryType: range,
        // A previously saved independent schedule must never override Date Range.
        resetSchedule: range === 'weekly' ? 'monthly' : 'weekly',
        channelId: channel, jwtToken: 'secret'
    });
    await manager.activate(config, 'One');
    await flush();
    await manager.updateLocalDonation({ name: 'Local', amount: 5 }, 'date-range');
    expect((await manager.getGoalData('date-range'))?.streamElements?.data.current.overall_total.amount).toBe(25);
    expect(client.resetGoals).not.toHaveBeenCalled();
    // Advance to Sunday before a new month, or to the first day of the next month.
    jest.setSystemTime(range === 'weekly' ? new Date(2026, 9, 25, 0, 1) : new Date(2026, 10, 1, 0, 1));
    jest.advanceTimersByTime(60000);
    await flush();
    const state = await manager.getGoalData('date-range');
    expect(state?.localDonations?.data.overall_total.amount).toBe(0);
    expect(state?.streamElements?.data.current.donations).toEqual([]);
    expect(state?.streamElements?.data.current.overall_total.amount).toBe(autoReset ? 0 : 20);
    expect(client.resetGoals).toHaveBeenCalledTimes(autoReset ? 1 : 0);
    expect((await manager.getLocalDonations('date-range'))?.data.overall_total.amount).toBe(5);
});

test('Extra Life history is deduplicated within its event and replaced when the event changes', async () => {
    let eventID = '2026';
    const request = jest.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/donations') ? [
        { donationID: 'one', amount: 12.345, createdDateUTC: new Date(2026, 9, 23, 11).toISOString(), displayName: 'Alice', eventID },
        { donationID: 'invalid', amount: Infinity, createdDateUTC: 'invalid', eventID }
    ] : { sumDonations: 12.345, fundraisingGoal: 100, eventID } }));
    manager = new GoalManager(new MemoryDatabase(), jest.fn(), undefined, request as unknown as typeof fetch);
    const config = makeConfig('el');
    Object.assign(config.extraLife, { useExtraLife: true, participantId: '123', dataPollInterval: 30 });
    await manager.activate(config, 'One');
    await flush();
    let data = (await manager.getGoalData('el'))!.extraLife!.data;
    expect(data.sumDonations).toBe(12.35);
    expect(data.donations).toHaveLength(1);
    expect(data.newDonations).toBeUndefined();
    jest.advanceTimersByTime(30000);
    await flush();
    expect((await manager.getGoalData('el'))!.extraLife!.data.donations).toHaveLength(1);
    eventID = '2027';
    jest.advanceTimersByTime(30000);
    await flush();
    data = (await manager.getGoalData('el'))!.extraLife!.data;
    expect(data.metadata.eventID).toBe('2027');
    expect(data.donations).toHaveLength(1);
    expect(data.donations[0].eventID).toBe('2027');
});
