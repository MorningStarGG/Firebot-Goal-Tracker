import type { Plugin } from '@crowbartools/firebot-types';
import { manifest } from './manifest';
import { goalTrackerEffectType } from './effects/goal';
import { goalTrackerManagerEffectType } from './effects/goalManager';
import { prepareRuntime, initializeRuntime, unloadRuntime } from './plugin-runtime';
import { goalManager } from './utility/goal-manager';
import { goalId } from './utility/goal-store';
import { renderOverlayDocument } from './overlay/render-overlay';
import * as goalVariables from './variables/goal-variables';

const plugin: Plugin = {
    manifest,
    parametersSchema: [],
    registers: {
        effects: [
            async () => { await prepareRuntime(); return goalTrackerEffectType(); },
            () => goalTrackerManagerEffectType(),
        ],
        variables: Object.values(goalVariables),
        frontendListeners: [{
            eventName: 'msgg:goal-tracker-list',
            useAsync: true,
            handler: async (selection: unknown) => {
                await initializeRuntime();
                return {
                    selectedGoalId: goalId(typeof selection === 'string' ? selection : undefined),
                    goals: await Promise.all((await goalManager.store.list()).map(async goal => ({
                        goalId: goal.goalId,
                        active: goalManager.isActive(goal.goalId),
                        reset: goal.config?.streamElements?.useStreamElements
                            ? await goalManager.resets.state(goal.config.streamElements.channelId) : undefined,
                    }))),
                };
            },
        }],
        httpRoutes: {
            prefix: 'goal-tracker',
            routes: [{
                path: '/goal-tracker.html',
                method: 'GET',
                handler: (_request, response) => {
                    response.setHeader('content-type', 'text/html');
                    response.end(renderOverlayDocument());
                },
            }],
        },
    },
    onLoad: () => initializeRuntime(),
    onUnload: () => unloadRuntime(),
};

export default plugin;
