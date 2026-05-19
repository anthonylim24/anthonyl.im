// server/src/igPlaces/worker.ts
import type { IgJob } from './types';

export interface WorkerDeps {
  claim:     (workerId: string) => Promise<IgJob | null>;
  process:   (job: IgJob) => Promise<void>;
  reapStale: (thresholdSec: number) => Promise<number>;
  concurrency: number;
  workerId: string;
  staleThresholdSec?: number;
}

export interface WorkerLoop {
  tick(): Promise<void>;
  stop(): void;
  inflight(): number;
}

export function createWorkerLoop(deps: WorkerDeps): WorkerLoop {
  const slots = new Set<Promise<unknown>>();
  let stopped = false;

  return {
    async tick() {
      if (stopped) return;
      await deps.reapStale(deps.staleThresholdSec ?? 600).catch(err =>
        console.warn('[ig-worker] reap error', err));
      while (!stopped && slots.size < deps.concurrency) {
        const job = await deps.claim(deps.workerId).catch(() => null);
        if (!job) break;
        const p = deps.process(job).finally(() => { slots.delete(p); });
        slots.add(p);
      }
    },
    stop() { stopped = true; },
    inflight() { return slots.size; },
  };
}
