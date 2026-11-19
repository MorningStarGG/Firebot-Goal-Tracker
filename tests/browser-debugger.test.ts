import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import type { ChildProcess } from 'node:child_process';
const { launchBrowser, stopBrowser } = require('./browser-debugger.cjs');

let directory: string, server: http.Server | undefined;
const children: ChildProcess[] = [];
beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'firebot-browser-startup-'));
});
afterEach(async () => {
    await Promise.all(children.splice(0).map((child) => stopBrowser(child)));
    if (server) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server!.close(() => resolve()));
        server = undefined;
    }
    const resolved = path.resolve(directory);
    if (
        path.dirname(resolved) === path.resolve(os.tmpdir()) &&
        path.basename(resolved).startsWith('firebot-browser-startup-')
    )
        await fs.rm(resolved, { recursive: true, force: true });
});

async function debuggerServer(response: (request: number) => { status?: number; targets?: unknown[] }) {
    let requests = 0;
    server = http.createServer((req, res) => {
        expect(req.url).toBe('/json/list');
        const body = response(++requests);
        res.statusCode = body.status || 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(body.targets || []));
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
    return (server.address() as { port: number }).port;
}
const launchNode = async (script: string, timeoutMs = 4000) => {
    const launched = await launchBrowser(process.execPath, ['-e', script], directory, { timeoutMs, pollMs: 10 });
    children.push(launched.browser);
    return launched;
};

test('discovers stderr debugger announcements and waits until a page target exists', async () => {
    const target = { type: 'page', webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/page/test' };
    let requests = 0;
    const port = await debuggerServer((count) => {
        requests = count;
        return { targets: count < 3 ? [{ type: 'browser' }] : [target] };
    });
    const { page } = await launchNode(
        `process.stderr.write('DevTools listening on ws://127.0.0.1:${port}/devtools/browser/test\\n');setInterval(()=>{},1000);`,
    );
    expect(page).toEqual(target);
    expect(requests).toBeGreaterThanOrEqual(3);
    await expect(fs.access(path.join(directory, 'DevToolsActivePort'))).rejects.toThrow();
});

test('retries partial port files and temporarily unavailable debugger endpoints', async () => {
    const target = { type: 'page', webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/page/test' };
    let requests = 0;
    const port = await debuggerServer((count) => {
        requests = count;
        return count < 3 ? { status: 503 } : { targets: [target] };
    });
    const file = path.join(directory, 'DevToolsActivePort');
    const { page } = await launchNode(
        `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(file)},'');setTimeout(()=>fs.writeFileSync(${JSON.stringify(file)},'${port}\\n/devtools/browser/test'),50);setInterval(()=>{},1000);`,
    );
    expect(page).toEqual(target);
    expect(requests).toBeGreaterThanOrEqual(3);
});

test('reports launch errors instead of waiting for a missing port file', async () => {
    const executable = path.join(directory, 'missing-browser');
    await expect(launchBrowser(executable, [], directory, { timeoutMs: 4000, pollMs: 10 })).rejects.toThrow('ENOENT');
});

test('reports early exit status, executable, stdout and stderr', async () => {
    const operation = launchNode(
        "process.stdout.write('browser wrapper message\\n');process.stderr.write('missing browser dependency\\n');process.exitCode=23;",
    );
    await expect(operation).rejects.toThrow(/code=23/);
    await expect(operation).rejects.toThrow(process.execPath);
    await expect(operation).rejects.toThrow('browser wrapper message');
    await expect(operation).rejects.toThrow('missing browser dependency');
});

test('keeps diagnostics bounded while retaining the latest browser output', async () => {
    let error!: Error;
    try {
        await launchNode(
            "process.stderr.write('discarded-prefix'+'x'.repeat(20000)+'retained-tail');process.exitCode=7;",
        );
    } catch (failure) {
        error = failure as Error;
    }
    expect(error.message).toContain('retained-tail');
    expect(error.message).not.toContain('discarded-prefix');
    expect(error.message.length).toBeLessThan(10000);
});

test('a startup timeout includes diagnostics and terminates the launched process', async () => {
    let error!: Error;
    try {
        await launchNode('setInterval(()=>{},1000);', 1500);
    } catch (failure) {
        error = failure as Error;
    }
    expect(error.message).toContain('not ready within 1500ms');
    expect(error.message).toContain(process.execPath);
    const pid = Number(error.message.match(/Process: pid=(\d+)/)![1]);
    expect(() => process.kill(pid, 0)).toThrow();
}, 10000);
