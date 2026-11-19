import { goalLogic as logic } from '../src/shared/goal-logic';

test('uses the same numeric and milestone rules in both runtimes', () => {
    const milestones = [{ title: 'Second', amount: 500 }, { title: 'Invalid', amount: NaN }, { title: 'First', amount: 250 }];
    expect(logic.activeGoal(1000, 250, milestones, true)).toBe(500);
    expect(logic.activeGoal(1000, 500, milestones, true)).toBe(1000);
    expect(logic.percentage(1250, 1000)).toBe(125);
    expect(logic.percentage(0, 0)).toBe(0);
    expect(logic.money(123.456789)).toBe('123.46');
    expect(logic.add(0.1, 0.2)).toBe(0.3);
    for (const bad of [NaN, Infinity, undefined, 'abc', 1e308]) expect(() => logic.round(bad as number)).toThrow();
});

test('preserves the next eligible stop after the displayed milestone completes', () => {
    expect(logic.cycleKey('a', ['main', 'a', 'b'], ['main', 'b'], false)).toBe('b');
    expect(logic.cycleKey('b', ['main', 'b'], ['main', 'b'], true)).toBe('main');
    expect(logic.cycleKey('a', ['main', 'a', 'b'], ['main'], false)).toBe('main');
});
