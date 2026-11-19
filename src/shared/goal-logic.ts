/** Pure presentation rules, also embedded in each browser document by render-overlay. */
export function createGoalLogic() {
    const defaultWidgetWidth = 475;
    function number(value: unknown, fallback = 0): number {
        if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) return fallback;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    function round(value: number): number {
        if (!Number.isFinite(value)) throw new Error('Amount must be finite');
        if (Math.abs(value) > Number.MAX_SAFE_INTEGER / 100) throw new Error('Amount exceeds the supported currency range');
        return Math.round((value + Number.EPSILON) * 100) / 100;
    }
    function add(a: number, b: number): number { return round(round(a) + round(b)); }
    function money(value: unknown): string {
        const rounded = round(number(value));
        return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
    }
    function percentage(total: unknown, goal: unknown): number {
        const target = number(goal);
        return target > 0 ? Math.max(0, Math.round(number(total) / target * 100)) : 0;
    }
    function milestones(items: Array<{ title: string; amount: number }> = []) {
        return items.filter(item => number(item.amount, NaN) > 0)
            .map((item, index) => ({ title: String(item.title || ''), amount: number(item.amount), index }))
            .sort((a, b) => a.amount - b.amount);
    }
    function nextMilestone(items: Array<{ title: string; amount: number }>, total: unknown) {
        return milestones(items).find(item => item.amount > number(total)) || null;
    }
    function activeGoal(main: unknown, total: unknown, items: Array<{ title: string; amount: number }>, useMilestones: boolean): number {
        return (useMilestones ? nextMilestone(items, total)?.amount : undefined) || number(main);
    }
    function cycleKey(current: string, previous: string[], available: string[], advance: boolean): string {
        const index = available.indexOf(current);
        if (index >= 0) return available[(index + (advance ? 1 : 0)) % available.length];
        const oldIndex = previous.indexOf(current);
        for (let offset = 1; offset <= previous.length; offset++) {
            const candidate = previous[(oldIndex + offset) % previous.length];
            if (available.includes(candidate)) return candidate;
        }
        return available[0] || 'main';
    }
    function inPeriod(timestamp: string, period: 'all' | 'daily' | 'weekly' | 'monthly', now = new Date()) {
        const date = new Date(timestamp);
        if (!Number.isFinite(date.getTime())) return false;
        if (period === 'all') return true;
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (period === 'weekly') start.setDate(start.getDate() - start.getDay());
        if (period === 'monthly') start.setDate(1);
        return date >= start && date <= now;
    }
    function periodKey(schedule: 'weekly' | 'monthly', now = new Date()): string {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        if (schedule === 'weekly') start.setDate(now.getDate() - now.getDay());
        return `${schedule}:${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    }
    /** Width is layout space; scale is the percentage applied to the entire widget. */
    function widgetSizing(width?: unknown, scale?: unknown, autoWidth?: unknown) {
        return {
            width: Math.max(autoWidth === true ? defaultWidgetWidth : 200, Math.min(3840, number(width, defaultWidgetWidth))),
            scale: Math.max(10, Math.min(300, number(scale, 100))),
            autoWidth: autoWidth === true
        };
    }
    function fixedSectionWidths(display: { fixedSectionWidths?: unknown; infoSection?: { fixedWidth?: unknown } }) {
        return (display.fixedSectionWidths ?? display.infoSection?.fixedWidth) === true;
    }
    function widgetGaps(gaps?: { top?: unknown; bottom?: unknown; left?: unknown; right?: unknown }) {
        const gap = (value: unknown) => Math.max(0, Math.min(3840, number(value)));
        return { top: gap(gaps?.top), bottom: gap(gaps?.bottom), left: gap(gaps?.left), right: gap(gaps?.right) };
    }
    function widgetGapErrors(gaps?: { top?: unknown; bottom?: unknown; left?: unknown; right?: unknown }): string[] {
        const normalized = widgetGaps(gaps);
        return (['top', 'bottom', 'left', 'right'] as const).filter(edge => gaps?.[edge] != null && Number(gaps[edge]) !== normalized[edge])
            .map(edge => `${edge[0].toUpperCase()}${edge.slice(1)} Gap must be between 0 and 3840 pixels`);
    }
    function widgetSizingErrors(width?: unknown, scale?: unknown, autoWidth?: unknown): string[] {
        const sizing = widgetSizing(width, scale, autoWidth);
        const errors: string[] = [];
        if (width != null && Number(width) !== sizing.width) errors.push(`Widget Width must be between ${autoWidth === true ? defaultWidgetWidth : 200} and 3840 pixels`);
        if (scale != null && Number(scale) !== sizing.scale) errors.push('Widget Scale must be between 10 and 300 percent');
        return errors;
    }
    function animationBackgroundStyle(value: unknown, fallback: 'none' | 'gradient' = 'gradient'): 'none' | 'solid' | 'gradient' | 'centered' {
        return value === 'none' || value === 'solid' || value === 'centered' || value === 'gradient' ? value : fallback;
    }
    function animationBackgrounds(animation: {
        animationBackgroundStyle?: unknown; animationBackgroundColorOne?: string; animationBackgroundColorTwo?: string;
        headerBackground?: { style?: unknown; colorOne?: string; colorTwo?: string };
        subheaderBackground?: { style?: unknown; colorOne?: string; colorTwo?: string };
    }, extraLifeColors = false) {
        const resolve = (panel: typeof animation.headerBackground, fallback: 'none' | 'gradient') => ({
            style: animationBackgroundStyle(panel?.style ?? animation.animationBackgroundStyle, fallback),
            colorOne: extraLifeColors ? '#1B2838' : panel?.colorOne || animation.animationBackgroundColorOne || '#111111',
            colorTwo: extraLifeColors ? '#2A475E' : panel?.colorTwo || animation.animationBackgroundColorTwo || '#1a1a1a'
        });
        return { headerBackground: resolve(animation.headerBackground, 'none'), subheaderBackground: resolve(animation.subheaderBackground, 'gradient') };
    }
    function animationBackgroundCSS(background: { style: string; colorOne: string; colorTwo: string }) {
        if (background.style === 'none') return 'none';
        if (background.style === 'solid') return background.colorOne;
        if (background.style === 'gradient') return `linear-gradient(135deg, ${background.colorOne}, ${background.colorTwo})`;
        return `linear-gradient(90deg, ${background.colorOne} 0%, ${background.colorTwo} 50%, ${background.colorOne} 100%)`;
    }
    /** Authoritative palette for new configurations and older saved overlay payloads. */
    function extraLifeTheme() {
        return {
            colors: {
                progressColor: '#00B4FF', trackColor: 'rgba(27, 40, 56, 0.95)',
                goalColor: '#ffffff', milestoneColor: '#ffffff',
                progressBoxColorOne: '#1B2838', progressBoxColorTwo: '#2A475E', goalTitleColor: '#e3e3e3',
                countdownBackgroundColorOne: '#1B2838', countdownBackgroundColorTwo: '#2A475E',
                countdownTitleColor: 'rgba(227, 227, 227, 0.95)', countdownTimeBackground: 'rgba(0, 180, 255, 0.95)',
                countdownTimeColor: '#ffffff', countdownTimeShadow: '0 0 20px rgba(0, 180, 255, 0.3)',
                infoSectionBackgroundColorOne: '#1B2838', infoSectionBackgroundColorTwo: '#2A475E',
                donorTextColor: '#e3e3e3', largestTextColor: '#e3e3e3', additionalTextColor: '#e3e3e3',
                infoDonorBackground: 'rgba(255, 255, 255, 0.03)', infoLargestBackground: 'rgba(255, 255, 255, 0.02)',
                infoAdditionalBackground: 'rgba(255, 255, 255, 0.03)', infoBorderColor: 'rgba(227, 227, 227, 0.1)'
            },
            animation: {
                animationHighlight: '#00B4FF', animationBorder: '#00B4FF', animationText: '#ffffff',
                animationShadow: '0 2px 4px rgba(0, 180, 255, 0.2)',
                animationBackgroundColorOne: '#1B2838', animationBackgroundColorTwo: '#2A475E'
            }
        };
    }
    return { number, round, add, money, percentage, milestones, nextMilestone, activeGoal, cycleKey, inPeriod, periodKey, widgetSizing, fixedSectionWidths, widgetSizingErrors, widgetGaps, widgetGapErrors, animationBackgroundStyle, animationBackgrounds, animationBackgroundCSS, extraLifeTheme };
}

export const goalLogic = createGoalLogic();
