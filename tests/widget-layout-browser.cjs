const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

/** Real layout assertions against the same effect and iframe protocol used by Firebot. */
module.exports = async function verifyWidgetLayout({ tracker, effect, latest, evaluate, send, goalContext, until }) {
    const sized = effect('sizing', '#00aaff', 'Top Left');
    sized.templates.titles.progressBar = 'Community Support';
    let context;
    const measure = () => evaluate(`(()=>{
        const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
        const outer=document.getElementById('goal-tracker'),inner=document.querySelector('.goalTrackerOverlay');
        const label=document.getElementById('milestoneLabel'),amount=document.getElementById('donationStatus'),title=document.getElementById('progressTitle');
        const text=node=>({font:parseFloat(getComputedStyle(node).fontSize),whiteSpace:getComputedStyle(node).whiteSpace,ellipsis:getComputedStyle(node).textOverflow,width:node.clientWidth,scroll:node.scrollWidth,rect:rect(node)});
        return {outer:rect(outer),inner:rect(inner),bar:rect(document.getElementById('progressContainer')),zoom:Number(getComputedStyle(inner).zoom),label:text(label),amount:text(amount),title:text(title)};
    })()`, context);
    const settle = () => evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`, context);
    const close = (value, expected, message) => assert(Math.abs(value - expected) < 1.1, `${message}: expected ${expected}, got ${value}`);
    const render = async (settings = {}, legacy = false) => {
        Object.assign(sized, { widgetWidth: 475, widgetScale: 100, autoWidgetWidth: false, overlayGaps: { top: 0, bottom: 0, left: 0, right: 0 }, position: 'Top Left', customCoords: { top: null, left: null, right: null, bottom: null } }, settings);
        assert.equal((await tracker.onTriggerEvent({ effect: sized })).success, true);
        const event = latest('sizing');
        if (legacy) delete event.config.display.sizing;
        await evaluate(`window.applyGoal(${JSON.stringify(event)})`);
        const previous = context;
        context = await until(async () => { const next = await goalContext('sizing'); return next && next !== previous ? next : null; }, 'sized goal context');
        await until(() => evaluate(`document.getElementById('donationStatus').textContent==='$0/$100'`, context), 'sized goal data');
        await settle();
        return measure();
    };
    const paint = async (text, goal = 100, total = 25) => {
        await evaluate(`paintGoal(${goal},${total},${JSON.stringify(text)})`, context);
        await settle();
        const result = await measure();
        assert(result.label.rect.right <= result.amount.rect.left + 0.5, 'milestone must not overlap the amount');
        for (const node of [result.label, result.amount, result.title]) {
            assert.equal(node.whiteSpace, 'nowrap');
            assert.equal(node.ellipsis, 'ellipsis');
            assert(node.font >= 16 && node.font <= 24);
        }
        return result;
    };

    let result = await render({}, true);
    close(result.outer.width, 475, 'legacy width'); close(result.bar.width, 435, 'legacy track'); close(result.bar.height, 40, 'legacy height');
    result = await paint('Extended Community Goal');
    assert(result.label.font < 24, 'a medium milestone should shrink at the original width');
    assert(result.label.scroll <= result.label.width, 'medium milestone should fit after shrinking');
    result = await paint('Short');
    close(result.label.font, 24, 'shorter milestone restores preferred size without reloading');
    result = await render({ widgetWidth: 700 });
    close(result.bar.width, 660, 'wider track'); close(result.bar.height, 40, 'width must not increase height');
    result = await paint('Extended Community Goal');
    close(result.label.font, 24, 'more width restores full size text');

    // All nine preset anchors must use the scaled dimensions, including dynamic content height.
    for (const position of ['Top Left', 'Top Middle', 'Top Right', 'Middle Left', 'Middle', 'Middle Right', 'Bottom Left', 'Bottom Middle', 'Bottom Right']) {
        result = await render({ widgetWidth: 700, widgetScale: 125, position });
        close(result.outer.width, 875, `${position} scaled width`);
        close(result.bar.height, 50, `${position} proportional height`);
        close(result.inner.width, result.outer.width, `${position} wrapper size`);
        close(result.outer.left, position.includes('Left') ? 0 : position.includes('Right') ? 125 : 62.5, `${position} horizontal anchor`);
        close(result.outer.top, position.startsWith('Top') ? 0 : position.startsWith('Bottom') ? 800 - result.outer.height : (800 - result.outer.height) / 2, `${position} vertical anchor`);
    }
    result = await paint('Extended Community Goal');
    close(result.label.font, 24, 'scaling must not reduce text capacity');
    await new Promise(resolve => setTimeout(resolve, 400));
    const preview = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, '../docs/widget-sizing.png'), Buffer.from(preview.data, 'base64'));
    result = await render({ widgetWidth: 700, widgetScale: 50, position: 'Bottom Right' });
    close(result.outer.width, 350, 'scaled down width'); close(result.bar.height, 20, 'scaled down height');
    close(result.outer.right, 1000, 'scaled down right anchor'); close(result.outer.bottom, 800, 'scaled down bottom anchor');
    for (const customCoords of [{ left: 40, top: 35 }, { right: 32, bottom: 24 }]) {
        result = await render({ widgetWidth: 700, widgetScale: 125, position: 'Custom', customCoords });
        if (customCoords.left != null) { close(result.outer.left, 40, 'custom left offset'); close(result.outer.top, 35, 'custom top offset'); }
        else { close(result.outer.right, 968, 'custom right offset'); close(result.outer.bottom, 776, 'custom bottom offset'); }
    }
    result = await render({ widgetWidth: 1400, widgetScale: 150, position: 'Custom', customCoords: { left: 40, right: 32, top: 35, bottom: 24 } });
    close(result.inner.left, 40, 'fitted custom left stays in overlay pixels');
    close(result.inner.right, 968, 'custom margins constrain scaled content');
    assert(result.inner.top >= 35 && result.inner.bottom <= 777, 'custom vertical margins must be respected');

    // Extremely long and unbroken strings must truncate at the minimum instead of wrapping.
    result = await render({ widgetWidth: 200 });
    await evaluate(`document.getElementById('progressTitle').textContent='VeryLongUnbrokenGoalTitle'.repeat(8)`, context);
    result = await paint('ExtremelyLongUnbrokenMilestoneName'.repeat(10), 1000000000000, 999999999999.99);
    close(result.title.font, 16, 'minimum title font');
    assert(result.title.scroll > result.title.width, 'long title should use its ellipsis fallback');
    close(result.bar.height, 40, 'long text must not make the bar taller');
    await evaluate(`document.getElementById('progressTitle').textContent='Goal'`, context);
    result = await paint('Short');
    close(result.amount.font, 24, 'amount restores preferred size after a short update');
    assert(result.title.font > 16, 'shorter title restores preferred size without reloading');

    sized.display.countdown.showCountdown = true;
    result = await render({ widgetWidth: 700, widgetScale: 125 });
    const sections = await evaluate(`['.countdown','.info-section','#progressContainer'].map(selector=>document.querySelector(selector).getBoundingClientRect().width)`, context);
    for (const width of sections) close(width, result.bar.width, 'all sections share the configured width');
    close(await evaluate(`document.querySelector('.countdown').getBoundingClientRect().height`, context), 150, 'countdown scales proportionally');

    // Oversized content fits the viewport uniformly and restores its requested scale after resize.
    result = await render({ widgetWidth: 1400, widgetScale: 150, position: 'Bottom Right' });
    close(result.outer.width, 1000, 'oversized width fits'); close(result.outer.right, 1000, 'oversized right anchor');
    close(result.bar.height / result.zoom, 40, 'automatic fit preserves proportions');
    result = await render({ widgetWidth: 700, widgetScale: 125, position: 'Bottom Right' });
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 130, deviceScaleFactor: 1, mobile: false });
    await until(async () => { const r = await measure(); return r.outer.width <= 321 && r.outer.height <= 131 && r.outer.left >= -1 && r.outer.top >= -1; }, 'fit small overlay width and height');
    await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 800, deviceScaleFactor: 1, mobile: false });
    await until(async () => Math.abs((await measure()).outer.width - 875) < 1, 'restore requested scale after resize');
    result = await measure(); close(result.outer.bottom, 800, 'resized bottom anchor');
    const otherContext = await goalContext('a');
    assert(otherContext, 'other goal remains active and isolated');
    close(await evaluate(`document.getElementById('goal-tracker').getBoundingClientRect().width`, otherContext), 475, 'sizing must not change another goal width');
    await evaluate(`window.applyGoal({type:'remove',goalId:'goal_sizing',revision:${latest('sizing').revision + 1}})`);
    console.log('Widget layout passed: legacy defaults, independent width/scale, all preset anchors, custom offsets, no wrapping/overlap, minimum fonts/ellipsis, text recovery, viewport fitting and resize recovery.');
};
