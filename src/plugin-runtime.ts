import firebot from '@crowbartools/firebot-types';
import path from 'node:path';
import { manifest } from './manifest';
import { logger } from './logger';
import { createGoalManager, disposeGoalManager, goalManager, GoalManager } from './utility/goal-manager';
import { goalId } from './utility/goal-store';
import { openPluginDatabase } from './utility/plugin-database';
import type { GoalOverlayEvent, GoalTrackerConfig } from './types/types';

type OverlaySender = (event: GoalOverlayEvent, overlayInstance?: string) => void;
const senders = new Map<string, { uuid: string; send: OverlaySender }>();
const operations = new Set<Promise<unknown>>();
let initializing: Promise<void> | undefined;
let preparing: Promise<void> | undefined;
let unloading: Promise<void> | undefined;
let closing = false;

/** Runs before registrations, so failures cannot overwrite another installation's definitions. */
export function prepareRuntime(): Promise<void> {
    if (closing) return Promise.reject(new Error('Goal Tracker plugin is unloading'));
    if (!preparing) preparing = (async () => {
        const ownId = path.basename(firebot.storage.path);
        const installed = await firebot.plugins.getInstalledPlugins();
        const duplicate = installed.find(plugin => plugin.config.id !== ownId && plugin.config.enabled !== false &&
            plugin.details.manifest.name === manifest.name && plugin.details.manifest.author === manifest.author);
        if (duplicate) throw new Error('Another Advanced Goal Tracker installation is enabled. Update the existing plugin entry, or disable the older copy first.');
        const db = await openPluginDatabase(firebot.storage.path);
        if (closing) throw new Error('Goal Tracker plugin is unloading');
        createGoalManager(db, (event, overlay) => {
            senders.get(event.goalId)?.send(event, overlay);
            if (event.type === 'remove' && !goalManager?.isActive(event.goalId)) senders.delete(event.goalId);
        });
    })().catch(async error => {
        await disposeGoalManager();
        senders.clear();
        preparing = undefined;
        throw error;
    });
    return preparing;
}

/** Start background maintenance only after Firebot has completed registration. */
export function initializeRuntime(): Promise<void> {
    if (closing) return Promise.reject(new Error('Goal Tracker plugin is unloading'));
    if (!initializing) initializing = (async () => {
        await prepareRuntime();
        if (closing || !goalManager) throw new Error('Goal Tracker plugin is unloading');
        await goalManager.initialize();
        if (closing) throw new Error('Goal Tracker plugin is unloading');
        logger.info('Advanced Goal Tracker plugin loaded; saved goals remain idle until their effects run.');
    })().catch(async error => {
        await disposeGoalManager();
        senders.clear();
        preparing = undefined;
        initializing = undefined;
        throw error;
    });
    return initializing;
}

export async function runGoalOperation<T>(operation: (manager: GoalManager) => Promise<T>): Promise<T> {
    await initializeRuntime();
    if (closing || !goalManager) throw new Error('Goal Tracker plugin is unloading');
    const current = goalManager;
    const task = Promise.resolve().then(() => operation(current));
    operations.add(task);
    try { return await task; }
    finally { operations.delete(task); }
}

export function activateGoal(config: GoalTrackerConfig, overlay: string, uuid: string, send: OverlaySender): Promise<void> {
    return runGoalOperation(async manager => {
        if (typeof send !== 'function') throw new Error('Firebot did not provide an overlay sender');
        const id = goalId(config.goalId);
        const previous = senders.get(id);
        const entry = { uuid, send };
        senders.set(id, entry);
        try { await manager.activate(config, overlay, uuid); }
        catch (error) {
            if (senders.get(id) === entry) {
                if (previous) senders.set(id, previous); else senders.delete(id);
            }
            throw error;
        }
    });
}

export function unloadRuntime(): Promise<void> {
    if (unloading) return unloading;
    closing = true;
    goalManager?.stop();
    unloading = (async () => {
        try {
            await Promise.allSettled([preparing, initializing].filter(Boolean));
            while (operations.size) await Promise.allSettled(operations);
            await disposeGoalManager();
        } finally {
            senders.clear();
            initializing = undefined;
            preparing = undefined;
            closing = false;
            unloading = undefined;
        }
    })();
    return unloading;
}
