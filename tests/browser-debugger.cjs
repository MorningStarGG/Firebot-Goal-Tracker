const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function stopBrowser(browser) {
    if (
        !browser.pid ||
        ((browser.exitCode !== null || browser.signalCode !== null) &&
            browser.stdout.destroyed &&
            browser.stderr.destroyed)
    )
        return;
    await new Promise((resolve) => {
        const finish = () => {
            clearTimeout(timer);
            browser.removeListener('close', finish);
            resolve();
        };
        const timer = setTimeout(finish, 3000);
        browser.once('close', finish);
        if (browser.exitCode === null && browser.signalCode === null) {
            try {
                browser.kill();
            } catch {
                finish();
            }
        }
    });
}

/** Wait for a running browser and an actual page debugger, preserving bounded startup diagnostics. */
async function launchBrowser(executable, args, profile, { timeoutMs = 30_000, pollMs = 100 } = {}) {
    const browser = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '',
        announcedPort,
        failure,
        lastReadinessError = 'No debugger port announced';
    const capture = (chunk) => {
        const text = output + chunk.toString();
        const announcements = [...text.matchAll(/DevTools listening on (ws:\/\/[^\s]+)/g)];
        if (announcements.length) {
            try {
                announcedPort = Number(new URL(announcements.at(-1)[1]).port);
            } catch {}
        }
        output = text.slice(-8192);
    };
    browser.stdout.on('data', capture);
    browser.stderr.on('data', capture);
    browser.once('error', (error) => {
        failure = `Browser failed to launch: ${error.message}`;
    });
    browser.once('exit', (code, signal) => {
        failure = `Browser exited before its debugger was ready (code=${code}, signal=${signal || 'none'})`;
    });
    const deadline = Date.now() + timeoutMs;
    try {
        while (Date.now() < deadline) {
            if (failure) throw new Error(failure);
            let port = announcedPort;
            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                try {
                    port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
                } catch (error) {
                    if (error.code !== 'ENOENT') lastReadinessError = error.message;
                }
            }
            if (Number.isInteger(port) && port > 0 && port <= 65535) {
                try {
                    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
                        signal: AbortSignal.timeout(Math.max(1, Math.min(1500, deadline - Date.now()))),
                    });
                    if (!response.ok) throw new Error(`Debugger endpoint returned HTTP ${response.status}`);
                    const pages = await response.json();
                    const page =
                        Array.isArray(pages) &&
                        pages.find((candidate) => candidate.type === 'page' && candidate.webSocketDebuggerUrl);
                    if (failure) throw new Error(failure);
                    if (page) return { browser, page };
                    lastReadinessError = 'Debugger endpoint has no page target yet';
                } catch (error) {
                    lastReadinessError = error.message;
                }
            }
            await delay(Math.min(pollMs, Math.max(0, deadline - Date.now())));
        }
        throw new Error(failure || `Browser debugger was not ready within ${timeoutMs}ms`);
    } catch (error) {
        await stopBrowser(browser);
        throw new Error(
            `${error.message}\nExecutable: ${executable}\nProcess: pid=${browser.pid || 'none'}, code=${browser.exitCode}, signal=${browser.signalCode || 'none'}\nLast readiness check: ${lastReadinessError}\nBrowser output:\n${output.trim() || '(no output captured)'}`,
        );
    }
}

module.exports = { launchBrowser, stopBrowser };
