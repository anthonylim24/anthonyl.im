// server/src/igPlaces/worker.test.ts
import { test, expect, describe, mock } from 'bun:test';
import { createWorkerLoop, processTimeoutFor } from './worker';

describe('createWorkerLoop', () => {
  test('claims up to concurrency jobs per tick', async () => {
    let claimed = 0;
    const claim = mock(async () => claimed++ < 3 ? ({ id: claimed } as any) : null);
    const process = mock(async () => { await new Promise(r => setTimeout(r, 5)); });
    const reapStale = mock(async () => 0);
    const wl = createWorkerLoop({ claim, process, reapStale, concurrency: 3, workerId: 'w' });
    await wl.tick();
    expect(claim).toHaveBeenCalledTimes(3); // 3 successful claims, then loop exits because slots full
    expect(process).toHaveBeenCalledTimes(3);
  });

  test('reapStale called once per tick', async () => {
    const claim = mock(async () => null);
    const reapStale = mock(async () => 0);
    const wl = createWorkerLoop({
      claim, process: mock(async () => {}), reapStale, concurrency: 3, workerId: 'w',
    });
    await wl.tick();
    expect(reapStale).toHaveBeenCalledTimes(1);
  });

  test('stops claiming after stop() called', async () => {
    const claim = mock(async () => ({ id: 1 } as any));
    const wl = createWorkerLoop({
      claim, process: mock(async () => {}), reapStale: mock(async () => 0),
      concurrency: 3, workerId: 'w',
    });
    wl.stop();
    await wl.tick();
    expect(claim).not.toHaveBeenCalled();
  });

  test('overlapping ticks do not claim twice for the same free slots', async () => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    let claimed = 0;
    const claim = mock(async () => {
      await hold;
      return claimed++ < 10 ? ({ id: claimed } as any) : null;
    });
    const wl = createWorkerLoop({
      claim, process: mock(() => new Promise<void>(() => {})), reapStale: mock(async () => 0),
      concurrency: 2, workerId: 'w',
    });
    const first = wl.tick();
    const second = wl.tick(); // the poll timer firing while the first is still claiming
    release();
    await Promise.all([first, second]);
    expect(wl.inflight()).toBe(2);
    expect(claim).toHaveBeenCalledTimes(2);
  });

  test('a job that overruns its deadline is aborted and frees its slot', async () => {
    let seen: AbortSignal | undefined;
    const process = mock((_job: any, signal: AbortSignal) => {
      seen = signal;
      return new Promise<void>(() => {}); // ignores the signal entirely
    });
    const wl = createWorkerLoop({
      claim: mock(async () => ({ id: 1 } as any)), process, reapStale: mock(async () => 0),
      concurrency: 1, workerId: 'w', processTimeoutMs: 5,
    });
    await wl.tick();
    expect(wl.inflight()).toBe(1);
    await Bun.sleep(20);
    expect(seen?.aborted).toBe(true);
    expect(wl.inflight()).toBe(0);
    wl.stop();
  });

  test('a process that rejects does not become an unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (err: unknown) => unhandled.push(err);
    globalThis.process.on('unhandledRejection', onUnhandled);
    try {
      let n = 0;
      const wl = createWorkerLoop({
        claim: mock(async () => (n++ === 0 ? ({ id: 1 } as any) : null)),
        process: mock(async () => { throw new Error('fail rpc down'); }),
        reapStale: mock(async () => 0),
        concurrency: 1, workerId: 'w',
      });
      await wl.tick();
      await Bun.sleep(5);
      expect(unhandled).toEqual([]);
      expect(wl.inflight()).toBe(0);
    } finally {
      globalThis.process.off('unhandledRejection', onUnhandled);
    }
  });

  test('the default deadline sits under the stale-reap threshold', () => {
    expect(processTimeoutFor(600)).toBe(540_000);
    expect(processTimeoutFor(60)).toBe(30_000);
  });
});
