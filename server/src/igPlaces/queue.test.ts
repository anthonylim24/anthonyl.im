import { test, expect, describe, mock } from 'bun:test';
import { createQueue, fromRow } from './queue';
import type { SupabaseClient } from './supabase';
import { transition, type IgJob } from './types';

function stubSupabase(impl: Partial<SupabaseClient>): SupabaseClient {
  return {
    select: mock(() => Promise.resolve([])),
    insert: mock(() => Promise.resolve([])),
    update: mock(() => Promise.resolve([])),
    rpc:    mock(() => Promise.resolve(null)),
    ...impl,
  } as SupabaseClient;
}

describe('queue.enqueue', () => {
  test('returns reused: false when inserted=true', async () => {
    const sb = stubSupabase({
      rpc: mock(async () => [{ id: 7, status: 'pending', inserted: true }]),
    });
    const q = createQueue(sb, { normalize: (u) => u });
    const r = await q.enqueue('user-1', 'https://www.instagram.com/p/A');
    expect(r.jobId).toBe(7);
    expect(r.reused).toBe(false);
  });
  test('returns reused: true when inserted=false', async () => {
    const sb = stubSupabase({
      rpc: mock(async () => [{ id: 7, status: 'running', inserted: false }]),
    });
    const q = createQueue(sb, { normalize: (u) => u });
    const r = await q.enqueue('user-1', 'https://www.instagram.com/p/A');
    expect(r.reused).toBe(true);
    expect(r.status).toBe('running');
  });
  test('passes p_skip_video=true to ig_enqueue_job rpc', async () => {
    const rpc = mock(async () => [{ id: 8, status: 'pending', inserted: true }]);
    const sb = stubSupabase({ rpc });
    const q = createQueue(sb, { normalize: (u) => u });
    await q.enqueue('user-1', 'https://www.instagram.com/p/A', { skipVideo: true });
    expect(rpc).toHaveBeenCalledWith('ig_enqueue_job', {
      p_user_id: 'user-1',
      p_url: 'https://www.instagram.com/p/A',
      p_dedupe_key: 'https://www.instagram.com/p/A',
      p_skip_video: true,
    });
  });
  test('passes p_skip_video=false when opts omitted', async () => {
    const rpc = mock(async () => [{ id: 9, status: 'pending', inserted: true }]);
    const sb = stubSupabase({ rpc });
    const q = createQueue(sb, { normalize: (u) => u });
    await q.enqueue('user-2', 'https://www.instagram.com/p/B');
    expect(rpc).toHaveBeenCalledWith('ig_enqueue_job', expect.objectContaining({ p_skip_video: false }));
  });
});

describe('queue.claim', () => {
  test('returns null when no job available', async () => {
    const sb = stubSupabase({ rpc: mock(async () => []) });
    const q = createQueue(sb, { normalize: (u) => u });
    expect(await q.claim('w1')).toBeNull();
  });
  test('returns a job when one is claimable', async () => {
    const sb = stubSupabase({
      rpc: mock(async () => [{
        id: 1, user_id: 'u', url: 'https://i', dedupe_key: 'd',
        status: 'running', step: 'queued', attempts: 1, max_attempts: 5, last_error: null,
        scheduled_for: 'x', locked_at: 'y', locked_by: 'w1', post_id: null,
      }]),
    });
    const q = createQueue(sb, { normalize: (u) => u });
    const j = await q.claim('w1');
    expect(j?.id).toBe(1);
    expect(j?.lockedBy).toBe('w1');
    expect(j?.step).toBe('queued');
  });
});

describe('queue.fail', () => {
  test('passes retryable=false through to rpc', async () => {
    const rpc = mock(async () => null);
    const sb = stubSupabase({ rpc });
    const q = createQueue(sb, { normalize: (u) => u });
    await q.fail(42, new Error('bad'), false);
    expect(rpc).toHaveBeenCalledWith('ig_fail_job',
      { p_job_id: 42, p_error: 'bad', p_retryable: false });
  });
});

describe('queue.setStep', () => {
  test('calls ig_set_job_step rpc with correct args', async () => {
    const rpc = mock(async () => null);
    const sb = stubSupabase({ rpc });
    const q = createQueue(sb, { normalize: (u) => u });
    await q.setStep(42, 'extracting');
    expect(rpc).toHaveBeenCalledWith('ig_set_job_step', { p_job_id: 42, p_step: 'extracting' });
  });
});

describe('queue.stats', () => {
  test('aggregates row counts by status', async () => {
    const sb = stubSupabase({
      select: mock(async () => [
        { status: 'pending' }, { status: 'pending' }, { status: 'running' },
        { status: 'done' }, { status: 'dead' },
      ]),
    });
    const q = createQueue(sb, { normalize: (u) => u });
    const s = await q.stats();
    expect(s.pending).toBe(2);
    expect(s.running).toBe(1);
    expect(s.done).toBe(1);
    expect(s.dead).toBe(1);
    expect(s.failed).toBe(0);
  });
});

describe('queue.retryJob', () => {
  test('passes id + userId to rpc and returns boolean', async () => {
    const rpc = mock(async () => true);
    const sb = stubSupabase({ rpc });
    const q = createQueue(sb, { normalize: (u) => u });
    const r = await q.retryJob(42, 'u-1');
    expect(rpc).toHaveBeenCalledWith('ig_retry_job', { p_id: 42, p_user_id: 'u-1' });
    expect(r).toBe(true);
  });
});

describe('queue.log', () => {
  test('passes args to ig_log_job rpc; never throws', async () => {
    const rpc = mock(async () => { throw new Error('db down'); });
    const sb = stubSupabase({ rpc });
    const q = createQueue(sb, { normalize: (u) => u });
    await q.log(7, 'fetching', 'info', 'hello'); // must not throw
    expect(rpc).toHaveBeenCalledWith('ig_log_job', {
      p_job_id: 7, p_step: 'fetching', p_level: 'info', p_message: 'hello',
    });
  });
});

describe('queue.reextractJob', () => {
  test('passes id + userId to ig_reextract_job rpc and returns boolean', async () => {
    const rpc = mock(async () => true);
    const sb = stubSupabase({ rpc });
    const q = createQueue(sb, { normalize: (u) => u });
    const r = await q.reextractJob(55, 'u-2');
    expect(rpc).toHaveBeenCalledWith('ig_reextract_job', { p_id: 55, p_user_id: 'u-2' });
    expect(r).toBe(true);
  });

  test('returns false when rpc returns false', async () => {
    const rpc = mock(async () => false);
    const sb = stubSupabase({ rpc });
    const q = createQueue(sb, { normalize: (u) => u });
    const r = await q.reextractJob(55, 'u-2');
    expect(r).toBe(false);
  });
});

describe('queue.shareFromOtherUser', () => {
  test('calls ig_share_places_from_other_user and returns count', async () => {
    const rpc = mock(async () => 3);
    const sb = stubSupabase({ rpc });
    const q = createQueue(sb, { normalize: (u) => u });
    const n = await q.shareFromOtherUser('u-1', 'https://www.instagram.com/p/A');
    expect(rpc).toHaveBeenCalledWith('ig_share_places_from_other_user', {
      p_user_id: 'u-1', p_dedupe_key: 'https://www.instagram.com/p/A',
    });
    expect(n).toBe(3);
  });

  test('returns 0 when rpc returns null/undefined', async () => {
    const rpc = mock(async () => null);
    const sb = stubSupabase({ rpc });
    const q = createQueue(sb, { normalize: (u) => u });
    const n = await q.shareFromOtherUser('u-1', 'key');
    expect(n).toBe(0);
  });
});

describe('queue.enqueue with cross-user sharing', () => {
  test('sets status=done and shared_from_other_user when sharing returns > 0 on fresh insert', async () => {
    // First rpc call: ig_enqueue_job; second: ig_share_places_from_other_user
    let callCount = 0;
    const rpc = mock(async () => {
      callCount++;
      if (callCount === 1) return [{ id: 10, status: 'pending', inserted: true }];
      return 2; // 2 places shared
    });
    const sb = stubSupabase({ rpc });
    const q = createQueue(sb, { normalize: (u) => u });
    const r = await q.enqueue('user-b', 'https://www.instagram.com/p/X');
    expect(r.status).toBe('done');
    expect(r.shared_from_other_user).toBe(2);
    expect(r.reused).toBe(false);
  });

  test('does not call shareFromOtherUser when job is reused', async () => {
    const rpc = mock(async () => [{ id: 10, status: 'running', inserted: false }]);
    const sb = stubSupabase({ rpc });
    const q = createQueue(sb, { normalize: (u) => u });
    const r = await q.enqueue('user-b', 'https://www.instagram.com/p/X');
    expect(r.reused).toBe(true);
    // rpc called only once (the enqueue RPC, not the share one)
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(r.shared_from_other_user).toBeUndefined();
  });

  test('a failing share falls through to the normal pipeline instead of failing the enqueue', async () => {
    let callCount = 0;
    const rpc = mock(async () => {
      callCount++;
      if (callCount === 1) return [{ id: 11, status: 'pending', inserted: true }];
      throw new Error('supabase rpc → 409: duplicate key value violates unique constraint');
    });
    const q = createQueue(stubSupabase({ rpc }), { normalize: (u) => u });
    const r = await q.enqueue('user-b', 'https://www.instagram.com/p/X');
    expect(r).toEqual({ jobId: 11, dedupeKey: 'https://www.instagram.com/p/X', status: 'pending', reused: false });
  });
});

const baseRow = {
  id: 1, user_id: 'u', url: 'https://i', dedupe_key: 'd', step: 'queued' as const, step_started_at: null,
  attempts: 1, max_attempts: 5, last_error: null, scheduled_for: 'x', locked_at: null, locked_by: null,
  post_id: null, skip_video: false,
};

describe('fromRow', () => {
  test('reads the legacy failed status as dead', () => {
    expect(fromRow({ ...baseRow, status: 'failed' }).status).toBe('dead');
  });
  test('a done row without a post cannot be used, so reads as dead', () => {
    expect(fromRow({ ...baseRow, status: 'done' }).status).toBe('dead');
    expect(fromRow({ ...baseRow, status: 'done', post_id: 4 })).toMatchObject({ status: 'done', postId: 4 });
  });
});

describe('queue.complete', () => {
  test('writes done only onto a row that is still running', async () => {
    const update = mock(async () => []);
    const q = createQueue(stubSupabase({ update }), { normalize: (u) => u });
    const job = fromRow({ ...baseRow, status: 'running', locked_at: 't', locked_by: 'w' });
    await q.complete(job, 99);
    expect(update).toHaveBeenCalledWith('instagram_jobs',
      expect.objectContaining({ status: 'done', step: 'done', post_id: 99, locked_at: null, locked_by: null }),
      { id: 1, status: 'running' });
  });
  test('does nothing for a job that is not running', async () => {
    const update = mock(async () => []);
    const q = createQueue(stubSupabase({ update }), { normalize: (u) => u });
    await q.complete(fromRow({ ...baseRow, status: 'pending' }), 99);
    expect(update).not.toHaveBeenCalled();
  });
});

// The state machine the SQL functions implement too (see supabase/schema.sql).
describe('transition', () => {
  const pending = fromRow({ ...baseRow, status: 'pending', attempts: 0 });
  const running = fromRow({ ...baseRow, status: 'running', attempts: 2, locked_at: 't0', locked_by: 'w' });
  const spent = fromRow({ ...baseRow, status: 'running', attempts: 5, locked_at: 't0', locked_by: 'w' });
  const done = fromRow({ ...baseRow, status: 'done', post_id: 3 });
  const dead = fromRow({ ...baseRow, status: 'dead', attempts: 5, last_error: 'boom' });

  test('claim: pending with attempts left → running, locked, attempt counted', () => {
    expect(transition(pending, { type: 'claim', workerId: 'w', now: 't1' }))
      .toMatchObject({ status: 'running', attempts: 1, lockedAt: 't1', lockedBy: 'w' });
    expect(transition({ ...dead, status: 'pending' } as IgJob, { type: 'claim', workerId: 'w', now: 't1' })).toBeNull();
    expect(transition(running, { type: 'claim', workerId: 'w', now: 't1' })).toBeNull();
  });
  test('step: bumps the lock heartbeat; only while running', () => {
    expect(transition(running, { type: 'step', step: 'geocoding', now: 't2' }))
      .toMatchObject({ step: 'geocoding', stepStartedAt: 't2', lockedAt: 't2' });
    expect(transition(pending, { type: 'step', step: 'geocoding', now: 't2' })).toBeNull();
  });
  test('complete: only from running', () => {
    expect(transition(running, { type: 'complete', postId: 9 })).toMatchObject({ status: 'done', postId: 9, lockedAt: null });
    for (const job of [pending, done, dead]) expect(transition(job, { type: 'complete', postId: 9 })).toBeNull();
  });
  test('fail: retryable with attempts left → pending; otherwise dead; only from running', () => {
    expect(transition(running, { type: 'fail', error: 'e', retryable: true, retryAt: 't3' }))
      .toMatchObject({ status: 'pending', scheduledFor: 't3', lastError: 'e', lockedAt: null });
    expect(transition(running, { type: 'fail', error: 'e', retryable: false, retryAt: 't3' })?.status).toBe('dead');
    expect(transition(spent, { type: 'fail', error: 'e', retryable: true, retryAt: 't3' })?.status).toBe('dead');
    expect(transition(done, { type: 'fail', error: 'e', retryable: true, retryAt: 't3' })).toBeNull();
  });
  test('reap: a stale lock goes back to pending, or dead once attempts are spent', () => {
    expect(transition(running, { type: 'reap' })?.status).toBe('pending');
    expect(transition(spent, { type: 'reap' })?.status).toBe('dead');
    expect(transition(pending, { type: 'reap' })).toBeNull();
  });
  test('retry: only a dead job, with attempts reset', () => {
    expect(transition(dead, { type: 'retry', now: 't4' })).toMatchObject({ status: 'pending', attempts: 0, lastError: null });
    for (const job of [pending, running, done]) expect(transition(job, { type: 'retry', now: 't4' })).toBeNull();
  });
  test('reextract: only a finished (done or dead) job', () => {
    expect(transition(done, { type: 'reextract', now: 't5' })?.status).toBe('pending');
    expect(transition(dead, { type: 'reextract', now: 't5' })?.status).toBe('pending');
    expect(transition(running, { type: 'reextract', now: 't5' })).toBeNull();
    expect(transition(pending, { type: 'reextract', now: 't5' })).toBeNull();
  });
  test('shared: a fresh pending job becomes done with the shared post', () => {
    expect(transition(pending, { type: 'shared', postId: 7 })).toMatchObject({ status: 'done', postId: 7 });
    expect(transition(running, { type: 'shared', postId: 7 })).toBeNull();
  });
});
