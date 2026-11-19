import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { JsonDB, Config } from 'node-json-db';
import { GoalStore } from './goal-store';

async function readDatabase(file: string): Promise<{ text: string; data: Record<string, unknown> } | undefined> {
    let text: string;
    try { text = await fs.readFile(file, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
    let data: unknown;
    try { data = JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch { throw new Error(`Goal database is not valid JSON: ${file}`); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`Invalid goal database: ${file}`);
    const root = data as Record<string, unknown>;
    for (const key of ['goals', 'goal']) {
        if (root[key] !== undefined && (!root[key] || typeof root[key] !== 'object' || Array.isArray(root[key]))) throw new Error(`Invalid ${key} in goal database: ${file}`);
    }
    if (root.goals && Object.values(root.goals).some(goal => !goal || typeof goal !== 'object' || Array.isArray(goal))) throw new Error(`Invalid goal record in database: ${file}`);
    if (root.schemaVersion != null && (!Number.isInteger(root.schemaVersion) || Number(root.schemaVersion) < 0 || Number(root.schemaVersion) > 4)) {
        throw new Error(`Unsupported goal database schema: ${file}`);
    }
    return { text, data: root };
}

/** Import only the current profile's legacy database; never overwrite an existing plugin database. */
export async function openPluginDatabase(storagePath: string): Promise<JsonDB> {
    const root = path.resolve(storagePath);
    const target = path.join(root, 'goalTracker.db');
    const open = () => new JsonDB(new Config(target, true, true));
    const existing = await readDatabase(target);
    if (existing) {
        const db = open();
        await new GoalStore(db).initialize();
        return db;
    }
    // Firebot 5.67 scopes storage to <profile>/script-data/<installed-plugin-id>.
    const legacyFile = path.basename(path.dirname(root)) === 'script-data'
        ? path.join(path.dirname(path.dirname(root)), 'db', 'goalTracker.db') : undefined;
    const legacy = legacyFile ? await readDatabase(legacyFile) : undefined;
    await fs.mkdir(root, { recursive: true });
    const stage = path.join(root, `.goalTracker-${randomUUID()}.tmp`);
    try {
        if (legacy) {
            try { await fs.writeFile(path.join(root, 'legacy-goalTracker.db.backup'), legacy.text, { flag: 'wx' }); }
            catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
        }
        const staging = new JsonDB(new Config(stage, true, true));
        await staging.push('/', legacy?.data || {}, true);
        await new GoalStore(staging).initialize();
        if (legacy) await staging.push('/pluginMigration', {
            importedAt: new Date().toISOString(),
            source: 'profile/db/goalTracker.db',
            sha256: createHash('sha256').update(legacy.text).digest('hex'),
        }, true);
        // Publishing a hard link is atomic and fails if a destination appeared meanwhile.
        try { await fs.link(stage, target); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    } finally { await fs.rm(stage, { force: true }); }
    // Validate the authoritative file again if another initializer won the publication race.
    await readDatabase(target);
    return open();
}
