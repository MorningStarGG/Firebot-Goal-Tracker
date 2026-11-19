/* Minimal host for the released 5.67 registration/lifecycle/overlay contracts. No live Firebot access. */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { EventEmitter } = require('node:events');

function loadBundle(api, filename = path.resolve(__dirname, '../dist/MSGG-GoalTracker.js')) {
    const instance = new Module(filename, module);
    instance.filename = filename;
    instance.paths = Module._nodeModulePaths(path.dirname(filename));
    instance.require = name => {
        if (name === '@crowbartools/firebot-types') return { __esModule: true, default: api, ...api };
        if (!Module.isBuiltin(name)) throw new Error(`Unexpected runtime external in single-file plugin: ${name}`);
        return require(name);
    };
    instance._compile(fs.readFileSync(filename, 'utf8'), filename);
    return instance.exports.default ?? instance.exports;
}

function createHost(storagePath, overrides = {}) {
    const effects = [], variables = [], routes = new Map(), frontendHandlers = new Map(), events = [], errors = [];
    const overlayServer = new EventEmitter();
    const api = {
        logger: { debug() {}, info() {}, warn() {}, error(...args) { errors.push(args.map(String).join(' ')); } },
        storage: { path: storagePath },
        plugins: { getInstalledPlugins: async () => [] },
        webServer: { createResourceToken: file => file },
        ...overrides,
    };
    const plugin = loadBundle(api);
    const resolve = entry => typeof entry === 'function' ? entry({ parameters: {} }) : entry;
    const clear = () => { effects.length = 0; variables.length = 0; routes.clear(); frontendHandlers.clear(); };
    return {
        plugin, api, effects, variables, routes, frontendHandlers, events, errors, overlayServer,
        async load() {
            try {
                for (const entry of plugin.registers.effects) {
                    const effect = await resolve(entry), onTriggerEvent = effect.onTriggerEvent;
                    effects.push({ ...effect, onTriggerEvent: event => onTriggerEvent({
                        trigger: {}, outputs: {}, abortSignal: new AbortController().signal,
                        ...event, sendDataToOverlay: (data, overlay) => events.push({ data, overlay }),
                    }) });
                }
                for (const entry of plugin.registers.variables) variables.push(await resolve(entry));
                for (const entry of plugin.registers.frontendListeners) {
                    const listener = await resolve(entry); frontendHandlers.set(listener.eventName, listener.handler);
                }
                const definition = await resolve(plugin.registers.httpRoutes);
                for (const route of definition.routes) routes.set(`/plugins/${definition.prefix}/${route.path.replace(/^\//, '')}`, route.handler);
                await plugin.onLoad({ parameters: {} });
            } catch (error) { clear(); throw error; }
        },
        async unload() {
            try { await plugin.onUnload({ parameters: {} }); }
            finally { clear(); }
        },
    };
}

module.exports = { createHost, loadBundle };
