import { StreamElementsClient, StreamElementsResets, STREAM_ELEMENTS_GOAL_FIELDS } from '../src/utility/stream-elements';
import { GoalStore } from '../src/utility/goal-store';
import { MemoryDatabase } from './helpers';

const channel = '0123456789abcdef01234567';

test('goal reset mirrors the dashboard fields and never calls session/reset', async () => {
    // A successful update need not return JSON. Parsing an empty response would falsely mark the reset as failed.
    const request = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    await new StreamElementsClient(request).resetGoals(channel, 'token');
    const [url, options] = request.mock.calls[0];
    expect(url).toBe(`https://api.streamelements.com/kappa/v2/sessions/${channel}`);
    const body = JSON.parse(options.body);
    expect(Object.keys(body).sort()).toEqual([...STREAM_ELEMENTS_GOAL_FIELDS].sort());
    expect(Object.values(body)).toEqual(STREAM_ELEMENTS_GOAL_FIELDS.map(() => ({ amount: 0 })));
});

test('arms on first enable, catches up on next load once per account, retries failures', async () => {
    const db = new MemoryDatabase();
    const store = new GoalStore(db);
    let now = new Date(2026, 8, 1);
    const resetGoals = jest.fn().mockResolvedValue(undefined);
    const client = { resetGoals } as unknown as StreamElementsClient;
    let resets = new StreamElementsResets(store, client, () => now);
    await resets.configure(channel, 'monthly');
    expect(await resets.run(channel, 'token', 'monthly')).toBe(false);
    now = new Date(2026, 9, 3);
    resets = new StreamElementsResets(store, client, () => now);
    resetGoals.mockRejectedValueOnce(new Error('Offline'));
    await expect(resets.run(channel, 'token', 'monthly')).rejects.toThrow('Offline');
    expect((await resets.state(channel))?.lastCompletedPeriod).toContain('2026-09');
    await Promise.all([resets.run(channel, 'token', 'monthly'), resets.run(channel, 'token', 'monthly')]);
    expect(resetGoals).toHaveBeenCalledTimes(2);
    expect((await resets.state(channel))?.lastCompletedPeriod).toContain('2026-10');
});

test('catches up weekly across month/year boundaries without needing Sunday polling', async () => {
    const store = new GoalStore(new MemoryDatabase());
    let now = new Date(2026, 11, 31, 12);
    const resetGoals = jest.fn().mockResolvedValue(undefined);
    const resets = new StreamElementsResets(store, { resetGoals } as unknown as StreamElementsClient, () => now);
    await resets.configure(channel, 'weekly');
    now = new Date(2027, 0, 6, 12);
    expect(await resets.run(channel, 'token', 'weekly')).toBe(true);
    expect(await resets.run(channel, 'token', 'weekly')).toBe(false);
    expect(resetGoals).toHaveBeenCalledTimes(1);
});

test('a saved reset schedule differing from Date Range arms the new range without an immediate reset', async () => {
    const store = new GoalStore(new MemoryDatabase());
    let now = new Date(2026, 9, 20, 12);
    const resetGoals = jest.fn().mockResolvedValue(undefined);
    const resets = new StreamElementsResets(store, { resetGoals } as unknown as StreamElementsClient, () => now);
    await resets.run(channel, 'token', 'monthly', true);
    const lastResetAt = (await resets.state(channel))!.lastResetAt;
    resetGoals.mockClear();
    // Represents startup with an old separate schedule but a different configured Date Range.
    expect(await resets.run(channel, 'token', 'weekly')).toBe(false);
    expect((await resets.state(channel))?.schedule).toBe('weekly');
    expect((await resets.state(channel))?.lastResetAt).toBe(lastResetAt);
    expect(resetGoals).not.toHaveBeenCalled();
    now = new Date(2026, 9, 25, 12);
    expect(await resets.run(channel, 'token', 'weekly')).toBe(true);
    expect(resetGoals).toHaveBeenCalledTimes(1);
});
