import { GoalDatabase } from '../src/utility/goal-store';
import { GoalState } from '../src/types/types';

export class MemoryDatabase implements GoalDatabase {
    data: Record<string, any>;
    constructor(data: Record<string, any> = {}) { this.data = data; }
    async exists(path: string) { return this.lookup(path) !== undefined; }
    lookup(path: string): any { return path.split('/').filter(Boolean).reduce((value, key) => value?.[key], this.data); }
    async getData(path: string) {
        const value = this.lookup(path);
        if (value === undefined) throw Object.assign(new Error('Missing path'), { id: 5 });
        return JSON.parse(JSON.stringify(value));
    }
    async push(path: string, value: unknown) {
        const parts = path.split('/').filter(Boolean);
        let target = this.data;
        for (const part of parts.slice(0, -1)) target = target[part] ||= {};
        target[parts[parts.length - 1]] = JSON.parse(JSON.stringify(value));
    }
}

export function state(id: string): GoalState {
    return { goalId: id, uuid: id, config: { goalId: id } as any, overlayInstance: '', createdAt: '', updatedAt: '' };
}

