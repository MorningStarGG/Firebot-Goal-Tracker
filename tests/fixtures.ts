import { goalTrackerEffectType } from '../src/effects/goal';
import { buildGoalConfig } from '../src/utility/configuration';
import { EffectModel } from '../src/types/types';

export function makeEffect(id = 'default'): EffectModel {
    const scope = { effect: {} as EffectModel };
    (goalTrackerEffectType().optionsController as any)(scope, {});
    scope.effect.goalId = id;
    scope.effect.startDate = new Date(2026, 9, 1);
    scope.effect.startTime = new Date(1970, 0, 1, 0);
    scope.effect.endDate = new Date(2027, 9, 1);
    scope.effect.endTime = new Date(1970, 0, 1, 0);
    scope.effect.position = 'Top Left';
    return scope.effect;
}

export function makeConfig(id = 'default') {
    return buildGoalConfig(makeEffect(id), (path: string) => path);
}
