import { goalId, GoalStore } from '../src/utility/goal-store';
import { MemoryDatabase, state } from './helpers';

test('migrates the legacy goal once without overwriting it or an existing default', async () => {
    const legacy = { ...state('old'), config: { streamElements: { autoReset: true } }, localDonations: { data: { donations: ['saved donation'] } } };
    const db = new MemoryDatabase({ goal: legacy });
    const store = new GoalStore(db);
    await Promise.all([store.initialize(), store.initialize()]);
    expect(db.data.goal).toEqual(legacy);
    expect(db.data.goals.goal_default.localDonations).toEqual(legacy.localDonations);
    expect(db.data.goals.goal_default.config.streamElements.autoReset).toBe(false);
    await store.update('default', current => ({ state: { ...current!, uuid: 'updated' }, result: undefined }));
    await new GoalStore(db).initialize();
    expect(db.data.goals.goal_default.uuid).toBe('updated');
});

test('serializes concurrent changes while keeping goals separate', async () => {
    const store = new GoalStore(new MemoryDatabase());
    await Promise.all(['a', 'b'].map(id => store.update(id, () => ({ state: state(id), result: undefined }))));
    await Promise.all(Array.from({ length: 10 }, () => store.update('a', current => ({
        state: { ...current!, uuid: String(Number(current!.uuid) + 1 || 1) }, result: undefined
    }))));
    expect((await store.get('a'))?.uuid).toBe('10');
    expect((await store.get('b'))?.uuid).toBe('b');
});

test('rejects path traversal and propagates database failures', async () => {
    const store = new GoalStore(new MemoryDatabase());
    await expect(store.get('../other')).rejects.toThrow('Goal ID');
    const broken = new GoalStore({ getData() { throw new Error('Disk unreadable'); }, push() {} });
    await expect(broken.initialize()).rejects.toThrow('Disk unreadable');
});

test('normalizes Goal IDs consistently while rejecting invalid paths and unsupported characters', () => {
    expect(goalId('  Monthly   Support  ')).toBe('goal_monthly_support');
    expect(goalId('MONTHLY_SUPPORT')).toBe('goal_monthly_support');
    expect(goalId('Monthly\tSupport')).toBe('goal_monthly_support');
    expect(goalId('Monthly-Support')).toBe('goal_monthly-support');
    expect(goalId(' GOAL_Monthly Support ')).toBe('goal_monthly_support');
    expect(goalId(goalId('Monthly Support'))).toBe('goal_monthly_support');
    expect(goalId('   ')).toBe('goal_default');
    expect(goalId()).toBe('goal_default');
    expect(goalId('goal_' + 'a'.repeat(64))).toBe('goal_' + 'a'.repeat(64));
    expect(goalId('a'.repeat(64))).toBe('goal_' + 'a'.repeat(64));
    for (const invalid of ['../other', 'a/b', 'a[b]', '_leading', 'a'.repeat(65)]) {
        expect(() => goalId(invalid)).toThrow('Goal ID');
    }
});

test('migrates saved mixed-case IDs with a backup and preserves data across equivalent lookups and updates', async () => {
    const saved = { Monthly_Support: state('Monthly_Support'), OtherGoal: state('OtherGoal') };
    const db = new MemoryDatabase({ schemaVersion: 2, goals: saved });
    const store = new GoalStore(db);
    await store.initialize();
    expect(db.data.goalIdMigrationBackups.v4).toEqual(saved);
    expect(db.data.schemaVersion).toBe(4);
    expect(Object.keys(db.data.goals).sort()).toEqual(['goal_monthly_support', 'goal_othergoal']);
    expect((await store.get(' MONTHLY Support '))?.uuid).toBe('Monthly_Support');
    await store.update('Monthly Support', current => ({ state: { ...current!, uuid: 'updated' }, result: undefined }));
    expect((await store.get('MONTHLY_SUPPORT'))?.config.goalId).toBe('goal_monthly_support');
    await new GoalStore(db).initialize();
    expect((await store.get('monthly_support'))?.uuid).toBe('updated');
    expect(db.data.goalIdMigrationBackups.v4).toEqual(saved);
});

test.each([
    [2, 'Monthly_Support', 'monthly_support'],
    [3, 'monthly_support', 'goal_monthly_support']
] as const)('refuses colliding saved IDs at schema %s before changing either goal', async (schemaVersion, first, second) => {
    const saved = { [first]: state(first), [second]: state(second) };
    const db = new MemoryDatabase({ schemaVersion, goals: saved });
    const before = JSON.parse(JSON.stringify(db.data));
    const push = jest.spyOn(db, 'push');
    await expect(new GoalStore(db).initialize()).rejects.toThrow("both normalize to 'goal_monthly_support'");
    expect(push).not.toHaveBeenCalled();
    expect(db.data).toEqual(before);
});

test('adds prefixes to schema 3 goals once and retains earlier migration backups', async () => {
    const saved = { monthly_support: state('monthly_support'), goal_existing: state('goal_existing'), default: state('default') };
    const oldBackup = { Monthly_Support: state('Monthly_Support') };
    const db = new MemoryDatabase({ schemaVersion: 3, goals: saved, goalIdMigrationBackup: oldBackup });
    const store = new GoalStore(db);
    await store.initialize();
    expect(Object.keys(db.data.goals).sort()).toEqual(['goal_default', 'goal_existing', 'goal_monthly_support']);
    expect(db.data.goalIdMigrationBackups.v4).toEqual(saved);
    expect(db.data.goalIdMigrationBackup).toEqual(oldBackup);
    expect((await store.get('monthly_support'))?.uuid).toBe('monthly_support');
    expect((await store.get('goal_monthly_support'))?.config.goalId).toBe('goal_monthly_support');
    await new GoalStore(db).initialize();
    expect(Object.keys(db.data.goals).sort()).toEqual(['goal_default', 'goal_existing', 'goal_monthly_support']);
});

test('legacy migration keeps an already saved prefixed default goal', async () => {
    const legacy = state('old');
    const saved = state('goal_default');
    const db = new MemoryDatabase({ goal: legacy, goals: { goal_default: saved } });
    await new GoalStore(db).initialize();
    expect(db.data.goal).toEqual(legacy);
    expect(db.data.goals.goal_default).toEqual(saved);
});
