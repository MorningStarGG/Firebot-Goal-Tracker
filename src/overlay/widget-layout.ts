/** Serialized into each iframe: positioning stays unscaled; only the widget contents are zoomed. */
export function connectGoalDocument(config: any, instance: { goalId: string; uuid: string }, sizing: { width: number; scale: number; autoWidth: boolean }, gaps: { top: number; bottom: number; left: number; right: number }, defaultWidth: number) {
    const wrapper = document.getElementById('goal-tracker')!;
    const content = wrapper.querySelector<HTMLElement>('.goalTrackerOverlay')!;
    const widget = content.querySelector<HTMLElement>('.goalWidget')!;
    const fixedSections = sizing.autoWidth && config.display.fixedSectionWidths === true;
    widget.classList.toggle('fixed-section-widths', fixedSections);
    const title = document.getElementById('progressTitle')!;
    const labels = document.getElementById('progressLabels')!;
    const milestone = document.getElementById('milestoneLabel')!;
    const amount = document.getElementById('donationStatus')!;
    const time = document.getElementById('timeRemaining')!;
    const countdownTitle = document.getElementById('countdownTitle')!;
    const countdownBody = content.querySelector<HTMLElement>('.countdown-content')!;
    const preferredFonts = new Map([title, milestone, amount, time, countdownTitle].map(node => [node, parseFloat(getComputedStyle(node).fontSize)]));
    const position = String(config.position || 'Middle').toLowerCase();
    const custom = position === 'custom' ? config.customCoords || {} : {};
    const x = position.includes('left') ? 0 : position.includes('right') ? 1 : 0.5;
    const y = position.includes('top') ? 0 : position.includes('bottom') ? 1 : 0.5;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const measure = document.createElement('canvas').getContext('2d')!;
    let zoom = 1;
    let pending = false;
    let currentWidth = sizing.width;
    let targetWidth = sizing.width;
    let fromWidth = sizing.width;
    let animationStart: number | undefined;
    let initialized = false;
    let planDirty = true;
    let widgetPadding = 0;
    let labelPadding = 0;
    let labelGap = 0;
    let countdownLayout: boolean | undefined;

    wrapper.style.position = 'absolute';
    wrapper.style.setProperty('--goal-width', `${currentWidth}px`);
    if (position === 'custom') {
        for (const edge of ['top', 'bottom', 'left', 'right']) {
            const value = custom[edge];
            if (typeof value === 'number' && Number.isFinite(value)) (wrapper.style as any)[edge] = `${value}px`;
        }
    } else {
        wrapper.style.transform = `translate(${-x * 100}%, ${-y * 100}%)`;
    }

    const horizontalPadding = (node: HTMLElement) => {
        const style = getComputedStyle(node);
        return (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    };

    function textWidth(node: HTMLElement, value = node.textContent || '', fontSize = preferredFonts.get(node)) {
        const style = getComputedStyle(node);
        const text = value.replace(/\s+/g, ' ').trim();
        const size = fontSize || parseFloat(style.fontSize);
        // Measure the complete text at its preferred size, independently of current width/ellipsis.
        measure.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
        return measure.measureText(text).width + Math.max(0, text.length - 1) * (parseFloat(style.letterSpacing) || 0);
    }

    function desiredWidth(amountText: string, milestoneText: string) {
        if (!sizing.autoWidth) return sizing.width;
        let width = widgetPadding + labelPadding + labelGap + textWidth(milestone, milestoneText) + textWidth(amount, amountText) + 2;
        // A countdown that follows the bar may increase its minimum width to fit the time.
        const countdown = content.querySelector<HTMLElement>('.countdown')!;
        if (!fixedSections && getComputedStyle(countdown).display !== 'none' && !countdown.classList.contains('roll-hidden')) {
            const time = document.getElementById('timeRemaining')!;
            const body = content.querySelector<HTMLElement>('.countdown-content')!;
            width = Math.max(width, widgetPadding + horizontalPadding(body) + horizontalPadding(time) + textWidth(time) + 2);
        }
        return Math.max(defaultWidth, Math.min(sizing.width, Math.ceil(width)));
    }

    function fittedFont(node: HTMLElement, value: string, available: number) {
        const preferred = preferredFonts.get(node)!;
        // Measure against the destination width without changing the visible DOM or forcing layout.
        const room = Math.max(0, available - 1);
        if (textWidth(node, value, preferred) <= room) return preferred;
        let low = Math.min(16, preferred), high = preferred;
        if (textWidth(node, value, low) > room) return low;
        while (high - low > 0.25) {
            const middle = (low + high) / 2;
            if (textWidth(node, value, middle) <= room) low = middle;
            else high = middle;
        }
        return low;
    }

    function applyFont(node: HTMLElement, value: string, size: number) {
        const font = `${size}px`;
        if (node.style.fontSize !== font) node.style.fontSize = font;
        if (node.title !== value) node.title = value;
    }

    function prepareText(amountText = amount.textContent || '', milestoneText = milestone.textContent || '') {
        widgetPadding = horizontalPadding(widget);
        wrapper.style.setProperty('--goal-section-width', `${Math.max(0, defaultWidth - widgetPadding)}px`);
        labelPadding = horizontalPadding(labels);
        labelGap = milestoneText ? parseFloat(getComputedStyle(labels).columnGap) || 0 : 0;
        const desired = desiredWidth(amountText, milestoneText);
        if (!initialized || motion.matches || !sizing.autoWidth) {
            currentWidth = targetWidth = desired;
            animationStart = undefined;
        } else if (Math.abs(desired - targetWidth) > 0.25) {
            fromWidth = currentWidth;
            targetWidth = desired;
            animationStart = performance.now();
        }
        const available = Math.max(0, desired - widgetPadding - labelPadding - labelGap);
        const amountFont = fittedFont(amount, amountText, available);
        const amountWidth = Math.min(available, textWidth(amount, amountText, amountFont));
        const titleText = title.textContent || '';
        applyFont(amount, amountText, amountFont);
        applyFont(milestone, milestoneText, fittedFont(milestone, milestoneText, available - amountWidth));
        applyFont(title, titleText, fittedFont(title, titleText, desired - widgetPadding - horizontalPadding(title)));
        if (fixedSections) {
            const below = widget.classList.contains('countdown-below');
            if (countdownLayout !== below) {
                // Each countdown position has its own CSS font sizes; capture them once per layout.
                time.style.removeProperty('font-size');
                countdownTitle.style.removeProperty('font-size');
                preferredFonts.set(time, parseFloat(getComputedStyle(time).fontSize));
                preferredFonts.set(countdownTitle, parseFloat(getComputedStyle(countdownTitle).fontSize));
                countdownLayout = below;
            }
            const room = Math.max(0, defaultWidth - widgetPadding - horizontalPadding(countdownBody));
            const timeText = time.textContent || '', heading = countdownTitle.textContent || '';
            applyFont(time, timeText, fittedFont(time, timeText, room - horizontalPadding(time)));
            applyFont(countdownTitle, heading, fittedFont(countdownTitle, heading, room));
        }
        planDirty = false;
    }

    function layout(now: number) {
        pending = false;
        if (planDirty) prepareText();
        if (motion.matches && animationStart != null) {
            currentWidth = targetWidth;
            animationStart = undefined;
        }
        if (animationStart != null) {
            const progress = Math.max(0, Math.min(1, (now - animationStart) / 350));
            const eased = progress * progress * (3 - 2 * progress);
            currentWidth = fromWidth + (targetWidth - fromWidth) * eased;
            if (progress === 1) animationStart = undefined;
        }
        initialized = true;
        wrapper.style.setProperty('--goal-width', `${currentWidth}px`);
        const availableText = currentWidth - widgetPadding - labelPadding - labelGap;
        amount.style.maxWidth = `${Math.max(0, availableText)}px`;

        const offset = (edge: string) => typeof custom[edge] === 'number' && Number.isFinite(custom[edge]) ? Math.max(0, custom[edge]) : 0;
        const viewportWidth = Math.max(1, document.documentElement.clientWidth);
        const viewportHeight = Math.max(1, document.documentElement.clientHeight);
        // On a small viewport, proportionally reduce impossible combined gaps instead of moving offscreen.
        const gapX = Math.min(1, (viewportWidth - 1) / Math.max(1, gaps.left + gaps.right));
        const gapY = Math.min(1, (viewportHeight - 1) / Math.max(1, gaps.top + gaps.bottom));
        const left = position === 'custom' ? offset('left') : gaps.left * gapX;
        const right = position === 'custom' ? offset('right') : gaps.right * gapX;
        const top = position === 'custom' ? offset('top') : gaps.top * gapY;
        const bottom = position === 'custom' ? offset('bottom') : gaps.bottom * gapY;
        const width = Math.max(1, viewportWidth - left - right);
        const height = Math.max(1, viewportHeight - top - bottom);
        const naturalHeight = content.getBoundingClientRect().height / zoom;
        const nextZoom = Math.min(sizing.scale / 100, width / currentWidth, naturalHeight > 0 ? height / naturalHeight : Infinity);
        zoom = nextZoom;
        // Zoom contributes to layout height. The outer width must match its visual width for anchoring.
        wrapper.style.width = `${currentWidth * zoom}px`;
        content.style.setProperty('zoom', String(zoom));
        if (position !== 'custom') {
            wrapper.style.left = `${left + width * x}px`;
            wrapper.style.top = `${top + height * y}px`;
        }
        if (animationStart != null) scheduleLayout();
    }

    function scheduleLayout() {
        if (pending) return;
        pending = true;
        requestAnimationFrame(layout);
    }

    function invalidatePlan() {
        planDirty = true;
        scheduleLayout();
    }

    function setProgressText(amountText: string, milestoneText: string) {
        if (!planDirty && amount.textContent === amountText && milestone.textContent === milestoneText) return;
        // Apply final fonts before exposing the incoming text; no initial oversized-font flash.
        prepareText(amountText, milestoneText);
        if (amount.textContent !== amountText) amount.textContent = amountText;
        if (milestone.textContent !== milestoneText) milestone.textContent = milestoneText;
        textObserver.takeRecords();
        scheduleLayout();
    }

    // Width uses layout pixels; zoom and the positioned wrapper are updated together on each frame.
    layout(performance.now());
    new ResizeObserver(scheduleLayout).observe(content);
    const textObserver = new MutationObserver(() => {
        prepareText();
        scheduleLayout();
    });
    for (const node of [title, labels, ...(sizing.autoWidth ? [document.getElementById('timeRemaining')!] : [])]) textObserver.observe(node, { childList: true, characterData: true, subtree: true });
    if (fixedSections) textObserver.observe(countdownTitle, { childList: true, characterData: true, subtree: true });
    textObserver.observe(content.querySelector('.countdown')!, { attributes: true, attributeFilter: ['class', 'style'] });
    textObserver.observe(content.querySelector('.goalWidget')!, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', invalidatePlan);
    motion.addEventListener('change', scheduleLayout);
    document.fonts.ready.then(invalidatePlan);
    document.fonts.addEventListener('loadingdone', invalidatePlan);
    window.addEventListener('message', event => {
        const data = event.data;
        if (event.source !== window.parent || !data || data.type !== 'goalTrackerData' ||
            data.goalId !== instance.goalId || data.uuid !== instance.uuid) return;
        window.dispatchEvent(new CustomEvent('goalTrackerUpdate', { detail: data.data }));
    });
    return { setProgressText };
}
