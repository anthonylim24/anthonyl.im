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
        status: 'running', attempts: 1, max_attempts: 5, last_error: null,
        scheduled_for: 'x', locked_at: 'y', locked_by: 'w1', post_id: null,
      }]),
    });
    const q = createQueue(sb, { normalize: (u) => u });
    const j = await q.claim('w1');
    expect(j?.id).toBe(1);
    expect(j?.lockedBy).toBe('w1');
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
