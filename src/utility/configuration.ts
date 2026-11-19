
import { EffectModel, GoalTrackerConfig } from '../types/types';
import { goalId } from './goal-store';
import { goalLogic } from '../shared/goal-logic';

export function localDate(value: string | Date): string {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) throw new Error('Invalid date');
        return value;
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error('Invalid date');
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function localTime(value: string | Date): string {
    if (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return value;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error('Invalid time');
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function validateEffect(effect: EffectModel): void {
    goalId(effect.goalId);
    const errors = [...goalLogic.widgetSizingErrors(effect.widgetWidth, effect.widgetScale, effect.autoWidgetWidth),
    ...(String(effect.position).toLowerCase() === 'custom' ? [] : goalLogic.widgetGapErrors(effect.overlayGaps))];
    if (errors.length) throw new Error(errors.join('; '));
    if (!Number.isFinite(Number(effect.donationGoal)) || goalLogic.round(Number(effect.donationGoal)) <= 0) throw new Error('Goal amount must be finite and at least 0.01');
    const start = new Date(`${localDate(effect.startDate)}T${localTime(effect.startTime)}`);
    const end = new Date(`${localDate(effect.endDate)}T${localTime(effect.endTime)}`);
    if (end <= start) throw new Error('End date/time must be after the start');
    for (const milestone of effect.milestones || []) {
        if (!Number.isFinite(Number(milestone.amount)) || goalLogic.round(Number(milestone.amount)) <= 0) throw new Error('Milestone amounts must be finite and at least 0.01');
    }
    if (effect.extraLife?.useExtraLife && !/^\d+$/.test(effect.extraLife.participantId || '')) throw new Error('Extra Life Participant ID must contain only digits');
    if (!effect.extraLife?.useExtraLife && effect.streamElements?.useStreamElements) {
        const se = effect.streamElements;
        if (!/^[a-f0-9]{24}$/i.test(se.channelId) || !se.jwtToken?.trim()) throw new Error('A valid StreamElements Account ID and JWT Token are required');
        for (const amount of [se.bitsValue, ...Object.values(se.subscriptionValues)]) {
            if (!Number.isFinite(Number(amount)) || Number(amount) < 0) throw new Error('Bits and subscription values must be finite and nonnegative');
        }
    }
}

/** The configured palette is authoritative; HTML values are only rendering fallbacks. */
export function normalizeConfig(config: GoalTrackerConfig): GoalTrackerConfig {
    config.goalId = goalId(config.goalId);
    config.display = {
        ...config.display,
        fixedSectionWidths: goalLogic.fixedSectionWidths(config.display),
        infoSection: { ...config.display.infoSection },
        sizing: goalLogic.widgetSizing(config.display.sizing?.width, config.display.sizing?.scale, config.display.sizing?.autoWidth),
        gaps: goalLogic.widgetGaps(config.display.gaps)
    };
    delete config.display.infoSection.fixedWidth;
    config.donationGoal = goalLogic.round(Number(config.donationGoal));
    config.content.milestones = (config.content.milestones || []).map(item => ({ title: String(item.title || ''), amount: goalLogic.round(Number(item.amount)) })).sort((a, b) => a.amount - b.amount);
    config.extraLife = { ...config.extraLife, dataPollInterval: Math.max(30, goalLogic.number(config.extraLife.dataPollInterval, 60)) };
    config.streamElements = {
        ...config.streamElements,
        useStreamElements: !config.extraLife.useExtraLife && config.streamElements.useStreamElements,
        channelId: (config.streamElements.channelId || '').trim().toLowerCase(),
        autoReset: config.streamElements.autoReset === true,
        summaryType: config.streamElements.summaryType === 'weekly' ? 'weekly' : 'monthly',
        pollInterval: Math.max(30, goalLogic.number(config.streamElements.pollInterval, 60)),
        bitsValue: Number(config.streamElements.bitsValue),
        subscriptionValues: Object.fromEntries(Object.entries(config.streamElements.subscriptionValues).map(([tier, value]) => [tier, Number(value)])) as GoalTrackerConfig['streamElements']['subscriptionValues']
    };
    // Ignore the former independent reset setting in previously saved effect configurations.
    delete (config.streamElements as typeof config.streamElements & { resetSchedule?: unknown }).resetSchedule;
    config.timing = { ...config.timing };
    for (const key of Object.keys(config.timing) as Array<keyof GoalTrackerConfig['timing']>) {
        const minimum = key === 'transition' ? 0 : 1;
        const parsed = Number(config.timing[key]);
        config.timing[key] = Number.isFinite(parsed) ? Math.max(minimum, parsed) : key === 'dataPollInterval' ? 60 : 5;
    }
    const extraLifeTheme = goalLogic.extraLifeTheme();
    config.content.templates.default.animation = {
        ...config.content.templates.default.animation,
        ...goalLogic.animationBackgrounds(config.content.templates.default.animation)
    };
    config.content.templates.extraLife.colors = extraLifeTheme.colors;
    config.content.templates.extraLife.animation = config.extraLife.useExtraLifeColors
        ? { ...extraLifeTheme.animation, ...goalLogic.animationBackgrounds(config.content.templates.default.animation, true) }
        : { ...config.content.templates.default.animation };
    return config;
}

export function buildGoalConfig(effect: EffectModel, createResourceToken: (path: string) => string): GoalTrackerConfig {
    const config: GoalTrackerConfig = {
        goalId: goalId(effect.goalId),
        streamInfo: {
            startDate: localDate(effect.startDate),
            startTime: localTime(effect.startTime),
            endDate: localDate(effect.endDate),
            endTime: localTime(effect.endTime)
        },
        donationGoal: effect.donationGoal,
        mode: {
            useMilestonesAsGoals: effect.useMilestonesAsGoals,
            milestoneCycle: effect.milestoneCycle,
            milestoneCycleMode: effect.milestoneCycleMode,
            showCompletedMilestones: effect.showCompletedMilestones,
            infoSectionCycle: effect.infoSectionCycle,
            showInfoSection: effect.showInfoSection,
            separateInfoColors: effect.separateInfoColors,
            showDonationAnimation: effect.showDonationAnimation,
            showLogoAnimation: effect.showLogoAnimation,
            showDonationTimestamp: effect.showDonationTimestamp,
            useCustomLargestMessage: effect.useCustomLargestMessage,
            useCustomRecentMessage: effect.useCustomRecentMessage,
            largestDonationTieMode: effect.largestDonationTieMode
        },
        display: { ...effect.display, sizing: goalLogic.widgetSizing(effect.widgetWidth, effect.widgetScale, effect.autoWidgetWidth), gaps: goalLogic.widgetGaps(effect.overlayGaps) },
        content: {
            milestones: effect.milestones,
            templates: {
                extraLife: {
                    titles: effect.templates.titles,
                    donations: effect.templates.donations,
                    ...goalLogic.extraLifeTheme()
                },
                default: {
                    titles: effect.templates.titles,
                    donations: effect.templates.donations,
                    colors: effect.templates.colors,
                    animation: effect.templates.animation
                }
            },
            branding: {
                logo: {
                    extraLife: {
                        src: "", // The overlay contains the built-in Extra Life SVG.
                        alt: "Extra Life Logo",
                        styles: {
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                            padding: "0",
                            background: "none"
                        }
                    },
                    default: {
                        resourcePath: effect.defaultLogoPath || undefined,
                        src: effect.defaultLogoPath ?
                            createResourceToken(effect.defaultLogoPath) : "",
                        alt: "Stream Logo",
                        styles: {
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                            padding: "0",
                            background: "none"
                        }
                    }
                }
            }
        },
        timing: effect.timing,
        extraLife: effect.extraLife,
        streamElements: effect.streamElements,
        position: effect.position || 'Middle',
        customCoords: effect.customCoords || {
            top: null,
            bottom: null,
            left: null,
            right: null
        }
    };


    config.display = { ...config.display, progressBar: { ...config.display.progressBar, opacity: Math.max(0, Math.min(1, goalLogic.number(effect.progressBarOpacity, 1))) } };
    return normalizeConfig(config);
}
