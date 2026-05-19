// server/src/igPlaces/worker.test.ts
import { test, expect, describe, mock } from 'bun:test';
import { createWorkerLoop } from './worker';

describe('createWorkerLoop', () => {
  test('claims up to concurrency jobs per tick', async () => {
    let claimed = 0;
    const claim = mock(async () => claimed++ < 3 ? ({ id: claimed } as any) : null);
    const process = mock(async () => { await new Promise(r => setTimeout(r, 5)); });
    const reapStale = mock(async () => 0);
    const wl = createWorkerLoop({ claim, process, reapStale, concurrency: 3, workerId: 'w' });
    await wl.tick();
    expect(claim).toHaveBeenCalledTimes(4); // 3 successful + 1 null
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
});
