import template from './goal-tracker.html';
import { createGoalLogic } from '../shared/goal-logic';
import { connectGoalDocument } from './widget-layout';

export function renderOverlayDocument(): string {
    const script = `const CONFIG = __GOAL_CONFIG__;
        const INSTANCE = __GOAL_INSTANCE__;
        const GoalLogic = (${createGoalLogic.toString()})();
        const GoalLayout = (${connectGoalDocument.toString()})(CONFIG, INSTANCE,
            GoalLogic.widgetSizing(CONFIG.display?.sizing?.width, CONFIG.display?.sizing?.scale, CONFIG.display?.sizing?.autoWidth),
            GoalLogic.widgetGaps(CONFIG.display?.gaps), GoalLogic.widgetSizing().width);`;
    const body = template.replace('const CONFIG = {};', () => script);
    return `<!doctype html><html><head><meta charset="utf-8"><style>
        html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent!important}
        </style></head><body><div id="goal-tracker" class="position-wrapper">${body}</div></body></html>`;
}
