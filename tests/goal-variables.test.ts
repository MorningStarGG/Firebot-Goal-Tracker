jest.mock('../src/utility/goal-manager', () => ({ goalManager: { getGoalData: jest.fn(), getLocalDonations: jest.fn() } }));
import { goalManager } from '../src/utility/goal-manager';
import { goalInfoVariable, goalMilestonesVariable, goalDonationCheckVariable } from '../src/variables/goal-variables';
import { makeConfig } from './fixtures';
import { GoalState } from '../src/types/types';

let state: GoalState;
const evaluate = (variable: any, ...params: string[]) => variable.evaluator({}, ...params);
beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 23, 12));
    const config = makeConfig('charity');
    config.donationGoal = 1000;
    config.streamInfo = { startDate: '2026-10-23', startTime: '10:00', endDate: '2026-10-23', endTime: '14:05' };
    config.content.templates.default.donations = { ...config.content.templates.default.donations, currencySymbol: '£' };
    config.content.templates.extraLife.donations = { ...config.content.templates.extraLife.donations, currencySymbol: '€' };
    state = { goalId: 'charity', uuid: 'one', config, overlayInstance: '', createdAt: '', updatedAt: '', localDonations: { data: { donations: [], overall_total: { amount: 1250, donation_count: 0 }, metadata: { lastUpdated: '' } } } };
    (goalManager.getGoalData as jest.Mock).mockResolvedValue(state);
});
afterEach(() => jest.useRealTimers());

test('selects goals without breaking legacy options, uses the selected currency and shows overfunding', async () => {
    expect(await evaluate(goalInfoVariable, 'id=charity')).toBe('£1250/£1000 (125%)');
    expect(goalManager.getGoalData).toHaveBeenLastCalledWith('goal_charity');
    expect(await evaluate(goalInfoVariable, 'amount')).toBe('£1250');
    expect(goalManager.getGoalData).toHaveBeenLastCalledWith('goal_default');
    state.config.extraLife.useExtraLife = true;
    state.extraLife = { lastUpdated: '', data: { sumDonations: 12.345, fundraisingGoal: 100, donations: [], metadata: { participantId: '1', eventID: '2', lastUpdated: '' } } };
    expect(await evaluate(goalInfoVariable, 'amount', 'id=charity')).toBe('€12.35');
});

test('time options work case-insensitively with actual output and combination validation', async () => {
    expect(await evaluate(goalInfoVariable, 'TIMEcode')).toBe('00:00:00:02:05:00');
    expect(await evaluate(goalInfoVariable, 'timeFormatted')).toBe('2 hours, 5 minutes');
    expect(await evaluate(goalInfoVariable, 'time', 'zeroHours', 'ZEROMINUTES')).toBe('02h 05m');
    expect(await evaluate(goalInfoVariable, 'timeCode', 'amount')).toContain('cannot be combined');
});

test('exact hits advance, completed milestones remain available, and navigation works after the last hit', async () => {
    state.localDonations!.data.overall_total.amount = 250;
    state.config.content.milestones = [{ title: 'First', amount: 250 }, { title: 'Second', amount: 500 }];
    state.config.mode.useMilestonesAsGoals = true;
    expect(await evaluate(goalInfoVariable, 'goal')).toBe('£500');
    expect(await evaluate(goalMilestonesVariable, 'next', 'name')).toBe('Second');
    expect(await evaluate(goalMilestonesVariable, 'previous', 'name')).toBe('First');
    expect(await evaluate(goalMilestonesVariable, 'all', 'name')).toBe('First | Second');
    state.localDonations!.data.overall_total.amount = 500;
    expect(await evaluate(goalInfoVariable, 'goal')).toBe('£1000');
    expect(await evaluate(goalMilestonesVariable, 'previous', 'name')).toBe('Second');
});

test('donation checks target the requested local goal and reject malformed numbers', async () => {
    (goalManager.getLocalDonations as jest.Mock).mockResolvedValue({ data: { donations: [{ name: 'Alice', individual_donations: [{ amount: 5 }] }] } });
    expect(await evaluate(goalDonationCheckVariable, 'Alice', '5', 'charity')).toBe(true);
    expect(goalManager.getLocalDonations).toHaveBeenLastCalledWith('goal_charity');
    expect(await evaluate(goalDonationCheckVariable, 'Alice', '5garbage', 'charity')).toBe(false);
});

test('all variable selectors use the same lowercase and space normalization', async () => {
    await evaluate(goalInfoVariable, 'amount', 'id=Monthly Support');
    expect(goalManager.getGoalData).toHaveBeenLastCalledWith('goal_monthly_support');
    await evaluate(goalMilestonesVariable, 'all', 'id=GOAL_MONTHLY   SUPPORT');
    expect(goalManager.getGoalData).toHaveBeenLastCalledWith('goal_monthly_support');
    (goalManager.getLocalDonations as jest.Mock).mockResolvedValue(undefined);
    await evaluate(goalDonationCheckVariable, 'Alice', '5', ' ID=Monthly Support ');
    expect(goalManager.getLocalDonations).toHaveBeenLastCalledWith('goal_monthly_support');
});
