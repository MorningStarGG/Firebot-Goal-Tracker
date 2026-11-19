import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import plugin from '../src/main';
import api from './firebot-api-mock';
import { initializeRuntime, unloadRuntime, runGoalOperation } from '../src/plugin-runtime';
import { goalManager } from '../src/utility/goal-manager';
import { makeEffect } from './fixtures';
import { removeTestDirectory } from './temp-files';

let profile: string;
beforeEach(async () => {
    profile = await fs.mkdtemp(path.join(os.tmpdir(), 'firebot-lifecycle-test-'));
    api.storage.path = path.join(profile, 'script-data', 'test-plugin');
    api.plugins.getInstalledPlugins.mockResolvedValue([]);
});
afterEach(async () => { await unloadRuntime(); jest.restoreAllMocks(); await removeTestDirectory(profile, 'firebot-lifecycle-test-'); });
const definition = async () => (plugin.registers!.effects![0] as Function)({ parameters: {} });

test('rejects a duplicate installation before writing data or returning any registrations', async () => {
    api.plugins.getInstalledPlugins.mockResolvedValue([{ config: { id: 'other', fileName: 'old.js', enabled: true, parameters: {} }, details: { manifest: plugin.manifest } }]);
    await expect(definition()).rejects.toThrow('Another Advanced Goal Tracker');
    await expect(fs.stat(api.storage.path)).rejects.toMatchObject({ code: 'ENOENT' });
});

test('native lifecycle retains IDs and targeted senders, starts idle, and supports unload/re-enable', async () => {
    const interval = jest.spyOn(global, 'setInterval');
    const tracker = await definition();
    expect(interval).not.toHaveBeenCalled();
    await plugin.onLoad!({ parameters: {} });
    await initializeRuntime();
    expect(interval).toHaveBeenCalledTimes(1);
    expect(tracker.definition.id).toBe('msgg:goaltracker');
    expect((await (plugin.registers!.effects![1] as Function)({})).definition.id).toBe('msgg:goaltracker-local-update');
    expect(await goalManager.store.list()).toEqual([]);
    const sendOne = jest.fn(), sendTwo = jest.fn();
    const first = makeEffect('first'), second = makeEffect('second');
    first.overlayInstance = 'One'; second.overlayInstance = 'Two';
    expect((await tracker.onTriggerEvent({ effect: first, sendDataToOverlay: sendOne })).success).toBe(true);
    expect((await tracker.onTriggerEvent({ effect: second, sendDataToOverlay: sendTwo })).success).toBe(true);
    await goalManager.updateLocalDonation({ name: 'Alice', amount: 5 }, 'first');
    expect(sendOne.mock.calls.some(([data, overlay]) => data.type === 'show' && overlay === 'One')).toBe(true);
    expect(sendOne.mock.calls.every(([data, overlay]) => data.goalId === 'goal_first' && overlay === 'One')).toBe(true);
    expect(sendTwo.mock.calls.every(([data, overlay]) => data.goalId === 'goal_second' && overlay === 'Two')).toBe(true);
    await goalManager.hide('first');
    await plugin.onUnload!({ parameters: {} });
    expect(sendTwo.mock.calls.at(-1)![0].type).toBe('remove');
    const oneCount = sendOne.mock.calls.length, twoCount = sendTwo.mock.calls.length;
    await definition();
    expect(goalManager.isActive('first')).toBe(false);
    expect(goalManager.isActive('second')).toBe(false);
    expect((await goalManager.getLocalDonations('first'))!.data.overall_total.amount).toBe(5);
    expect(sendOne).toHaveBeenCalledTimes(oneCount);
    expect(sendTwo).toHaveBeenCalledTimes(twoCount);
});

test('failed initialization can be retried without retaining a partial manager', async () => {
    const source = path.join(profile, 'db', 'goalTracker.db');
    await fs.mkdir(path.dirname(source), { recursive: true });
    await fs.writeFile(source, 'invalid');
    await expect(definition()).rejects.toThrow();
    await fs.writeFile(source, '{}');
    await expect(definition()).resolves.toHaveProperty('definition.id', 'msgg:goaltracker');
    expect(await goalManager.store.list()).toEqual([]);
});

test('disabling during preflight completes cleanup and permits a later load', async () => {
    let finish!: (installed: []) => void;
    api.plugins.getInstalledPlugins.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const loading = definition();
    const shutdown = unloadRuntime();
    finish([]);
    await expect(loading).rejects.toThrow('unloading');
    await shutdown;
    await expect(definition()).resolves.toHaveProperty('definition.id', 'msgg:goaltracker');
});

test('unload waits for accepted edits, rejects new work, and preserves the final write on re-enable', async () => {
    const tracker = await definition(), sender = jest.fn();
    await tracker.onTriggerEvent({ effect: makeEffect('pending'), sendDataToOverlay: sender });
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const edit = runGoalOperation(async manager => {
        entered(); await gate;
        await manager.updateLocalDonation({ name: 'Pending', amount: 25 }, 'pending');
    });
    await started;
    let finished = false;
    const shutdown = unloadRuntime().then(() => { finished = true; });
    await expect(runGoalOperation(async () => undefined)).rejects.toThrow('unloading');
    expect(finished).toBe(false);
    const removals = sender.mock.calls.length;
    release(); await edit; await shutdown;
    expect(sender).toHaveBeenCalledTimes(removals);
    await definition();
    expect((await goalManager.getLocalDonations('pending'))!.data.overall_total.amount).toBe(25);
    expect(goalManager.isActive('pending')).toBe(false);
});

test('unload lets a submitted remote reset persist completion before the next plugin instance loads', async () => {
    const channel = '0123456789abcdef01234567';
    let submitted!: () => void, complete!: () => void;
    const started = new Promise<void>(resolve => { submitted = resolve; });
    const response = new Promise<void>(resolve => { complete = resolve; });
    const request = jest.spyOn(global, 'fetch').mockImplementation(async (_url, options) => {
        if (options?.method === 'PUT') { submitted(); await response; }
        return { ok: true, status: 204, json: async () => ({ data: {} }) } as Response;
    });
    const tracker = await definition();
    const effect = makeEffect('resetting');
    Object.assign(effect.streamElements, { useStreamElements: true, channelId: channel, jwtToken: 'test-not-a-real-token' });
    await tracker.onTriggerEvent({ effect, sendDataToOverlay: jest.fn() });
    const manager = await (plugin.registers!.effects![1] as Function)({});
    const reset = manager.onTriggerEvent({ effect: { goalId: 'resetting', operation: 'resetRemoteGoals' } });
    await started;
    const shutdown = unloadRuntime();
    complete();
    expect((await reset).success).toBe(true);
    await shutdown;
    await definition();
    expect((await goalManager.resets.state(channel))?.lastResetAt).toBeTruthy();
    expect(request.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(1);
    expect(goalManager.isActive('resetting')).toBe(false);
});
