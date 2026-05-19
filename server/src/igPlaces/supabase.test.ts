import { test, expect, describe, mock } from 'bun:test';
import { createSupabaseClient } from './supabase';

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  return mock(async (url: string, init?: RequestInit) =>
    handler(url, init ?? {}));
}

describe('createSupabaseClient', () => {
  test('select with eq filter builds correct url + headers', async () => {
    const fetch = mockFetch((url, init) => {
      expect(url).toContain('/rest/v1/foo?id=eq.42&select=id,name');
      const headers = init.headers as Record<string, string>;
      expect(headers['apikey']).toBe('SVC');
      expect(headers['Authorization']).toBe('Bearer SVC');
      return new Response(JSON.stringify([{ id: 42, name: 'x' }]), { status: 200 });
    });
    const sb = createSupabaseClient({ url: 'https://h.supabase.co', serviceKey: 'SVC', fetch });
    const rows = await sb.select<{id:number; name:string}>('foo', { eq: { id: 42 }, select: 'id,name' });
    expect(rows).toEqual([{ id: 42, name: 'x' }]);
  });

  test('insert with on_conflict + returning', async () => {
    const fetch = mockFetch((url, init) => {
      expect(url).toContain('/rest/v1/jobs?on_conflict=dedupe_key');
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers['Prefer']).toContain('resolution=merge-duplicates');
      expect(headers['Prefer']).toContain('return=representation');
      return new Response(JSON.stringify([{ id: 1 }]), { status: 201 });
    });
    const sb = createSupabaseClient({ url: 'https://h.supabase.co', serviceKey: 'SVC', fetch });
    const r = await sb.insert('jobs', { x: 1 }, { onConflict: 'dedupe_key', returning: 'representation' });
    expect(r).toEqual([{ id: 1 }]);
  });

  test('rpc calls /rpc/<fn> with body', async () => {
    const fetch = mockFetch((url, init) => {
      expect(url).toContain('/rest/v1/rpc/claim_job');
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify({ worker: 'w1' }));
      return new Response(JSON.stringify({ id: 7 }), { status: 200 });
    });
    const sb = createSupabaseClient({ url: 'https://h.supabase.co', serviceKey: 'SVC', fetch });
    const r = await sb.rpc<{id:number}>('claim_job', { worker: 'w1' });
    expect(r).toEqual({ id: 7 });
  });

  test('non-2xx throws with status + body', async () => {
    const fetch = mockFetch(() => new Response('boom', { status: 500 }));
    const sb = createSupabaseClient({ url: 'https://h.supabase.co', serviceKey: 'SVC', fetch });
    await expect(sb.select('foo')).rejects.toThrow(/500/);
  });
});
