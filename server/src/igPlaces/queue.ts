import { transition, type IgJob, type IgJobStatus, type IgJobStep } from './types';
import type { SupabaseClient } from './supabase';
import { normalizeInstagramUrl } from './normalizeUrl';

export interface EnqueueResult {
  jobId: number;
  dedupeKey: string;
  status: IgJobStatus;
  reused: boolean;
  shared_from_other_user?: number;
}

export interface Queue {
  enqueue(userId: string, url: string, opts?: { skipVideo?: boolean }): Promise<EnqueueResult>;
  claim(workerId: string): Promise<IgJob | null>;
  /** Mark a running job done. A job that is no longer running (reaped,
   *  retried) is left alone: a late worker must not finish someone else's run. */
  complete(job: IgJob, postId: number): Promise<void>;
  fail(jobId: number, error: Error, retryable: boolean): Promise<void>;
  reapStale(thresholdSec: number): Promise<number>;
  setStep(jobId: number, step: IgJobStep): Promise<void>;
  log(jobId: number, step: IgJobStep, level: 'info' | 'warn' | 'error', message: string): Promise<void>;
  stats(): Promise<{ pending: number; running: number; failed: number; dead: number; done: number }>;
  retryJob(jobId: number, userId: string): Promise<boolean>;
  reextractJob(jobId: number, userId: string): Promise<boolean>;
  shareFromOtherUser(userId: string, dedupeKey: string): Promise<number>;
}

export interface QueueDeps {
  normalize?: (url: string) => string;
}

/** Status as stored. 'failed' is a legacy enum value nothing writes any more. */
type StoredStatus = IgJobStatus | 'failed';

interface JobRow {
  id: number; user_id: string; url: string; dedupe_key: string;
  status: StoredStatus; step: IgJobStep; step_started_at: string | null;
  attempts: number; max_attempts: number;
  last_error: string | null; scheduled_for: string;
  locked_at: string | null; locked_by: string | null; post_id: number | null;
  skip_video: boolean;
}

/** Read a row into the job union. Rows the union cannot describe (a legacy
 *  'failed', a done row without a post) are read as the nearest real state. */
export function fromRow(r: JobRow): IgJob {
  const fields = {
    id: r.id, userId: r.user_id, url: r.url, dedupeKey: r.dedupe_key,
    step: r.step, stepStartedAt: r.step_started_at,
    attempts: r.attempts, maxAttempts: r.max_attempts,
    lastError: r.last_error, scheduledFor: r.scheduled_for,
    postId: r.post_id,
    skipVideo: r.skip_video ?? false,
  };
  const unlocked = { lockedAt: null, lockedBy: null } as const;
  switch (r.status) {
    case 'running':
      return { ...fields, status: 'running', lockedAt: r.locked_at ?? '', lockedBy: r.locked_by ?? '' };
    case 'done':
      return r.post_id != null
        ? { ...fields, ...unlocked, status: 'done', postId: r.post_id }
        : { ...fields, ...unlocked, status: 'dead' };
    case 'pending':
      return { ...fields, ...unlocked, status: 'pending' };
    case 'dead':
    case 'failed':
      return { ...fields, ...unlocked, status: 'dead' };
  }
}

export function createQueue(sb: SupabaseClient, deps: QueueDeps = {}): Queue {
  const normalize = deps.normalize ?? normalizeInstagramUrl;

  async function shareFromOtherUser(userId: string, dedupeKey: string): Promise<number> {
    const result = await sb.rpc<number>('ig_share_places_from_other_user', {
      p_user_id: userId, p_dedupe_key: dedupeKey,
    });
    return typeof result === 'number' ? result : 0;
  }

  return {
    async enqueue(userId, url, opts = {}) {
      const dedupeKey = normalize(url);
      const rows = await sb.rpc<Array<{ id: number; status: StoredStatus; inserted: boolean }>>(
        'ig_enqueue_job', { p_user_id: userId, p_url: url, p_dedupe_key: dedupeKey, p_skip_video: opts.skipVideo ?? false });
      const row = rows[0];
      const reused = !row.inserted;
      const status: IgJobStatus = row.status === 'failed' ? 'dead' : row.status;
      const result: EnqueueResult = { jobId: row.id, dedupeKey, status, reused };

      // For a brand-new job (not a re-use), check if another user already
      // has done this URL and copy their places instantly. Sharing is a
      // shortcut: when it fails, the job simply runs the normal pipeline,
      // and the rest of the caller's batch carries on.
      if (!reused) {
        try {
          const shared = await shareFromOtherUser(userId, dedupeKey);
          if (shared > 0) {
            result.status = 'done';
            result.shared_from_other_user = shared;
          }
        } catch (err) {
          console.warn(`[ig-queue] share failed for job ${row.id}; running the pipeline instead:`,
            err instanceof Error ? err.message : err);
        }
      }

      return result;
    },

    async claim(workerId) {
      const rows = await sb.rpc<JobRow[]>('ig_claim_job', { p_worker: workerId });
      return rows.length ? fromRow(rows[0]) : null;
    },

    async complete(job, postId) {
      const done = transition(job, { type: 'complete', postId });
      if (!done) {
        console.warn(`[ig-queue] complete ignored for job ${job.id} in state ${job.status}`);
        return;
      }
      await sb.update('instagram_jobs',
        { status: done.status, step: done.step, post_id: done.postId, locked_at: done.lockedAt,
          locked_by: done.lockedBy, last_error: done.lastError, updated_at: new Date().toISOString() },
        { id: job.id, status: 'running' });
    },

    async setStep(jobId, step) {
      await sb.rpc('ig_set_job_step', { p_job_id: jobId, p_step: step });
    },

    async log(jobId, step, level, message) {
      try {
        await sb.rpc('ig_log_job', { p_job_id: jobId, p_step: step, p_level: level, p_message: message });
      } catch (err) {
        console.warn('[ig-queue] log failed:', err);
      }
    },

    async fail(jobId, error, retryable) {
      await sb.rpc('ig_fail_job', {
        p_job_id: jobId,
        p_error: error.message.slice(0, 500),
        p_retryable: retryable,
      });
    },

    async reapStale(thresholdSec) {
      const n = await sb.rpc<number>('ig_reap_stale', { p_threshold_sec: thresholdSec });
      return typeof n === 'number' ? n : 0;
    },

    async stats() {
      const rows = await sb.select<{ status: string; count: string }>(
        'instagram_jobs', { select: 'status' });
      // PostgREST: we count by status in app code since aggregation API is more verbose
      const counts = { pending: 0, running: 0, failed: 0, dead: 0, done: 0 } as Record<string, number>;
      for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
      return counts as { pending: number; running: number; failed: number; dead: number; done: number };
    },

    async retryJob(jobId, userId) {
      const result = await sb.rpc<boolean>('ig_retry_job', { p_id: jobId, p_user_id: userId });
      return Boolean(result);
    },

    async reextractJob(jobId, userId) {
      const result = await sb.rpc<boolean>('ig_reextract_job', { p_id: jobId, p_user_id: userId });
      return Boolean(result);
    },

    shareFromOtherUser,
  };
}
