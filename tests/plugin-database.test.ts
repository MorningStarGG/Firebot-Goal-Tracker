import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openPluginDatabase } from '../src/utility/plugin-database';
import { makeConfig } from './fixtures';
import { removeTestDirectory } from './temp-files';

let profile: string, storage: string, source: string, target: string;
beforeEach(async () => {
    profile = await fs.mkdtemp(path.join(os.tmpdir(), 'firebot-db-test-'));
    storage = path.join(profile, 'script-data', 'test-plugin');
    source = path.join(profile, 'db', 'goalTracker.db');
    target = path.join(storage, 'goalTracker.db');
    await fs.mkdir(path.dirname(source), { recursive: true });
});
afterEach(async () => { jest.restoreAllMocks(); await removeTestDirectory(profile, 'firebot-db-test-'); });
const legacy = async (root: unknown) => fs.writeFile(source, JSON.stringify(root));

test('fresh installation creates a migrated database without activating goals', async () => {
    const db = await openPluginDatabase(storage);
    expect(await db.getData('/schemaVersion')).toBe(4);
    expect(await db.getData('/goals')).toEqual({});
    await expect(fs.stat(path.join(storage, 'legacy-goalTracker.db.backup'))).rejects.toMatchObject({ code: 'ENOENT' });
});

test('imports complete goal history and reset state, retaining the exact legacy file and backup', async () => {
    const state = { goalId: 'goal_monthly', uuid: 'old', config: makeConfig('monthly'), localDonations: { amount: 25 } };
    const root = { schemaVersion: 4, goals: { goal_monthly: state }, streamElementsAccounts: {
        channel: { history: { events: [{ id: 'event' }], cutoff: '2026-10-01' }, reset: { lastCompletedPeriod: 'monthly:2026-11-01', enabledAt: '2026-10-01' } },
    }, goalIdMigrationBackups: { v4: { original: state } } };
    await legacy(root);
    const original = await fs.readFile(source, 'utf8');
    const db = await openPluginDatabase(storage);
    expect(await db.getData('/goals')).toEqual(root.goals);
    expect(await db.getData('/streamElementsAccounts')).toEqual(root.streamElementsAccounts);
    expect(await db.getData('/goalIdMigrationBackups')).toEqual(root.goalIdMigrationBackups);
    expect(await db.getData('/pluginMigration/source')).toBe('profile/db/goalTracker.db');
    expect(await fs.readFile(source, 'utf8')).toBe(original);
    expect(await fs.readFile(path.join(storage, 'legacy-goalTracker.db.backup'), 'utf8')).toBe(original);
    await db.push('/pluginOnly', 123, true);
    await legacy({ goals: {} });
    expect(await (await openPluginDatabase(storage)).getData('/pluginOnly')).toBe(123);
    expect(await fs.readFile(path.join(storage, 'legacy-goalTracker.db.backup'), 'utf8')).toBe(original);
});

test('runs the existing single-goal and ID migrations on the staged copy only', async () => {
    const config = makeConfig(); config.streamElements.autoReset = true;
    const root = { goal: { config, uuid: 'old', goalId: 'default' } };
    await legacy(root);
    const db = await openPluginDatabase(storage);
    expect(await db.getData('/goals/goal_default/goalId')).toBe('goal_default');
    expect(await db.getData('/goals/goal_default/config/streamElements/autoReset')).toBe(false);
    expect(await db.getData('/goal')).toEqual(root.goal);
    expect(JSON.parse(await fs.readFile(source, 'utf8'))).toEqual(root);
});

test('ID collisions do not publish a destination and retry succeeds after correcting the source', async () => {
    await legacy({ goals: { 'Monthly Support': {}, monthly_support: {} } });
    const original = await fs.readFile(source, 'utf8');
    await expect(openPluginDatabase(storage)).rejects.toThrow('both normalize');
    await expect(fs.stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fs.readFile(source, 'utf8')).toBe(original);
    expect((await fs.readdir(storage)).filter(file => file.endsWith('.tmp'))).toEqual([]);
    await legacy({ goals: {} });
    expect(await (await openPluginDatabase(storage)).getData('/schemaVersion')).toBe(4);
});

test('corrupt legacy or authoritative plugin files fail without replacing data', async () => {
    await fs.writeFile(source, 'broken legacy JSON');
    await expect(openPluginDatabase(storage)).rejects.toThrow();
    await expect(fs.stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
    await fs.mkdir(storage, { recursive: true });
    await fs.writeFile(target, 'broken plugin JSON');
    await legacy({ schemaVersion: 4, goals: {} });
    await expect(openPluginDatabase(storage)).rejects.toThrow();
    expect(await fs.readFile(target, 'utf8')).toBe('broken plugin JSON');
});

test('failed publication retains the original and leaves no partial authoritative database', async () => {
    await legacy({ goals: {} });
    jest.spyOn(fs, 'link').mockRejectedValueOnce(new Error('simulated disk failure'));
    await expect(openPluginDatabase(storage)).rejects.toThrow('simulated disk failure');
    await expect(fs.stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await fs.readdir(storage)).filter(file => file.endsWith('.tmp'))).toEqual([]);
    expect(JSON.parse(await fs.readFile(source, 'utf8'))).toEqual({ goals: {} });
});
