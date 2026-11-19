import { PollingRegistry } from '../src/utility/polling-registry';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('keeps independent pollers, prevents overlap, and invalidates replaced work', async () => {
    const registry = new PollingRegistry();
    let finish!: () => void;
    let stillCurrent!: () => boolean;
    const slow = jest.fn(async current => { stillCurrent = current; await new Promise<void>(resolve => { finish = resolve; }); });
    const second = jest.fn(async () => undefined);
    registry.start('a', 1, slow);
    registry.start('b', 1, second);
    jest.advanceTimersByTime(3000);
    expect(slow).toHaveBeenCalledTimes(1);
    expect(stillCurrent()).toBe(true);
    registry.start('a', 1, async () => undefined);
    expect(stillCurrent()).toBe(false);
    finish();
    await Promise.resolve();
    registry.stopAll();
    expect(jest.getTimerCount()).toBe(0);
    expect(second).toHaveBeenCalled();
});

test('reports failed polls without leaving unhandled rejections', async () => {
    const errors = jest.fn();
    const registry = new PollingRegistry(errors);
    registry.start('a', 10, async () => { throw new Error('Offline'); });
    await Promise.resolve();
    await Promise.resolve();
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({ message: 'Offline' }));
    registry.stopAll();
});
