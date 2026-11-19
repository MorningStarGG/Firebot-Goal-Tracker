import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { manifest } from '../src/manifest';
import { removeTestDirectory } from './temp-files';

const { loadBundle, createHost } = require('./plugin-host.cjs');
const { prepareRelease } = require('../scripts/prepare-release.cjs');
let temp: string;
beforeEach(async () => { temp = await fs.mkdtemp(path.join(os.tmpdir(), 'firebot-artifact-test-')); });
afterEach(async () => { await removeTestDirectory(temp, 'firebot-artifact-test-'); });

test('single-file bundle can be inspected without a runtime API and retains native metadata', async () => {
    const unavailableApi = new Proxy({}, { get(_target, key) { throw new Error(`Runtime API accessed during inspection: ${String(key)}`); } });
    const plugin = loadBundle(unavailableApi);
    expect(plugin.manifest).toEqual(manifest);
    expect(plugin.manifest.minimumFirebotVersion).toEqual({ major: 5, minor: 67, patch: 0 });
    expect(plugin.getScriptManifest).toBeUndefined();
    expect(plugin.registers.effects).toHaveLength(2);
    expect(plugin.registers.variables.map((variable: any) => variable.definition.handle).sort()).toEqual(['goalDonation', 'goalInfo', 'goalMilestones']);
    expect(await fs.readdir(path.resolve(__dirname, '../dist'))).toEqual(['MSGG-GoalTracker.js']);
});

test('built plugin reloads cleanly with host-managed registrations and preserves inactive saved data', async () => {
    const host = createHost(path.join(temp, 'script-data', 'test-plugin'));
    try {
        await host.load();
        expect(host.effects).toHaveLength(2);
        expect(host.variables).toHaveLength(3);
        expect([...host.routes.keys()]).toEqual(['/plugins/goal-tracker/goal-tracker.html']);
        expect(host.frontendHandlers.size).toBe(1);
        expect(host.events).toEqual([]);
        await host.unload();
        expect(host.effects).toEqual([]);
        expect(host.frontendHandlers.size).toBe(0);
        await host.load();
        expect(host.effects).toHaveLength(2);
        expect(host.events).toEqual([]);
        expect(host.errors).toEqual([]);
    } finally { await host.unload(); }
});

test('release artifacts identify and hash exactly the built plugin and reject a mismatched tag', async () => {
    const tag = `v${manifest.version}`;
    const result = prepareRelease({ tag, outputDirectory: temp, releaseDate: '2026-11-15T12:00:00.000Z' });
    const binary = await fs.readFile(path.resolve(__dirname, '../dist/MSGG-GoalTracker.js'));
    expect(result.manifest).toMatchObject({ name: manifest.name, author: manifest.author, version: manifest.version,
        type: 'single-file', minimumFirebotVersion: manifest.minimumFirebotVersion,
        sha256: createHash('sha256').update(binary).digest('hex') });
    expect(result.manifest.downloadUrl).toBe(`${manifest.repo}/releases/download/${tag}/MSGG-GoalTracker.js`);
    expect(await fs.readFile(path.join(temp, 'SHA256SUMS'), 'utf8')).toBe(`${result.manifest.sha256}  MSGG-GoalTracker.js\n`);
    expect(JSON.parse(await fs.readFile(path.join(temp, 'community-plugin.json'), 'utf8'))).toEqual(result.manifest);
    expect(() => prepareRelease({ tag: 'v0.0.0', outputDirectory: temp })).toThrow('must match package version');
});
