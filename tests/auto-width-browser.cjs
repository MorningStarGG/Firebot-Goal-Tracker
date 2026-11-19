const assert = require('assert/strict');

module.exports = async function verifyAutoWidth({ tracker, effect, latest, evaluate, send, sendToContext, goalContext, until }) {
    const sized = effect('elastic', '#00aaff', 'Top Middle');
    sized.templates.titles.progressBar = 'Support';
    let context;
    const close = (value, expected, message) => assert(Math.abs(value - expected) < 1.1, `${message}: expected ${expected}, got ${value}`);
    const snapshot = () => evaluate(`(()=>{const r=document.getElementById('goal-tracker').getBoundingClientRect();const l=document.getElementById('milestoneLabel'),a=document.getElementById('donationStatus');return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,labelRight:l.getBoundingClientRect().right,amountLeft:a.getBoundingClientRect().left,font:parseFloat(getComputedStyle(l).fontSize)}})()`, context);
    const paint = text => evaluate(`paintGoal(100,25,${JSON.stringify(text)})`, context);
    const settle = async text => { await paint(text); await evaluate(`new Promise(resolve=>setTimeout(resolve,450))`, context); return snapshot(); };
    // Generate text that actually overflows the minimum-width label in the active browser font.
    // A fixed English phrase can fit on Linux while requiring growth with Windows' fallback fonts.
    const overflowingLabel = (extraWidth = 80, prefix = 'Extended Community Goal') => evaluate(`(()=>{
        const label=document.getElementById('milestoneLabel'),style=getComputedStyle(label),sample=document.createElement('span');
        Object.assign(sample.style,{position:'absolute',visibility:'hidden',whiteSpace:'pre',font:style.font,letterSpacing:style.letterSpacing});
        document.body.appendChild(sample);
        try {
            const required=label.clientWidth+${extraWidth};let text=${JSON.stringify(prefix)};
            for(let i=0;i<100;i++){sample.textContent=text;if(sample.getBoundingClientRect().width>=required)return text;text+=' Support';}
            throw Error('Could not prepare overflowing milestone text');
        } finally { sample.remove(); }
    })()`, context);
    const render = async (settings = {}, fontFamily) => {
        Object.assign(sized, { autoWidgetWidth: true, widgetWidth: 700, widgetScale: 125, position: 'Top Middle', overlayGaps: { top: 60, bottom: 40, left: 30, right: 50 }, customCoords: { top: null, bottom: null, left: null, right: null } }, settings);
        assert.equal((await tracker.onTriggerEvent({ effect: sized })).success, true);
        await evaluate(`window.applyGoal(${JSON.stringify(latest('elastic'))})`);
        const previous = context;
        context = await until(async () => { const next = await goalContext('elastic'); return next && next !== previous ? next : null; }, 'automatic-width context');
        await until(() => evaluate(`document.getElementById('donationStatus').textContent==='$0/$100'`, context), 'automatic-width data');
        if (fontFamily) await evaluate(`(()=>{const style=document.createElement('style');style.textContent=${JSON.stringify(`*{font-family:${fontFamily}!important}`)};document.head.appendChild(style);window.dispatchEvent(new Event('resize'));})()`, context);
        return settle('A');
    };
    const animate = async (text, repeat = false) => evaluate(`new Promise(resolve=>{
        const frames=[],start=performance.now();
        const paint=()=>paintGoal(100,25,${JSON.stringify(text)});paint();
        const interval=${repeat} ? setInterval(paint,40) : null;
        function frame(now){const r=document.getElementById('goal-tracker').getBoundingClientRect();const label=document.getElementById('milestoneLabel'),l=label.getBoundingClientRect(),a=document.getElementById('donationStatus').getBoundingClientRect(),b=document.getElementById('progressContainer').getBoundingClientRect();frames.push({time:now-start,width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom,labelRight:l.right,amountLeft:a.left,barCenter:(b.left+b.right)/2,font:parseFloat(getComputedStyle(label).fontSize),opacity:getComputedStyle(label).opacity});if(now-start<550)requestAnimationFrame(frame);else{clearInterval(interval);resolve(frames)}}frame(performance.now());
    })`, context);

    for (const position of ['Top Left', 'Top Middle', 'Top Right', 'Middle Left', 'Middle', 'Middle Right', 'Bottom Left', 'Bottom Middle', 'Bottom Right']) {
        const short = await render({ position });
        close(short.width, 475 * 1.25, 'automatic width returns to the original default width at the selected scale');
        const frames = await animate(await overflowingLabel());
        const last = frames.at(-1);
        assert.equal(new Set(frames.map(frame => frame.font)).size, 1, 'incoming text must keep its final font size from the synchronous update through the whole growth animation');
        const maximum = sized.widgetWidth * sized.widgetScale / 100;
        assert(last.width > short.width + 20 && last.width <= maximum + 1.1, `automatic width must grow within the configured maximum: ${JSON.stringify({position,shortWidth:short.width,longWidth:last.width,maximum,font:last.font})}`);
        assert(frames.some(frame => frame.width > short.width + 5 && frame.width < last.width - 5), 'growth must include intermediate animation frames');
        for (const frame of frames) {
            const anchorX = position.includes('Left') ? frame.left : position.includes('Right') ? frame.right : (frame.left + frame.right) / 2;
            const anchorY = position.startsWith('Top') ? frame.top : position.startsWith('Bottom') ? frame.bottom : (frame.top + frame.bottom) / 2;
            close(anchorX, position.includes('Left') ? 30 : position.includes('Right') ? 950 : 490, `${position} anchored through animation`);
            close(anchorY, position.startsWith('Top') ? 60 : position.startsWith('Bottom') ? 760 : 410, `${position} vertical gap in overlay pixels`);
            close(frame.barCenter, (frame.left + frame.right) / 2, 'template padding must keep the visible bar centered');
            assert(frame.labelRight <= frame.amountLeft + 0.5, 'text must not overlap while resizing');
        }
        const shrink = await animate('A');
        close(shrink.at(-1).width, short.width, `${position} returns to shorter width`);
    }

    await render({ widgetScale: 100 });
    const userCase = await animate(await overflowingLabel(700 - 475 + 80, 'Community Goal: Double Donation Weekend'));
    close(userCase.at(-1).width, 700, '700px / 100% regression reaches the maximum');
    assert(userCase.at(-1).font >= 16 && userCase.at(-1).font < 24, 'long text needs fitting at the destination width');
    assert.equal(new Set(userCase.map(frame => frame.font)).size, 1, '700px / 100% must not flash a larger font or step through intermediate sizes');
    assert(userCase.every(frame => frame.opacity === '1'), 'the resize must not introduce a text fade');
    const userShrink = await animate('Short');
    assert(userShrink.every(frame => frame.font === 24), 'shorter text restores its preferred font before shrinking, without a first-frame flash');
    close(userShrink.at(-1).width, 475, '700px / 100% regression returns to its minimum');

    // Exercise different system-font metrics without changing the production font stack.
    for (const fontFamily of ['Arial, sans-serif', 'monospace']) {
        const short = await render({ widgetScale: 100 }, fontFamily);
        const frames = await animate(await overflowingLabel());
        assert(frames.at(-1).width > short.width + 20 && frames.at(-1).width <= sized.widgetWidth + 1.1, `${fontFamily}: automatic width grows within its maximum`);
        assert(frames.some(frame => frame.width > short.width + 5 && frame.width < frames.at(-1).width - 5), `${fontFamily}: growth remains animated`);
        assert.equal(new Set(frames.map(frame => frame.font)).size, 1, `${fontFamily}: no text-size flash during growth`);
        await settle('A');
        const capped = await animate(await overflowingLabel(700 - 475 + 80, 'Community Goal: Double Donation Weekend'));
        close(capped.at(-1).width, 700, `${fontFamily}: overflowing text reaches the configured maximum`);
        assert(capped.at(-1).font >= 16 && capped.at(-1).font < 24, `${fontFamily}: maximum-width text is fitted`);
        assert.equal(new Set(capped.map(frame => frame.font)).size, 1, `${fontFamily}: fitted font stays steady`);
        close((await settle('A')).width, 475, `${fontFamily}: shorter text restores the minimum`);
    }

    await render({ position: 'Top Middle', overlayGaps: { top: 60, bottom: 0, left: 0, right: 0 } });
    const repeated = await animate(await overflowingLabel(), true);
    for (const frame of repeated) close((frame.left + frame.right) / 2, 500, 'top middle stays at screen center');
    close(repeated.find(frame => frame.time >= 450).width, repeated.at(-1).width, 'repeated updates must not restart or oscillate the animation');
    const capped = await settle('ExtremelyLongMilestoneWithoutSpaces'.repeat(8));
    close(capped.width, 875, 'configured width is the automatic maximum');
    close(capped.font, 16, 'maximum-width overflow retains text fitting');
    const short = await settle('A');
    assert(short.width < capped.width - 100, 'truncated text must not lock the widget at maximum width');
    close(short.font, 24, 'shorter content restores the preferred font');

    sized.display.countdown.showCountdown = true;
    await render(); await settle('A');
    const clock = await evaluate(`(()=>{const time=document.getElementById('timeRemaining');const selectors=['.countdown','.info-section','#progressContainer'];return {width:time.clientWidth,scroll:time.scrollWidth,sections:selectors.map(selector=>document.querySelector(selector).getBoundingClientRect().width)}})()`, context);
    assert(clock.scroll <= clock.width, 'automatic minimum must account for the countdown time and its padding');
    for (const width of clock.sections) close(width, clock.sections[0], 'all sections resize together');
    sized.display.countdown.showCountdown = false;

    sized.display.fixedSectionWidths = true;
    sized.display.countdown.showCountdown = true;
    const fixedInfo = () => evaluate(`(()=>{const panel=document.querySelector('.info-section'),r=panel.getBoundingClientRect(),box=document.getElementById('goal-tracker').getBoundingClientRect(),animation=document.getElementById('donationAnimation').getBoundingClientRect(),clock=document.querySelector('.countdown').getBoundingClientRect(),time=document.getElementById('timeRemaining');return {width:r.width,center:(r.left+r.right)/2,widgetCenter:(box.left+box.right)/2,animationWidth:animation.width,countdownWidth:clock.width,countdownCenter:(clock.left+clock.right)/2,timeWidth:time.clientWidth,timeScroll:time.scrollWidth}})()`, context);
    for (const [position, infoPosition, scale] of [['Top Left','above',125],['Top Middle','below',100],['Top Right','below',125]]) {
        sized.display.infoSection.infoPosition = infoPosition;
        sized.display.countdown.countdownPosition = infoPosition === 'above' ? 'below' : 'above';
        await render({ position, widgetScale: scale });
        const short = await fixedInfo();
        close(short.width, (475 - 40) * scale / 100, 'fixed info retains the original width including template padding');
        close(short.countdownWidth, short.width, 'countdown retains the same original width as info');
        assert(short.timeScroll <= short.timeWidth, 'countdown time fits its fixed panel');
        const growing = await evaluate(`new Promise(resolve=>{
            const frames=[],start=performance.now();paintGoal(100,25,'ExtremelyLongMilestoneWithoutSpaces'.repeat(8));
            function frame(now){const panel=document.querySelector('.info-section').getBoundingClientRect(),clock=document.querySelector('.countdown').getBoundingClientRect(),box=document.getElementById('goal-tracker').getBoundingClientRect();frames.push({width:panel.width,center:(panel.left+panel.right)/2,widgetCenter:(box.left+box.right)/2,widgetWidth:box.width,countdownWidth:clock.width,countdownCenter:(clock.left+clock.right)/2});if(now-start<450)requestAnimationFrame(frame);else resolve(frames)}frame(start);
        })`, context);
        assert(growing.at(-1).widgetWidth > growing[0].widgetWidth + 20, 'bar must still grow with fixed info');
        for (const frame of growing) {
            close(frame.width, short.width, 'info width stays fixed throughout bar animation');
            close(frame.center, frame.widgetCenter, 'fixed info stays centered under the resizing bar');
            close(frame.countdownWidth, short.width, 'countdown width stays fixed throughout bar animation');
            close(frame.countdownCenter, frame.widgetCenter, 'fixed countdown stays centered with the bar');
        }
        // The event animation must remain contained by the information panel too.
        await evaluate(`document.getElementById('donationAnimation').style.display='flex'`, context);
        const event = await fixedInfo();
        close(event.animationWidth, short.width, 'event animation follows the fixed information panel');
        await settle('A'); close((await fixedInfo()).width, short.width, 'info stays fixed when the bar shrinks');
        close((await fixedInfo()).countdownWidth, short.width, 'countdown stays fixed when the bar shrinks');
        // Align to Track must not override the independent info width.
        await evaluate(`document.querySelector('.goalWidget').classList.add('align-to-track')`, context);
        close((await fixedInfo()).width, short.width, 'track alignment preserves fixed info width');
        close((await fixedInfo()).countdownWidth, short.width, 'track alignment preserves fixed countdown width');
    }

    await render({ autoWidgetWidth: false });
    const fixed = await settle('A'); close(fixed.width, 875, 'fixed width remains fixed');
    close((await fixedInfo()).width, (700 - 40) * 1.25, 'fixed info option only applies when Auto Width is enabled');
    close((await fixedInfo()).countdownWidth, (700 - 40) * 1.25, 'fixed countdown option only applies with Auto Width');
    await settle('A much longer community support milestone'); close((await snapshot()).width, 875, 'fixed width ignores text length');
    sized.display.fixedSectionWidths = false;
    sized.display.infoSection.infoPosition = 'below';
    sized.display.countdown.showCountdown = false;

    await render({ position: 'Custom', customCoords: { top: 35, left: 40 }, overlayGaps: { top: 100, bottom: 100, left: 100, right: 100 } });
    const customFrames = await animate(await overflowingLabel());
    for (const frame of customFrames) { close(frame.left, 40, 'custom left ignores preset gaps'); close(frame.top, 35, 'custom top ignores preset gaps'); }

    sized.display.fixedSectionWidths = true;
    await render();
    await sendToContext('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, context);
    await until(() => evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`, context), 'reduced-motion preference in the isolated iframe');
    await paint('ExtremelyLongMilestoneWithoutSpaces'.repeat(8));
    await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`, context);
    close((await snapshot()).width, 875, 'reduced motion applies the target without animation');
    await sendToContext('Emulation.setEmulatedMedia', { features: [] }, context);

    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 160, deviceScaleFactor: 1, mobile: false });
    await until(async () => { const r = await snapshot(); return r.left >= 29 && r.right <= 271 && r.top >= 59 && r.bottom <= 121; }, 'automatic widget fits inset area on a small overlay');
    assert((await fixedInfo()).width <= (await snapshot()).width, 'fixed info fits the overlay through uniform scale reduction');
    await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 800, deviceScaleFactor: 1, mobile: false });
    await until(async () => Math.abs((await snapshot()).width - 875) < 1, 'automatic widget restores scale after resize');
    close((await fixedInfo()).width, (475 - 40) * 1.25, 'fixed info restores its requested scale after viewport recovery');
    await evaluate(`window.applyGoal({type:'remove',goalId:'goal_elastic',revision:${latest('elastic').revision + 1}})`);
    console.log('Automatic width passed: font-aware growth/shrink including Arial and monospace fallbacks, all preset anchors during animation, fixed pixel gaps, max width/ellipsis, update stability, custom coordinates, reduced motion and inset viewport fitting.');
};
