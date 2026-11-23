// server/src/igPlaces/worker.ts
import type { IgJob } from './types';

export interface WorkerDeps {
  claim:     (workerId: string) => Promise<IgJob | null>;
  /** Runs one job. The signal aborts when the job runs out of time; the
   *  processor then fails the job (retryable) and stops at its next step. */
  process:   (job: IgJob, signal: AbortSignal) => Promise<void>;
  reapStale: (thresholdSec: number) => Promise<number>;
  concurrency: number;
  workerId: string;
  staleThresholdSec?: number;
  /** Hard cap on one job. Defaults to a minute under the stale threshold
   *  (at least half of it), so a slow job is failed by its own worker
   *  before the reaper could hand it to a second one. */
  processTimeoutMs?: number;
}

export interface WorkerLoop {
  tick(): Promise<void>;
  kick(): void;
  start(sweepMs: number): void;
  stop(): void;
  inflight(): number;
}

const DEFAULT_STALE_SEC = 600;

export function processTimeoutFor(staleThresholdSec: number): number {
  const staleMs = staleThresholdSec * 1000;
  return Math.max(staleMs / 2, staleMs - 60_000);
}

export function createWorkerLoop(deps: WorkerDeps): WorkerLoop {
  const slots = new Set<Promise<unknown>>();
  const staleSec = deps.staleThresholdSec ?? DEFAULT_STALE_SEC;
  const timeoutMs = deps.processTimeoutMs ?? processTimeoutFor(staleSec);
  let state: 'idle' | 'running' | 'stopped' = 'idle';
  const stopped = () => state === 'stopped';
  let sweep: ReturnType<typeof setInterval> | undefined;
  let ticking = false;
  let tickAgain = false;

  function run(job: IgJob): Promise<void> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error(`job timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
    // Free the slot at the deadline even if the processor ignores the signal.
    const deadline = new Promise<void>((resolve) => ctrl.signal.addEventListener('abort', () => resolve(), { once: true }));
    return Promise.race([deps.process(job, ctrl.signal), deadline])
      .catch((err) => {
        // process() is meant to settle the job itself; reaching here means
        // even that failed (e.g. the fail RPC threw). The reaper will
        // recover the row; the loop must not die of an unhandled rejection.
        console.warn(`[ig-worker] job ${job.id} ended with an unhandled error:`, err instanceof Error ? err.message : err);
      })
      .finally(() => clearTimeout(timer));
  }

  async function tick() {
    if (stopped()) return;
    if (ticking) {
      tickAgain = true;
      return;
    }
    ticking = true;
    try {
      do {
        tickAgain = false;
        await deps.reapStale(staleSec).catch(err =>
          console.warn('[ig-worker] reap error', err));
        while (!stopped() && slots.size < deps.concurrency) {
          const job = await deps.claim(deps.workerId).catch(() => null);
          if (!job) break;
          const p: Promise<void> = run(job).finally(() => {
            slots.delete(p);
            kick();
          });
          slots.add(p);
        }
      } while (tickAgain && !stopped());
    } finally {
      ticking = false;
    }
  }

  function kick() {
    if (state === 'running') void tick();
  }

  return {
    tick,
    kick,
    start(sweepMs) {
      if (state !== 'idle') return;
      state = 'running';
      sweep = setInterval(() => void tick(), sweepMs);
      void tick();
    },
    stop() {
      state = 'stopped';
      clearInterval(sweep);
    },
    inflight() { return slots.size; },
  };
}
