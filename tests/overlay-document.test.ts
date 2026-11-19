import { Script, runInNewContext } from 'vm';
import { renderOverlayDocument } from '../src/overlay/render-overlay';
import { createGoalLogic } from '../src/shared/goal-logic';
import { buildGoalConfig, validateEffect } from '../src/utility/configuration';
import { makeEffect } from './fixtures';
import { goalTrackerEffectType } from '../src/effects/goal';

test('raw HTML assembles one syntactically valid script with literal user text', () => {
    const config = { title: "$& $' </script><script>window.injected=true</script>" };
    const serialize = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
    const html = renderOverlayDocument()
        .replace('__GOAL_CONFIG__', () => serialize(config))
        .replace('__GOAL_INSTANCE__', () => serialize({ goalId: 'one', uuid: 'runtime' }));
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
    expect(scripts).toHaveLength(1);
    expect(() => new Script(scripts[0][1])).not.toThrow();
    expect(html).not.toContain('__GOAL_CONFIG__');
    expect(html).not.toContain('<script>window.injected');
    const declaration = scripts[0][1].match(/const CONFIG = ([^\n]+);/)!;
    expect(JSON.parse(declaration[1])).toEqual(config);
});

test('shared rules serialize into a self-contained browser factory', () => {
    const browser = runInNewContext(`(${createGoalLogic.toString()})()`);
    expect(browser.activeGoal(1000, 250, [{ title: 'First', amount: 250 }, { title: 'Second', amount: 500 }], true)).toBe(500);
    expect(browser.activeGoal(1000, 500, [{ title: 'Last', amount: 500 }], true)).toBe(1000);
    expect(browser.percentage(1250, 1000)).toBe(125);
});

test('theme selection, finite timing, and permanent custom-logo resources survive configuration assembly', () => {
    const effect = makeEffect();
    effect.extraLife.useExtraLife = true;
    effect.extraLife.useExtraLifeColors = true;
    effect.extraLife.dataPollInterval = Infinity;
    Object.assign(effect.streamElements, { summaryType: 'weekly', resetSchedule: 'monthly' });
    effect.templates.animation.animationHighlight = '#123456';
    effect.defaultLogoPath = 'C:\\logos\\stream.png';
    const storeResourcePath = jest.fn(() => 'permanent-token');
    const themed = buildGoalConfig(effect, storeResourcePath);
    expect(themed.content.templates.extraLife.animation.animationHighlight).toBe('#00B4FF');
    expect(themed.content.templates.extraLife.animation.animationBackgroundColorTwo).toBe('#2A475E');
    expect(themed.extraLife.dataPollInterval).toBe(60);
    expect(themed.streamElements.summaryType).toBe('weekly');
    expect(themed.streamElements).not.toHaveProperty('resetSchedule');
    expect(storeResourcePath).toHaveBeenCalledWith(effect.defaultLogoPath);
    effect.extraLife.useExtraLifeColors = false;
    const custom = buildGoalConfig(effect, storeResourcePath);
    expect(custom.content.templates.extraLife.animation.animationHighlight).toBe('#123456');
});

test('legacy sizing defaults remain unchanged and explicit sizing survives configuration assembly', () => {
    const effect = makeEffect();
    delete effect.widgetWidth;
    delete effect.widgetScale;
    const resources = (path: string) => path;
    expect(buildGoalConfig(effect, resources).display.sizing).toEqual({ width: 475, scale: 100, autoWidth: false });
    effect.widgetWidth = 700;
    effect.widgetScale = 125;
    validateEffect(effect);
    expect(buildGoalConfig(effect, resources).display.sizing).toEqual({ width: 700, scale: 125, autoWidth: false });
    expect(effect.display.sizing).toBeUndefined();
});

test('independent animation backgrounds inherit legacy settings and survive Extra Life palette selection', () => {
    const effect = makeEffect();
    const resources = (path: string) => path;
    delete effect.templates.animation.animationBackgroundStyle;
    delete effect.templates.animation.headerBackground;
    delete effect.templates.animation.subheaderBackground;
    const defaults = buildGoalConfig(effect, resources).content.templates.default.animation;
    expect(defaults.headerBackground).toEqual({ style: 'none', colorOne: '#111111', colorTwo: '#1a1a1a' });
    expect(defaults.subheaderBackground?.style).toBe('gradient');
    effect.templates.animation.animationBackgroundStyle = 'gradient';
    expect(buildGoalConfig(effect, resources).content.templates.default.animation.headerBackground?.style).toBe('gradient');
    expect(buildGoalConfig(effect, resources).content.templates.default.animation.subheaderBackground?.style).toBe('gradient');
    effect.templates.animation.headerBackground = { style: 'solid', colorOne: '#123456', colorTwo: '#abcdef' };
    effect.templates.animation.subheaderBackground = { style: 'centered', colorOne: '#654321', colorTwo: '#fedcba' };
    effect.extraLife.useExtraLifeColors = true;
    const config = buildGoalConfig(effect, resources);
    expect(config.content.templates.default.animation.headerBackground).toEqual(effect.templates.animation.headerBackground);
    expect(config.content.templates.default.animation.subheaderBackground).toEqual(effect.templates.animation.subheaderBackground);
    expect(config.content.templates.extraLife.animation.headerBackground).toEqual({ style: 'solid', colorOne: '#1B2838', colorTwo: '#2A475E' });
    expect(config.content.templates.extraLife.animation.subheaderBackground).toEqual({ style: 'centered', colorOne: '#1B2838', colorTwo: '#2A475E' });
    effect.extraLife.useExtraLifeColors = false;
    expect(buildGoalConfig(effect, resources).content.templates.extraLife.animation.headerBackground).toEqual(effect.templates.animation.headerBackground);
    const browser = runInNewContext(`(${createGoalLogic.toString()})()`);
    expect(browser.animationBackgroundStyle('invalid')).toBe('gradient');
    effect.templates.animation.headerBackground!.style = 'none';
    expect(buildGoalConfig(effect, resources).content.templates.default.animation.headerBackground?.style).toBe('none');
    expect(browser.animationBackgroundCSS({ style: 'none', colorOne: '#123456', colorTwo: '#abcdef' })).toBe('none');
});

test('invalid dimensions fail validation and old malformed dimensions get safe browser defaults', () => {
    for (const [key, bad] of [['widgetWidth', 0], ['widgetWidth', 3841], ['widgetWidth', NaN], ['widgetScale', 0], ['widgetScale', 301], ['widgetScale', Infinity]] as const) {
        const effect = makeEffect();
        effect[key] = bad;
        expect(() => validateEffect(effect)).toThrow(/Widget (Width|Scale)/);
    }
    const browser = runInNewContext(`(${createGoalLogic.toString()})()`);
    expect(browser.widgetSizing()).toEqual({ width: 475, scale: 100, autoWidth: false });
    expect(browser.widgetSizing('700', '125')).toEqual({ width: 700, scale: 125, autoWidth: false });
    expect(browser.widgetSizing(NaN, Infinity)).toEqual({ width: 475, scale: 100, autoWidth: false });
    expect(browser.widgetSizing(0, 999)).toEqual({ width: 200, scale: 300, autoWidth: false });
});

test('automatic width and preset gaps persist separately from custom coordinates with safe legacy defaults', () => {
    const effect = makeEffect();
    const resources = (path: string) => path;
    expect(buildGoalConfig(effect, resources).display.gaps).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
    delete effect.display.fixedSectionWidths;
    expect(buildGoalConfig(effect, resources).display.fixedSectionWidths).toBe(false);
    // Preserve the previous info-only setting when upgrading to the combined preference.
    effect.display.infoSection.fixedWidth = true;
    expect(buildGoalConfig(effect, resources).display.fixedSectionWidths).toBe(true);
    effect.display.fixedSectionWidths = false;
    expect(buildGoalConfig(effect, resources).display.fixedSectionWidths).toBe(false);
    effect.display.fixedSectionWidths = true;
    effect.autoWidgetWidth = true;
    effect.widgetWidth = 700;
    effect.overlayGaps = { top: 60, bottom: 20, left: 40, right: 40 };
    effect.customCoords = { top: 12, bottom: null, left: 30, right: null };
    const config = buildGoalConfig(effect, resources);
    expect(config.display.sizing).toEqual({ width: 700, scale: 100, autoWidth: true });
    expect(config.display.fixedSectionWidths).toBe(true);
    expect(config.display.infoSection).not.toHaveProperty('fixedWidth');
    expect(config.display.gaps).toEqual(effect.overlayGaps);
    expect(config.customCoords).toEqual(effect.customCoords);
    effect.widgetWidth = 474;
    expect(() => validateEffect(effect)).toThrow('Widget Width must be between 475 and 3840 pixels');
    effect.widgetWidth = 700;
    for (const value of [-1, Infinity, 3841]) {
        effect.overlayGaps.top = value;
        expect(() => validateEffect(effect)).toThrow('Top Gap');
    }
    effect.position = 'Custom';
    expect(() => validateEffect(effect)).not.toThrow();
    const browser = runInNewContext(`(${createGoalLogic.toString()})()`);
    expect(browser.widgetGaps({ top: '60', bottom: NaN, left: -1, right: Infinity })).toEqual({ top: 60, bottom: 0, left: 0, right: 0 });
});

test('settings callbacks survive Firebot serialization without backend imports or closures', () => {
    const tracker = goalTrackerEffectType();
    // Firebot 5.66.7 uses bare eval(raw), not eval(`(${raw})`). Declarations return undefined.
    const controller = runInNewContext(tracker.optionsController!.toString());
    const validator = runInNewContext(tracker.optionsValidator!.toString());
    expect(typeof controller).toBe('function');
    expect(typeof validator).toBe('function');
    const showOverlayInfoModal = jest.fn();
    const scope = { effect: {} as any } as any;
    controller(scope, { showOverlayInfoModal });
    expect(scope.effect.widgetWidth).toBe(475);
    expect(scope.effect.widgetScale).toBe(100);
    expect(validator(scope.effect)).toEqual([]);
    scope.showOverlayInfoModal('Other');
    expect(showOverlayInfoModal).toHaveBeenCalledWith('Other');
    scope.effect.widgetWidth = 700;
    scope.effect.widgetScale = 125;
    controller(scope, { showOverlayInfoModal });
    expect(scope.effect.widgetWidth).toBe(700);
    expect(scope.effect.widgetScale).toBe(125);
    scope.effect.widgetScale = 0;
    expect(validator(scope.effect)).toEqual(['Widget Scale must be between 10 and 300 percent']);
    // Angular identifies injected services from the serialized wrapper's argument names.
    expect(tracker.optionsController!.toString()).toMatch(/^\(\$scope,utilityService\)\s*=>/);
});
