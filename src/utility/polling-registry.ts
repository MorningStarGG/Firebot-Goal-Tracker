/** One non-overlapping poller per stable goal; replacing it invalidates in-flight work. */
export class PollingRegistry {
    private entries = new Map<string, { timer?: NodeJS.Timeout; running: boolean }>();
    constructor(private onError: (error: unknown) => void = error => console.error('Goal poll failed:', error)) { }

    start(id: string, seconds: number, poll: (isCurrent: () => boolean) => Promise<void>): void {
        this.stop(id);
        const entry: { timer?: NodeJS.Timeout; running: boolean } = { running: false };
        this.entries.set(id, entry);
        const isCurrent = () => this.entries.get(id) === entry;
        const tick = async () => {
            if (!isCurrent() || entry.running) return;
            entry.running = true;
            try { await poll(isCurrent); }
            catch (error) { this.onError(error); }
            finally { entry.running = false; }
        };
        entry.timer = setInterval(() => { void tick(); }, Math.max(1, seconds) * 1000);
        void tick();
    }

    stop(id: string): void {
        const entry = this.entries.get(id);
        if (entry?.timer) clearInterval(entry.timer);
        this.entries.delete(id);
    }

    stopAll(): void { for (const id of this.entries.keys()) this.stop(id); }
}
