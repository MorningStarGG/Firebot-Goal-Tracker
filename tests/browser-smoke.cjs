/* Exercises the production bundle in a real Chromium browser, without a Firebot account or API calls. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const rendererSettings = require('./renderer-settings-browser.cjs');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, description) {
    for (let i = 0; i < 100; i++) { const result = await check(); if (result) return result; await delay(100); }
    throw new Error(`Timed out: ${description}`);
}

async function run() {
    const candidates = [process.env.CHROME_PATH,
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
    const executable = candidates.find(file => file && fs.existsSync(file));
    assert(executable, 'Install Chromium/Chrome/Edge or set CHROME_PATH to run browser verification');
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'firebot-goals-browser-'));
    let browser, server, socket, host;
    const errors = [];
    try {
        host = require('./plugin-host.cjs').createHost(path.join(profile, 'script-data', 'test-plugin'));
        const { effects, routes, events, frontendHandlers, overlayServer } = host;
        host.api.logger.error = (...args) => errors.push(args.map(String).join(' '));
        await host.load();
        assert.equal(events.length, 0, 'plugin loading must not show saved goals');
        assert.equal(overlayServer.listenerCount('overlay-connected'), 0, 'the script must not handle the user\'s Firebot connection event');
        overlayServer.emit('overlay-connected', 'Default');
        assert.equal(events.length, 0, 'a connection alone must not show goals');
        const tracker = effects.find(effect => effect.definition.id === 'msgg:goaltracker');
        const manager = effects.find(effect => effect.definition.id === 'msgg:goaltracker-local-update');
        const effect = (id, color, position) => {
            const scope = { effect: {} }; tracker.optionsController(scope, {});
            Object.assign(scope.effect, { goalId: id, donationGoal: 100, position, infoSectionCycle: false });
            scope.effect.templates.colors.progressColor = color;
            scope.effect.templates.titles.progressBar = `${id}: $& $' </script><script>window.injected = true</script>`;
            scope.effect.display.progressBar.showTitle = true;
            scope.effect.display.countdown.showCountdown = false;
            return scope.effect;
        };
        const a = effect('a', '#ff0000', 'Top Left'), b = effect('b', '#0000ff', 'Bottom Right');
        b.milestones = [{ title: 'First', amount: 50 }, { title: 'Second', amount: 75 }];
        b.milestoneCycle = true; b.milestoneCycleMode = 'all'; b.showCompletedMilestones = false;
        b.timing.cycleDelay = 1;
        assert.equal((await tracker.onTriggerEvent({ effect: a })).success, true);
        assert.equal((await tracker.onTriggerEvent({ effect: b })).success, true);
        const managerScope = { effect: { goalId: ' A ' }, $applyAsync: callback => callback() };
        manager.optionsController(managerScope, { fireEventAsync: (name, data) => frontendHandlers.get(name)(data) });
        await until(() => managerScope.effect.goalId === 'goal_a' && managerScope.goals.length === 2, 'Manager selection normalization');
        assert.deepEqual(managerScope.goals.map(goal => goal.goalId).sort(), ['goal_a', 'goal_b']);
        await manager.onTriggerEvent({ effect: { operation: 'add', goalId: 'a', donorName: 'Alice', donationAmount: 125 } });
        await manager.onTriggerEvent({ effect: { operation: 'add', goalId: 'b', donorName: 'Bob', donationAmount: 25 } });
        const latest = id => {
            const goalEvents = events.filter(event => event.data.goalId === `goal_${id}`);
            const show = goalEvents.filter(event => event.data.type === 'show').at(-1).data;
            const data = goalEvents.filter(event => event.data.type === 'show' || event.data.type === 'update').at(-1).data.data;
            return { ...show, data };
        };
        const fixtures = { a: latest('a'), b: latest('b') };
        const callback = tracker.overlayExtension.event.onOverlayEvent.toString();
        server = http.createServer((request, response) => {
            const route = routes.get(request.url);
            if (route) return route(request, response);
            if (request.url === '/favicon.ico') { response.writeHead(204); return response.end(); }
            if (request.url === '/test/angular.js' || request.url === '/test/firebot-input.js') {
                response.setHeader('content-type', 'application/javascript');
                return response.end(fs.readFileSync(request.url === '/test/angular.js' ? require.resolve('angular/angular.min.js') : path.join(__dirname, 'fixtures/firebot-input.v5.67.0.js')));
            }
            if (request.url === '/test/settings.html') {
                response.setHeader('content-type', 'text/html');
                return response.end(rendererSettings.page(tracker, manager));
            }
            response.setHeader('content-type', 'text/html');
            response.end(`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:transparent"><div id="wrapper" style="position:fixed;inset:0"></div><script>window.applyGoal = ${callback};</script></body></html>`);
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const address = `http://127.0.0.1:${server.address().port}`;
        browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
            ...(process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
            '--disable-background-networking', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
            `--user-data-dir=${profile}`, '--window-size=1000,800', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
        const portFile = path.join(profile, 'DevToolsActivePort');
        await until(() => fs.existsSync(portFile), 'browser debugger');
        const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
        const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
        let sequence = 0; const pending = new Map(), contexts = new Map();
        socket.on('message', raw => {
            const message = JSON.parse(raw);
            if (message.id) { const item = pending.get(message.id); if (!item) return; pending.delete(message.id); message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result); }
            if (message.method === 'Target.attachedToTarget') void send('Runtime.enable', {}, message.params.sessionId);
            if (message.method === 'Runtime.executionContextCreated' && message.params.context.auxData?.isDefault) {
                contexts.set(`${message.sessionId || 'root'}:${message.params.context.id}`, { ...message.params.context, sessionId: message.sessionId });
            }
            if (message.method === 'Runtime.executionContextDestroyed') contexts.delete(`${message.sessionId || 'root'}:${message.params.executionContextId}`);
            if (message.method === 'Runtime.executionContextsCleared' || message.method === 'Target.detachedFromTarget') {
                const session = message.params?.sessionId || message.sessionId;
                for (const [key, context] of contexts) if (context.sessionId === session) contexts.delete(key);
            }
            if (message.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(message.params.exceptionDetails));
        });
        const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, sessionId })); });
        const evaluate = async (expression, key) => {
            const context = key ? contexts.get(key) : undefined;
            const result = await send('Runtime.evaluate', { expression, contextId: context?.id, returnByValue: true, awaitPromise: true }, context?.sessionId);
            if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
            return result.result.value;
        };
        const goalContext = async id => {
            for (const [contextId] of contexts) {
                try { if (await evaluate('typeof INSTANCE === "undefined" ? null : INSTANCE.goalId', contextId) === `goal_${id}`) return contextId; } catch { /* context can disappear during navigation */ }
            }
        };
        await send('Runtime.enable'); await send('Page.enable');
        await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
        await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 800, deviceScaleFactor: 1, mobile: false });
        await rendererSettings.verify({ send, evaluate, until, address });
        await send('Page.navigate', { url: address });
        await until(() => evaluate('typeof window.applyGoal === "function"'), 'host page');
        const backgroundB = { ...fixtures.b, type: 'update' };
        await evaluate(`window.applyGoal(${JSON.stringify(backgroundB)})`);
        assert.equal(await evaluate('document.querySelectorAll("iframe").length'), 0, 'background updates must not create goals');
        await evaluate(`window.applyGoal(${JSON.stringify(fixtures.a)})`);
        await evaluate(`window.applyGoal(${JSON.stringify(backgroundB)})`);
        assert.equal(await evaluate('document.querySelectorAll("iframe").length'), 1, 'an unselected saved goal must remain absent');
        // Deliberately running a second effect still creates its independent display immediately.
        assert.equal((await tracker.onTriggerEvent({ effect: b })).success, true);
        fixtures.b = latest('b');
        await evaluate(`window.applyGoal(${JSON.stringify(fixtures.b)})`);
        await until(() => evaluate('document.querySelector("iframe")?.srcdoc.length > 100'), 'goal document');
        const aContext = await until(() => goalContext('a'), 'first goal context');
        const bContext = await until(() => goalContext('b'), 'second goal context');
        const inspect = `({status:document.getElementById('donationStatus').innerText,width:document.getElementById('progressBar').style.width,color:getComputedStyle(document.documentElement).getPropertyValue('--progressColor').trim(),label:document.getElementById('milestoneLabel').innerText,title:document.getElementById('progressTitle').innerText,injected:window.injected===true})`;
        await until(async () => (await evaluate(inspect, aContext)).status === '$125/$100', 'first goal data');
        await until(async () => (await evaluate(inspect, bContext)).status.startsWith('$25/'), 'second goal data');
        const first = await evaluate(inspect, aContext), second = await evaluate(inspect, bContext);
        assert.equal(first.width, '100%'); assert.equal(first.label, '125%'); assert.equal(first.color, '#ff0000');
        assert.equal(second.color, '#0000ff'); assert.equal(first.injected, false); assert.equal(second.injected, false);
        assert(first.title.includes("$& $' </script>"));
        // The moving shine must be clipped to the colored fill at every progress level.
        for (const total of [0, 25, 75, 100]) {
            await evaluate(`paintGoal(100,${total},'')`, aContext);
            await until(() => evaluate(`Math.abs(document.getElementById('progressBar').getBoundingClientRect().width / document.getElementById('progressBar').parentElement.getBoundingClientRect().width - ${total / 100}) < 0.005`, aContext), `progress width ${total}%`);
            const shine = await evaluate(`(()=>{const bar=document.getElementById('progressBar');const style=getComputedStyle(bar);const shine=getComputedStyle(bar,'::after');return {x:style.overflowX,y:style.overflowY,animation:shine.animationName,width:parseFloat(shine.width),fill:bar.getBoundingClientRect().width}})()`, aContext);
            assert.equal(shine.x, 'hidden'); assert.equal(shine.y, 'hidden');
            assert.equal(shine.animation, 'shimmer');
            assert(shine.width <= shine.fill + 1, 'shine must fit within the filled portion');
            if (total === 25) {
                // Verify rendered motion rather than only the presence of an animation name.
                const clip = await evaluate(`(()=>{const bar=document.getElementById('progressBar');const animation=bar.getAnimations({subtree:true}).find(item=>item.animationName==='shimmer');animation.pause();animation.currentTime=0;const r=bar.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()`, aContext);
                await delay(50);
                const unlit = await send('Page.captureScreenshot', { format: 'png', clip });
                await evaluate(`document.getElementById('progressBar').getAnimations({subtree:true}).find(item=>item.animationName==='shimmer').currentTime=1500`, aContext);
                await delay(50);
                const lit = await send('Page.captureScreenshot', { format: 'png', clip });
                assert.notEqual(lit.data, unlit.data, 'shine must visibly change the rendered fill during its sweep');
                const preview = await send('Page.captureScreenshot', { format: 'png' });
                fs.mkdirSync(path.join(__dirname, '../docs'), { recursive: true });
                fs.writeFileSync(path.join(__dirname, '../docs/shine-preview.png'), Buffer.from(preview.data, 'base64'));
                await evaluate(`document.getElementById('progressBar').getAnimations({subtree:true}).find(item=>item.animationName==='shimmer').play()`, aContext);
            }
        }
        // A normal data update retains the document instead of adding timers/listeners.
        const changed = JSON.parse(JSON.stringify(fixtures.a));
        changed.type = 'update';
        changed.data.localDonations.data.overall_total.amount = 150;
        await evaluate(`window.applyGoal(${JSON.stringify(changed)})`);
        await until(async () => (await evaluate(inspect, aContext)).status === '$150/$100', 'targeted update');
        assert.equal(await goalContext('b'), bContext);
        // Completed milestones remain visible only when the existing feature requests them.
        const completed = JSON.parse(JSON.stringify(fixtures.b));
        completed.type = 'update';
        completed.data.localDonations.data.overall_total.amount = 100;
        await evaluate(`window.applyGoal(${JSON.stringify(completed)})`);
        await until(async () => (await evaluate(inspect, bContext)).status === '$100/$100', 'all completed milestones return to main');
        await delay(1200);
        assert.equal((await evaluate(inspect, bContext)).status, '$100/$100');
        // Replacement destroys the old context and leaves the other goal's context intact.
        a.templates.colors.progressColor = '#00ff00';
        assert.equal((await tracker.onTriggerEvent({ effect: a })).success, true);
        const replacement = latest('a');
        await evaluate(`window.applyGoal(${JSON.stringify(replacement)})`);
        const replacementContext = await until(async () => { const next = await goalContext('a'); return next && next !== aContext ? next : null; }, 'replacement goal');
        await until(() => !contexts.has(aContext), 'old frame disposal');
        await until(async () => (await evaluate(inspect, replacementContext)).color === '#00ff00', 'replacement palette');
        assert.equal(await goalContext('b'), bContext);
        await evaluate(`window.applyGoal(${JSON.stringify(fixtures.a)})`);
        assert.equal(await goalContext('a'), replacementContext, 'stale revision must not replace a newer goal');
        // Disabling separate row colors restores defaults even though saved custom colors remain.
        await evaluate(`CONFIG.mode.separateInfoColors=true;CONFIG.content.templates.default.colors.infoDonorBackground='#ff00ff';applyThemeColors()`, replacementContext);
        assert.equal(await evaluate(`getComputedStyle(document.getElementById('donorInfo')).backgroundColor`, replacementContext), 'rgb(255, 0, 255)');
        // Old saved Extra Life payloads may contain the red/black default animation palette.
        const legacy = JSON.parse(JSON.stringify(fixtures.a));
        legacy.goalId = legacy.config.goalId = 'goal_legacy_theme'; legacy.uuid = 'legacy-theme';
        Object.assign(legacy.config.extraLife, { useExtraLife: true, useExtraLifeColors: true });
        legacy.config.content.templates.extraLife.animation = { ...legacy.config.content.templates.default.animation };
        delete legacy.config.content.templates.default.animation.headerBackground;
        delete legacy.config.content.templates.default.animation.subheaderBackground;
        legacy.config.mode.showInfoSection = true; legacy.config.mode.showDonationAnimation = true;
        Object.assign(legacy.config.timing, { cycleDelay: 1, animationPreTiming: 1, animationDisplay: 3, animationPostTiming: 1, transition: 0 });
        legacy.data = { extraLife: { sumDonations: 25, fundraisingGoal: 100, donations: [], metadata: { lastUpdated: new Date().toISOString(), participantId: '', eventID: '' } } };
        await evaluate(`window.applyGoal(${JSON.stringify(legacy)})`);
        const legacyContext = await until(() => goalContext('legacy_theme'), 'legacy Extra Life goal');
        await until(() => evaluate(`document.getElementById('donationAnimation').classList.contains('show')`, legacyContext), 'Extra Life animation');
        const palette = await evaluate(`({progress:getComputedStyle(document.documentElement).getPropertyValue('--progressColor').trim(),highlight:getComputedStyle(document.documentElement).getPropertyValue('--animationHighlight').trim(),background:getComputedStyle(document.getElementById('donationAnimation')).backgroundImage,glow:getComputedStyle(document.getElementById('progressBar')).boxShadow,bars:document.querySelectorAll('#progressBar').length})`, legacyContext);
        assert.equal(palette.progress, '#00B4FF'); assert.equal(palette.highlight, '#00B4FF');
        assert(palette.background.includes('27, 40, 56') && palette.background.includes('42, 71, 94'));
        assert.equal(palette.background, 'linear-gradient(135deg, rgb(27, 40, 56), rgb(42, 71, 94))');
        assert(palette.glow.includes('0, 180, 255')); assert.equal(palette.bars, 1);
        const animationSpacing = await evaluate(`['#donationAnimation','.animation-header','.animation-subheader'].map(selector=>{const s=getComputedStyle(document.querySelector(selector));return {padding:s.padding,top:s.marginTop,bottom:s.marginBottom}})`, legacyContext);
        assert.deepEqual(animationSpacing, [
            { padding: '16px 24px', top: '0px', bottom: '0px' },
            { padding: '0px', top: '0px', bottom: '8px' },
            { padding: '12px 16px', top: '8px', bottom: '0px' }
        ], 'animation box and text panels retain their original padding and margins');
        await evaluate(`CONFIG.extraLife.useExtraLifeColors=false;applyThemeColors()`, legacyContext);
        assert.equal((await evaluate(inspect, legacyContext)).color, '#ff0000');
        for (const themed of [false, true]) {
            for (const aligned of [false, true]) {
                for (const style of ['centered', 'gradient', 'solid', 'none']) {
                  for (const subStyle of ['centered', 'gradient', 'solid', 'none']) {
                    const background = await evaluate(`(()=>{
                        CONFIG.extraLife.useExtraLifeColors=${themed};
                        CONFIG.content.templates.default.animation.headerBackground={style:${JSON.stringify(style)},colorOne:'#123456',colorTwo:'#345678'};
                        CONFIG.content.templates.default.animation.subheaderBackground={style:${JSON.stringify(subStyle)},colorOne:'#654321',colorTwo:'#876543'};
                        document.querySelector('.goalWidget').classList.toggle('align-to-track',${aligned});
                        applyThemeColors();
                        const read=node=>{const css=getComputedStyle(node);return {image:css.backgroundImage,color:css.backgroundColor}};
                        const track=document.createElement('div');track.style.backgroundColor='var(--trackColor)';document.body.appendChild(track);
                        const trackColor=getComputedStyle(track).backgroundColor;track.remove();
                        return {parent:read(document.getElementById('donationAnimation')),panels:['.animation-header','.animation-subheader'].map(selector=>read(document.querySelector(selector))),trackColor};
                    })()`, legacyContext);
                    const one = themed ? 'rgb(27, 40, 56)' : 'rgb(17, 17, 17)';
                    const two = themed ? 'rgb(42, 71, 94)' : 'rgb(26, 26, 26)';
                    for (const [index, panel] of background.panels.entries()) {
                        const panelStyle = index === 0 ? style : subStyle;
                        const first = themed ? one : index === 0 ? 'rgb(18, 52, 86)' : 'rgb(101, 67, 33)';
                        const second = themed ? two : index === 0 ? 'rgb(52, 86, 120)' : 'rgb(135, 101, 67)';
                        const expected = panelStyle === 'solid' || panelStyle === 'none' ? 'none' : panelStyle === 'centered'
                            ? `linear-gradient(90deg, ${first} 0%, ${second} 50%, ${first} 100%)`
                            : `linear-gradient(135deg, ${first}, ${second})`;
                        assert.equal(panel.image, expected, `${panelStyle} panel ${index}, Extra Life=${themed}, aligned=${aligned}`);
                        if (panelStyle === 'solid') assert.equal(panel.color, first);
                        if (panelStyle === 'none') assert.equal(panel.color, 'rgba(0, 0, 0, 0)', 'None makes only this text panel transparent');
                    }
                    assert.equal(background.parent.image, aligned ? 'none' : `linear-gradient(135deg, ${one}, ${two})`, 'text-area style must not change the box background');
                    if (aligned) assert.equal(background.parent.color, background.trackColor, 'aligned box retains its track background');
                  }
                }
            }
        }
        await evaluate(`window.applyGoal({type:'remove',goalId:'goal_legacy_theme',revision:${legacy.revision + 1}})`);
        await until(() => !contexts.has(legacyContext), 'legacy theme disposal');
        await evaluate(`CONFIG.mode.separateInfoColors=false;applyThemeColors()`, replacementContext);
        assert.notEqual(await evaluate(`getComputedStyle(document.getElementById('donorInfo')).backgroundColor`, replacementContext), 'rgb(255, 0, 255)');
        await evaluate(`CONFIG.mode.separateInfoColors=true;applyThemeColors()`, replacementContext);
        assert.equal(await evaluate(`getComputedStyle(document.getElementById('donorInfo')).backgroundColor`, replacementContext), 'rgb(255, 0, 255)');
        // Returning the active target to main must preserve the completed-milestone cycling option.
        await manager.onTriggerEvent({ effect: { operation: 'add', goalId: 'b', donorName: 'Bob', donationAmount: 75 } });
        b.showCompletedMilestones = true;
        assert.equal((await tracker.onTriggerEvent({ effect: b })).success, true);
        const showCompleted = latest('b');
        await evaluate(`window.applyGoal(${JSON.stringify(showCompleted)})`);
        const completedContext = await until(async () => { const next = await goalContext('b'); return next && next !== bContext ? next : null; }, 'completed milestones goal');
        await until(async () => ['$100/$50', '$100/$75'].includes((await evaluate(inspect, completedContext)).status), 'completed milestones still cycle');
        fs.mkdirSync(path.join(__dirname, '../docs'), { recursive: true });
        const screenshot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(__dirname, '../docs/browser-smoke.png'), Buffer.from(screenshot.data, 'base64'));
        await evaluate(`window.applyGoal({type:'remove',goalId:'goal_a',revision:${replacement.revision + 1}});window.applyGoal(${JSON.stringify(replacement)})`);
        await until(() => !contexts.has(replacementContext), 'hidden frame disposal');
        assert.equal(await evaluate('document.querySelectorAll("iframe").length'), 1);
        // Connecting remains entirely the user's Firebot event. It must not clear or start goals.
        const eventCount = events.length;
        overlayServer.emit('overlay-connected', 'Default');
        assert.equal(events.length, eventCount);
        assert.equal(await evaluate('document.querySelectorAll("iframe").length'), 1);
        // A fresh browser page ignores polling snapshots; only an effect run creates its goal.
        await send('Page.navigate', { url: address });
        await until(() => evaluate('typeof window.applyGoal === "function"'), 'refreshed host page');
        await evaluate(`window.applyGoal(${JSON.stringify({ ...showCompleted, type: 'update' })})`);
        assert.equal(await evaluate('document.querySelectorAll("iframe").length'), 0);
        assert.equal((await tracker.onTriggerEvent({ effect: a })).success, true);
        await evaluate(`window.applyGoal(${JSON.stringify(latest('a'))})`);
        await until(() => goalContext('a'), 'effect-selected goal after refresh');
        assert.equal(await evaluate('document.querySelectorAll("iframe").length'), 1);
        await require('./widget-layout-browser.cjs')({ tracker, effect, latest, evaluate, send, goalContext, until });
        const sendToContext = (method, params, key) => send(method, params, contexts.get(key)?.sessionId);
        await require('./auto-width-browser.cjs')({ tracker, effect, latest, evaluate, send, sendToContext, goalContext, until });
        assert.deepEqual(errors, [], 'browser and backend exceptions');
        console.log('Browser smoke passed: effect-only creation, no connection listener, refresh without resurrection, two goals, isolated themes/state, clipped shine at 0/25/75/100%, legacy Extra Life animation palette, overfunding, milestones, literal templates, targeted updates, replacement/hide disposal, stale events, row-color toggle.');
    } finally {
        if (errors.length) console.error('Runtime errors:', errors);
        await host?.unload();
        socket?.close();
        if (server) { server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); }
        if (browser && browser.exitCode == null) {
            browser.kill();
            await Promise.race([new Promise(resolve => browser.once('exit', resolve)), delay(3000)]);
        }
        // Delete only the isolated profile created above, after checking its resolved parent and prefix.
        const resolved = path.resolve(profile), tempRoot = path.resolve(os.tmpdir());
        if (path.dirname(resolved) === tempRoot && path.basename(resolved).startsWith('firebot-goals-browser-')) {
            try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* browser descendants may release profile files later */ }
        }
    }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
