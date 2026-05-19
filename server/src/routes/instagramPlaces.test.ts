import { test, expect, describe, mock } from 'bun:test';
import { Hono } from 'hono';
import { createInstagramPlacesRouter } from './instagramPlaces';

function withAuth(userId: string) {
  return async (c: any, next: any) => { c.set('userId', userId); await next(); };
}

const noopListJobs = mock(async () => []);
const noopListExtractedPlaces = mock(async () => ({ places: [], total: 0, hasMore: false }));

const noopRetryJob = mock(async () => true);

describe('POST /api/korea/places/from-instagram', () => {
  test('400 on non-instagram url', async () => {
    const enqueue = mock(async () => ({ jobId: 1, dedupeKey: 'd', status: 'pending', reused: false }));
    const router = createInstagramPlacesRouter({ enqueue, statsHandler: () => ({}) as any, listJobs: noopListJobs, retryJob: noopRetryJob, listExtractedPlaces: noopListExtractedPlaces });
    const app = new Hono().use('*', withAuth('u')).route('/', router);
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://twitter.com/x' }),
    });
    expect(res.status).toBe(400);
  });

  test('202 single url returns one job', async () => {
    const enqueue = mock(async () => ({ jobId: 7, dedupeKey: 'd', status: 'pending', reused: false }));
    const router = createInstagramPlacesRouter({ enqueue, statsHandler: () => ({}) as any, listJobs: noopListJobs, retryJob: noopRetryJob, listExtractedPlaces: noopListExtractedPlaces });
    const app = new Hono().use('*', withAuth('u')).route('/', router);
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.instagram.com/p/ABC' }),
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].jobId).toBe(7);
  });

  test('202 urls[] enqueues each', async () => {
    let counter = 0;
    const enqueue = mock(async () => ({ jobId: ++counter, dedupeKey: `d${counter}`, status: 'pending', reused: false }));
    const router = createInstagramPlacesRouter({ enqueue, statsHandler: () => ({}) as any, listJobs: noopListJobs, retryJob: noopRetryJob, listExtractedPlaces: noopListExtractedPlaces });
    const app = new Hono().use('*', withAuth('u')).route('/', router);
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [
        'https://www.instagram.com/p/A',
        'https://www.instagram.com/reel/B',
      ] }),
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.jobs).toHaveLength(2);
  });
});

describe('GET /_stats', () => {
  test('returns stats payload from handler', async () => {
    const router = createInstagramPlacesRouter({
      enqueue: mock(async () => ({} as any)),
      statsHandler: mock(async () => ({ pending: 3, running: 1, dead: 0 })),
      listJobs: noopListJobs,
      retryJob: noopRetryJob,
      listExtractedPlaces: noopListExtractedPlaces,
    });
    const app = new Hono().use('*', withAuth('u')).route('/', router);
    const res = await app.request('/_stats');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pending).toBe(3);
  });
});

describe('GET /jobs', () => {
  test('returns JSON body from listJobs', async () => {
    const fakeJobs = [
      { id: 1, url: 'https://www.instagram.com/p/A', status: 'done', step: 'done',
        attempts: 1, last_error: null, created_at: 'now', updated_at: 'now',
        post_id: 10, places: [] },
    ];
    const listJobs = mock(async () => fakeJobs);
    const router = createInstagramPlacesRouter({
      enqueue: mock(async () => ({} as any)),
      statsHandler: () => ({}),
      listJobs,
      retryJob: noopRetryJob,
      listExtractedPlaces: noopListExtractedPlaces,
    });
    const app = new Hono().use('*', withAuth('user-123')).route('/', router);
    const res = await app.request('/jobs');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(1);
  });

  test('passes userId from context and clamps limit', async () => {
    let capturedUserId: string | undefined;
    let capturedLimit: number | undefined;
    const listJobs = mock(async (userId: string, limit?: number) => {
      capturedUserId = userId;
      capturedLimit = limit;
      return [];
    });
    const router = createInstagramPlacesRouter({
      enqueue: mock(async () => ({} as any)),
      statsHandler: () => ({}),
      listJobs,
      retryJob: noopRetryJob,
      listExtractedPlaces: noopListExtractedPlaces,
    });
    const app = new Hono().use('*', withAuth('user-abc')).route('/', router);

    // limit=200 should be clamped to 100
    await app.request('/jobs?limit=200');
    expect(capturedUserId).toBe('user-abc');
    expect(capturedLimit).toBe(100);

    // limit=0 should be clamped to 1
    await app.request('/jobs?limit=0');
    expect(capturedLimit).toBe(1);

    // no limit defaults to 20
    await app.request('/jobs');
    expect(capturedLimit).toBe(20);
  });
});

describe('POST /jobs/:id/retry', () => {
  test('200 ok when retry succeeds', async () => {
    const retry = mock(async () => true);
    const router = createInstagramPlacesRouter({
      enqueue: mock(async () => ({} as any)),
      statsHandler: mock(async () => ({})),
      listJobs: mock(async () => []),
      retryJob: retry,
      listExtractedPlaces: noopListExtractedPlaces,
    });
    const app = new Hono().use('*', withAuth('u')).route('/', router);
    const res = await app.request('/jobs/7/retry', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(retry).toHaveBeenCalledWith(7, 'u');
  });
  test('404 when retry returns false', async () => {
    const router = createInstagramPlacesRouter({
      enqueue: mock(async () => ({} as any)),
      statsHandler: mock(async () => ({})),
      listJobs: mock(async () => []),
      retryJob: mock(async () => false),
      listExtractedPlaces: noopListExtractedPlaces,
    });
    const app = new Hono().use('*', withAuth('u')).route('/', router);
    const res = await app.request('/jobs/7/retry', { method: 'POST' });
    expect(res.status).toBe(404);
  });
  test('400 on non-numeric id', async () => {
    const router = createInstagramPlacesRouter({
      enqueue: mock(async () => ({} as any)),
      statsHandler: mock(async () => ({})),
      listJobs: mock(async () => []),
      retryJob: mock(async () => true),
      listExtractedPlaces: noopListExtractedPlaces,
    });
    const app = new Hono().use('*', withAuth('u')).route('/', router);
    const res = await app.request('/jobs/abc/retry', { method: 'POST' });
    expect(res.status).toBe(400);
  });
});

describe('GET /extracted', () => {
  test('200 with no filters returns empty payload', async () => {
    const listExtractedPlaces = mock(async () => ({ places: [], total: 0, hasMore: false }));
    const router = createInstagramPlacesRouter({
      enqueue: mock(async () => ({} as any)),
      statsHandler: () => ({}),
      listJobs: noopListJobs,
      retryJob: noopRetryJob,
      listExtractedPlaces,
    });
    const app = new Hono().use('*', withAuth('user-42')).route('/', router);
    const res = await app.request('/extracted');
    expect(res.status).toBe(200);
    const body = await res.json() as { places: unknown[]; total: number; hasMore: boolean };
    expect(body.places).toHaveLength(0);
    expect(body.total).toBe(0);
    expect(body.hasMore).toBe(false);
  });

  test('200 with category filter — filter reaches the handler', async () => {
    let capturedOpts: Record<string, unknown> | undefined;
    const listExtractedPlaces = mock(async (opts: Record<string, unknown>) => {
      capturedOpts = opts;
      return { places: [], total: 0, hasMore: false };
    });
    const router = createInstagramPlacesRouter({
      enqueue: mock(async () => ({} as any)),
      statsHandler: () => ({}),
      listJobs: noopListJobs,
      retryJob: noopRetryJob,
      listExtractedPlaces: listExtractedPlaces as any,
    });
    const app = new Hono().use('*', withAuth('u')).route('/', router);
    const res = await app.request('/extracted?category=cafe&band=high&q=onion');
    expect(res.status).toBe(200);
    expect(capturedOpts?.category).toBe('cafe');
    expect(capturedOpts?.band).toBe('high');
    expect(capturedOpts?.q).toBe('onion');
  });

  test('400 on unknown category enum', async () => {
    const router = createInstagramPlacesRouter({
      enqueue: mock(async () => ({} as any)),
      statsHandler: () => ({}),
      listJobs: noopListJobs,
      retryJob: noopRetryJob,
      listExtractedPlaces: noopListExtractedPlaces,
    });
    const app = new Hono().use('*', withAuth('u')).route('/', router);
    const res = await app.request('/extracted?category=badvalue');
    expect(res.status).toBe(400);
  });
});
