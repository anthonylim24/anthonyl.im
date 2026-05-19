import type { IgJob, IgJobStep } from './types';
import type { SupabaseClient } from './supabase';
import { normalizeInstagramUrl } from './normalizeUrl';

export interface EnqueueResult {
  jobId: number;
  dedupeKey: string;
  status: IgJob['status'];
  reused: boolean;
}

export interface Queue {
  enqueue(userId: string, url: string): Promise<EnqueueResult>;
  claim(workerId: string): Promise<IgJob | null>;
  complete(jobId: number, postId: number): Promise<void>;
  fail(jobId: number, error: Error, retryable: boolean): Promise<void>;
  reapStale(thresholdSec: number): Promise<number>;
  setStep(jobId: number, step: IgJobStep): Promise<void>;
  log(jobId: number, step: IgJobStep, level: 'info' | 'warn' | 'error', message: string): Promise<void>;
  stats(): Promise<{ pending: number; running: number; failed: number; dead: number; done: number }>;
  retryJob(jobId: number, userId: string): Promise<boolean>;
}

export interface QueueDeps {
  normalize?: (url: string) => string;
}

interface JobRow {
  id: number; user_id: string; url: string; dedupe_key: string;
  status: IgJob['status']; step: IgJobStep; step_started_at: string | null;
  attempts: number; max_attempts: number;
  last_error: string | null; scheduled_for: string;
  locked_at: string | null; locked_by: string | null; post_id: number | null;
}

function fromRow(r: JobRow): IgJob {
  return {
    id: r.id, userId: r.user_id, url: r.url, dedupeKey: r.dedupe_key,
    status: r.status, step: r.step, stepStartedAt: r.step_started_at,
    attempts: r.attempts, maxAttempts: r.max_attempts,
    lastError: r.last_error, scheduledFor: r.scheduled_for,
    lockedAt: r.locked_at, lockedBy: r.locked_by, postId: r.post_id,
  };
}

export function createQueue(sb: SupabaseClient, deps: QueueDeps = {}): Queue {
  const normalize = deps.normalize ?? normalizeInstagramUrl;

  return {
    async enqueue(userId, url) {
      const dedupeKey = normalize(url);
      const rows = await sb.rpc<Array<{ id: number; status: IgJob['status']; inserted: boolean }>>(
        'ig_enqueue_job', { p_user_id: userId, p_url: url, p_dedupe_key: dedupeKey });
      const row = rows[0];
      return { jobId: row.id, dedupeKey, status: row.status, reused: !row.inserted };
    },

    async claim(workerId) {
      const rows = await sb.rpc<JobRow[]>('ig_claim_job', { p_worker: workerId });
      return rows.length ? fromRow(rows[0]) : null;
    },

    async complete(jobId, postId) {
      await sb.update('instagram_jobs',
        { status: 'done', step: 'done', post_id: postId, locked_at: null, locked_by: null,
          last_error: null, updated_at: new Date().toISOString() },
        { id: jobId });
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
  };
}
