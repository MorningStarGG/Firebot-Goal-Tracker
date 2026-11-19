import { createGoalLogic } from '../shared/goal-logic';

/**
 * Firebot serializes settings callbacks and evaluates them in its renderer without module closures.
 * Embed the self-contained rules factory inside the callback source. Explicit argument names retain
 * Angular's service injection contract; the authored callback receives rules as its first parameter.
 * Return an arrow expression: Firebot uses bare eval(source), which returns undefined for a function declaration.
 */
export function withRendererRules<Args extends unknown[], Result>(parameters: string[], callback: (rules: ReturnType<typeof createGoalLogic>, ...args: Args) => Result): (...args: Args) => Result {
    return new Function(
        `return (${parameters.join(',')}) => (${callback.toString()})((${createGoalLogic.toString()})()${parameters.map(name => `, ${name}`).join('')});`
    )() as (...args: Args) => Result;
}
