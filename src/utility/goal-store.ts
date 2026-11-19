import { GoalState } from '../types/types';

export interface GoalDatabase {
    getData(path: string): unknown | Promise<unknown>;
    push(path: string, value: unknown, overwrite?: boolean): unknown | Promise<unknown>;
    exists?(path: string): boolean | Promise<boolean>;
}

export function goalId(value?: string): string {
    if (value != null && typeof value !== 'string') throw new Error('Goal ID must be text');
    const normalized = (value?.trim() || 'default').toLowerCase().replace(/\s+/g, '_');
    const id = normalized.startsWith('goal_') ? normalized.slice(5) : normalized;
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) {
        throw new Error('Goal ID must contain 1–64 letters, numbers, hyphens or underscores after the goal_ prefix and start with a letter or number. Spaces become underscores.');
    }
    return `goal_${id}`;
}

export function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }

/** Serializes read/modify/write operations and retains the original /goal as a migration backup. */
export class GoalStore {
    private pending: Promise<unknown> = Promise.resolve();
    private initialization?: Promise<void>;
    constructor(readonly db: GoalDatabase) { }

    async read<T>(path: string): Promise<T | undefined> {
        if (this.db.exists && !await this.db.exists(path)) return undefined;
        try { return clone(await this.db.getData(path)) as T; }
        catch (error) {
            if ((error as { id?: number }).id === 5) return undefined;
            throw error;
        }
    }

    transaction<T>(work: () => Promise<T>): Promise<T> {
        const task = this.pending.then(work);
        this.pending = task.catch(() => undefined);
        return task;
    }

    async drain(): Promise<void> { await this.pending; }

    initialize(): Promise<void> {
        if (!this.initialization) {
            this.initialization = this.transaction(async () => {
                const version = await this.read<number>('/schemaVersion') || 0;
                if (version >= 4) return;
                const saved = await this.read<Record<string, GoalState>>('/goals') || {};
                const goals = clone(saved);
                const legacy = version < 2 ? await this.read<GoalState>('/goal') : undefined;
                if (legacy && !Object.keys(goals).some(id => goalId(id) === goalId())) {
                    const migrated = clone(legacy);
                    migrated.goalId = 'default';
                    if (migrated.config) {
                        migrated.config.goalId = 'default';
                        // Legacy automatic writes were implicit. They now require explicit opt-in.
                        if (migrated.config.streamElements) migrated.config.streamElements.autoReset = false;
                    }
                    goals.default = migrated;
                }
                const normalized: Record<string, GoalState> = {};
                const origins = new Map<string, string>();
                let renamed = false;
                for (const [oldId, state] of Object.entries(goals)) {
                    const id = goalId(oldId);
                    if (origins.has(id)) {
                        throw new Error(`Saved Goal IDs '${origins.get(id)}' and '${oldId}' both normalize to '${id}'. Rename one using the previous script version before upgrading. Saved goals have not been changed.`);
                    }
                    origins.set(id, oldId);
                    renamed = renamed || oldId !== id;
                    normalized[id] = { ...state, goalId: id, ...(state.config ? { config: { ...state.config, goalId: id } } : {}) };
                }
                // Preserve exact pre-normalization records; detect collisions before writing anything.
                const backupPath = '/goalIdMigrationBackups/v4';
                if (renamed && !await this.read(backupPath)) await this.db.push(backupPath, saved, true);
                await this.db.push('/goals', normalized, true);
                await this.db.push('/schemaVersion', 4, true);
            }).catch(error => { this.initialization = undefined; throw error; });
        }
        return this.initialization;
    }

    async get(id = 'default'): Promise<GoalState | undefined> {
        await this.initialize();
        return this.read<GoalState>(`/goals/${goalId(id)}`);
    }

    async list(): Promise<GoalState[]> {
        await this.initialize();
        return Object.values(await this.read<Record<string, GoalState>>('/goals') || {});
    }

    async update<T>(id: string, edit: (current: GoalState | undefined) => { state: GoalState; result: T }): Promise<T> {
        await this.initialize();
        return this.transaction(async () => {
            const key = goalId(id);
            const current = await this.read<GoalState>(`/goals/${key}`);
            const { state, result } = edit(current);
            state.goalId = key;
            if (state.config) state.config.goalId = key;
            state.updatedAt = new Date().toISOString();
            await this.db.push(`/goals/${key}`, state, true);
            return result;
        });
    }
}
