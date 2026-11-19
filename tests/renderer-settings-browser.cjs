const assert = require('assert/strict');

// Firebot 5.67.0 transports callback.toString() and uses bare eval(raw) in effectOptions.js
// and effect-helper.service.js. Angular then invokes the controller before compiling the template.
exports.page = (tracker, manager) => {
    const serialize = value => JSON.stringify(value).replace(/</g, '\\u003c');
    return `<!doctype html><html><head><meta charset="utf-8"></head><body>
        <div id="settings-host"></div>
        <script src="/test/angular.js"></script>
        <script>
            window.settingsErrors=[];
            window.require=name=>{if(name==='crypto')return {randomUUID:()=>crypto.randomUUID()};throw Error('Unexpected test require: '+name)};
            angular.module('firebotApp',[]).value('utilityService',{showOverlayInfoModal(){}})
                .value('backendCommunicator',{fireEventAsync:async()=>({selectedGoalId:'goal_default',goals:[{goalId:'goal_default'},{goalId:'goal_other'}]})})
                .factory('$exceptionHandler',()=>error=>window.settingsErrors.push(String(error)));
        </script>
        <script src="/test/firebot-input.js"></script>
        <script>
        'use strict';
        (async()=>{
        try {
            const definition=JSON.parse(${serialize(JSON.stringify({ optionsControllerRaw: tracker.optionsController.toString(), optionsValidatorRaw: tracker.optionsValidator.toString() }))});
            const controller=eval(definition.optionsControllerRaw);
            const effectDefinition={optionsValidator:eval(definition.optionsValidatorRaw)};
            if(typeof controller!=='function'||typeof effectDefinition.optionsValidator!=='function')throw Error('Firebot bare eval must return callable settings callbacks');
            const injector=angular.bootstrap(document.getElementById('settings-host'),['firebotApp']);
            const root=injector.get('$rootScope'),compile=injector.get('$compile');
            const template=${serialize(tracker.optionsTemplate)};
            const blank=root.$new();blank.effect={};injector.invoke(controller,{},{$scope:blank});
            const saved=JSON.parse(angular.toJson(blank.effect));blank.$destroy();
            Object.assign(saved,{startDate:'2026-11-06T06:00:00.000Z',endDate:'2026-11-07T06:00:00.000Z',startTime:'1970-01-01T14:30:00.000Z',endTime:'1970-01-01T17:45:00.000Z'});
            delete saved.widgetWidth;delete saved.widgetScale;
            delete saved.display.fixedSectionWidths;
            delete saved.templates.animation.animationBackgroundStyle;
            delete saved.templates.animation.headerBackground;delete saved.templates.animation.subheaderBackground;
            const custom={...saved,widgetWidth:700,widgetScale:125};
            const textDimensions={...saved,widgetWidth:'700',widgetScale:'125'};
            const legacyFixed=JSON.parse(JSON.stringify(saved));legacyFixed.display.infoSection.fixedWidth=true;
            window.settingsResults=[];
            for(const [name,input] of [['new',{}],['legacy',saved],['custom',custom],['numeric-text',textDimensions],['legacy-fixed',legacyFixed]]) {
                const scope=root.$new();scope.effect=JSON.parse(JSON.stringify(input));
                injector.invoke(controller,{},{$scope:scope});
                const host=compile(template)(scope);angular.element(document.getElementById('settings-host')).append(host);root.$digest();
                const query=selector=>document.getElementById('settings-host').querySelector(selector);
                const dimensions=()=>({width:query('firebot-input[model="effect.widgetWidth"] input').value,scale:query('firebot-input[model="effect.widgetScale"] input').value});
                const result={name,values:dimensions(),valid:effectDefinition.optionsValidator(scope.effect,scope),datesAreDates:['startDate','endDate','startTime','endTime'].every(key=>scope.effect[key] instanceof Date&&!isNaN(scope.effect[key]))};
                const header=query('[ng-model="effect.templates.animation.headerBackground.style"]');
                const subheader=query('[ng-model="effect.templates.animation.subheaderBackground.style"]');
                result.animationBackground={initial:[header.value,subheader.value],options:[header.options.length,subheader.options.length]};
                header.value='solid';header.dispatchEvent(new Event('change',{bubbles:true}));root.$digest();
                result.animationBackground.afterHeader=[header.value,subheader.value];
                subheader.value='none';subheader.dispatchEvent(new Event('change',{bubbles:true}));root.$digest();
                const animation=JSON.parse(angular.toJson(scope.effect)).templates.animation;
                result.animationBackground.selected=[animation.headerBackground.style,animation.subheaderBackground.style];
                result.animationBackground.colors=[animation.headerBackground.colorOne,animation.headerBackground.colorTwo,animation.subheaderBackground.colorOne,animation.subheaderBackground.colorTwo];
                result.layoutDefaults={auto:scope.effect.autoWidgetWidth,gaps:['top','bottom','left','right'].map(edge=>query('firebot-input[model="effect.overlayGaps.'+edge+'"] input').value)};
                const auto=query('[ng-model="effect.autoWidgetWidth"]');auto.click();root.$digest();result.autoEnabled=scope.effect.autoWidgetWidth;
                const fixedInfo=query('[ng-model="effect.display.fixedSectionWidths"]');
                result.fixedInfo={initial:scope.effect.display.fixedSectionWidths,visible:!!fixedInfo};
                fixedInfo.click();root.$digest();
                result.fixedInfo.saved=JSON.parse(angular.toJson(scope.effect)).display.fixedSectionWidths;
                auto.click();root.$digest();result.fixedInfo.hidden=!query('[ng-model="effect.display.fixedSectionWidths"]');
                auto.click();root.$digest();result.fixedInfo.retained=scope.effect.display.fixedSectionWidths;
                const top=query('firebot-input[model="effect.overlayGaps.top"] input');top.value='60';top.dispatchEvent(new Event('input',{bubbles:true}));root.$digest();
                result.topGap=scope.effect.overlayGaps.top;
                scope.effect.position='Custom';root.$digest();result.customHidesGaps=!query('firebot-input[model="effect.overlayGaps.top"]');
                scope.effect.position='Top Middle';root.$digest();
                if(name!=='new') {
                    result.dates=['startDate','endDate','startTime','endTime'].map(key=>query('[ng-model="effect.'+key+'"]').value);
                    result.savedDate=JSON.parse(angular.toJson(scope.effect)).startDate;
                }
                const scaleInput=query('firebot-input[model="effect.widgetScale"] input');
                scaleInput.value='0';scaleInput.dispatchEvent(new Event('input',{bubbles:true}));root.$digest();
                result.invalid=effectDefinition.optionsValidator(scope.effect,scope);
                scaleInput.value=name==='custom'||name==='numeric-text'?'125':'100';scaleInput.dispatchEvent(new Event('input',{bubbles:true}));root.$digest();
                result.saved=effectDefinition.optionsValidator(scope.effect,scope);
                window.settingsResults.push(result);
                scope.$destroy();host.remove();
            }
            const managerController=eval(${serialize(manager.optionsController.toString())});
            const managerScope=root.$new();managerScope.effect={};injector.invoke(managerController,{},{$scope:managerScope});
            await new Promise(resolve=>setTimeout(resolve,50));root.$digest();
            const managerHost=compile(${serialize(manager.optionsTemplate)})(managerScope);
            angular.element(document.getElementById('settings-host')).append(managerHost);root.$digest();
            const managerQuery=selector=>document.getElementById('settings-host').querySelector(selector);
            const operation=managerQuery('[ng-model="effect.operation"]');
            window.managerSettingsResult={goal:managerScope.effect.goalId,defaultAction:managerScope.effect.operation,actions:operation.querySelectorAll('option').length,name:!!managerQuery('firebot-input[model="effect.donorName"]'),amount:!!managerQuery('firebot-input[model="effect.donationAmount"]')};
            operation.value='resetUser';operation.dispatchEvent(new Event('change',{bubbles:true}));root.$digest();
            window.managerSettingsResult.userReset={name:!!managerQuery('firebot-input[model="effect.donorName"]'),amount:!!managerQuery('firebot-input[model="effect.donationAmount"]')};
            operation.value='resetRemoteGoals';operation.dispatchEvent(new Event('change',{bubbles:true}));root.$digest();
            window.managerSettingsResult.remoteReset={name:!!managerQuery('firebot-input[model="effect.donorName"]'),warning:!!managerQuery('.alert-warning')};
            managerScope.$destroy();managerHost.remove();
        } catch(error) {window.settingsErrors.push(String(error));}
        window.settingsDone=true;
        })();
        </script></body></html>`;
};

exports.verify = async ({ send, evaluate, until, address }) => {
    await send('Emulation.setTimezoneOverride', { timezoneId: 'America/Chicago' });
    await send('Page.navigate', { url: `${address}/test/settings.html` });
    await until(() => evaluate('window.settingsDone===true'), 'Angular settings initialization');
    assert.deepEqual(await evaluate('window.settingsErrors'), [], 'Angular settings exceptions');
    const results = await evaluate('window.settingsResults');
    assert.equal(results.length, 5);
    for (const result of results) {
        assert.deepEqual(result.values, result.name === 'custom' || result.name === 'numeric-text' ? { width: '700', scale: '125' } : { width: '475', scale: '100' }, 'rendered width/scale values');
        assert.equal(result.datesAreDates, true, 'Angular date models must be Date objects');
        assert.deepEqual(result.animationBackground, { initial: ['none','gradient'], options: [4,4], afterHeader: ['solid','gradient'], selected: ['solid','none'], colors: ['#111111','#1a1a1a','#111111','#1a1a1a'] });
        assert.deepEqual(result.layoutDefaults, { auto: false, gaps: ['0', '0', '0', '0'] });
        assert.equal(result.autoEnabled, true); assert.equal(result.topGap, 60); assert.equal(result.customHidesGaps, true);
        const wasFixed = result.name === 'legacy-fixed';
        assert.deepEqual(result.fixedInfo, { initial: wasFixed, visible: true, saved: !wasFixed, hidden: true, retained: !wasFixed });
        assert.deepEqual(result.valid, []); assert.deepEqual(result.saved, []);
        assert.deepEqual(result.invalid, ['Widget Scale must be between 10 and 300 percent']);
        if (result.name !== 'new') {
            assert.deepEqual(result.dates, ['2026-11-06', '2026-11-07', '08:30:00.000', '11:45:00.000']);
            assert.equal(result.savedDate, '2026-11-06T06:00:00.000Z', 'saving must preserve the selected local calendar day');
        }
    }
    assert.deepEqual(await evaluate('window.managerSettingsResult'), { goal: 'goal_default', defaultAction: 'add', actions: 8, name: true, amount: true, userReset: { name: true, amount: false }, remoteReset: { name: false, warning: true } });
    console.log('Renderer settings passed: Firebot bare eval, Angular injection, full template with Firebot input component, visible defaults/custom values, save validation, ISO date/time restoration without shifting days.');
};
