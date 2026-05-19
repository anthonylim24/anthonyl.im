import { test, expect, describe, mock } from 'bun:test';
import { Hono } from 'hono';
import { createInstagramPlacesRouter } from './instagramPlaces';

function withAuth(userId: string) {
  return async (c: any, next: any) => { c.set('userId', userId); await next(); };
}

describe('POST /api/korea/places/from-instagram', () => {
  test('400 on non-instagram url', async () => {
    const enqueue = mock(async () => ({ jobId: 1, dedupeKey: 'd', status: 'pending', reused: false }));
    const router = createInstagramPlacesRouter({ enqueue, statsHandler: () => ({}) as any });
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
    const router = createInstagramPlacesRouter({ enqueue, statsHandler: () => ({}) as any });
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
    const router = createInstagramPlacesRouter({ enqueue, statsHandler: () => ({}) as any });
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
    });
    const app = new Hono().use('*', withAuth('u')).route('/', router);
    const res = await app.request('/_stats');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pending).toBe(3);
  });
});
