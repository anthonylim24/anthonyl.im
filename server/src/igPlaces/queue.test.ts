import { test, expect, describe, mock } from 'bun:test';
import { createQueue } from './queue';
import type { SupabaseClient } from './supabase';

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
});
