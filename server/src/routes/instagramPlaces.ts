import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { isInstagramUrl } from '../igPlaces/normalizeUrl';
import type { Queue, EnqueueResult } from '../igPlaces/queue';
import type { ExtractedPlacesOpts } from '../igPlaces/wire';

export interface InstagramPlacesDeps {
  enqueue: (userId: string, url: string, opts?: { skipVideo?: boolean }) => Promise<EnqueueResult>;
  statsHandler: () => Promise<unknown> | unknown;
  listJobs: (userId: string, limit?: number) => Promise<unknown>;
  retryJob: (jobId: number, userId: string) => Promise<boolean>;
  reextractJob: (jobId: number, userId: string) => Promise<boolean>;
  listExtractedPlaces: (opts: ExtractedPlacesOpts) => Promise<{ places: unknown[]; total: number; hasMore: boolean }>;
  listIgPlaceDays: (opts: { userId: string; placeId: number }) => Promise<number[]>;
  setIgPlaceDays: (opts: { userId: string; placeId: number; days: number[] }) => Promise<void>;
}

const igUrl = z.string().refine(isInstagramUrl, 'not an instagram url');

const submitSchema = z.union([
  z.object({ url: igUrl, skipVideo: z.boolean().optional() }),
  z.object({ urls: z.array(igUrl).min(1).max(50), skipVideo: z.boolean().optional() }),
]);

export function createInstagramPlacesRouter(deps: InstagramPlacesDeps) {
  const r = new Hono();

  r.post('/', zValidator('json', submitSchema), async (c) => {
    const userId = c.get('userId' as never) as string;
    const body = (await c.req.json()) as z.infer<typeof submitSchema>;
    const urls = 'url' in body ? [body.url] : body.urls;
    const skipVideo = body.skipVideo;
    const jobs = [];
    for (const url of urls) {
      const result = await deps.enqueue(userId, url, { skipVideo });
      jobs.push(result);
    }
    return c.json({ jobs }, 202);
  });

  r.get('/_stats', async (c) => {
    const stats = await deps.statsHandler();
    return c.json(stats);
  });

  r.get('/jobs', async (c) => {
    const userId = c.get('userId' as never) as string;
    const limitParam = c.req.query('limit');
    const limit = limitParam ? Math.min(500, Math.max(1, Number(limitParam))) : 20;
    const data = await deps.listJobs(userId, limit);
    return c.json(data);
  });

  r.post('/jobs/:id/retry', async (c) => {
    const userId = c.get('userId' as never) as string;
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'invalid job id' }, 400);
    }
    const ok = await deps.retryJob(id, userId);
    if (!ok) return c.json({ error: 'job not found or not in retryable state' }, 404);
    return c.json({ ok: true });
  });

  r.post('/jobs/:id/reextract', async (c) => {
    const userId = c.get('userId' as never) as string;
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'invalid job id' }, 400);
    }
    const ok = await deps.reextractJob(id, userId);
    if (!ok) return c.json({ error: 'job not found' }, 404);
    return c.json({ ok: true });
  });

  r.get('/extracted', async (c) => {
    const userId = c.get('userId' as never) as string;
    const limit = Math.min(Math.max(1, Number(c.req.query('limit') ?? 50)), 200);
    const offset = Math.max(0, Number(c.req.query('offset') ?? 0));
    const category = c.req.query('category');
    const band = c.req.query('band');
    const busyness = c.req.query('busyness');
    const q = c.req.query('q');

    const validCategories = ['restaurant', 'cafe', 'bar', 'shopping', 'activity', 'hotel', 'landmark', 'other'];
    if (category && !validCategories.includes(category)) {
      return c.json({ error: `invalid category: ${category}` }, 400);
    }

    const validBands = ['high', 'medium', 'low'];
    if (band && !validBands.includes(band)) {
      return c.json({ error: `invalid band: ${band}` }, 400);
    }

    const validBusyness = ['quiet', 'moderate', 'busy', 'very_busy'];
    if (busyness && !validBusyness.includes(busyness)) {
      return c.json({ error: `invalid busyness: ${busyness}` }, 400);
    }

    const data = await deps.listExtractedPlaces({ userId, limit, offset, category, band, busyness, q });
    return c.json(data);
  });

  // GET /extracted/:id/days — returns { days: number[] } sorted ascending
  r.get('/extracted/:id/days', async (c) => {
    const userId = c.get('userId' as never) as string;
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'invalid place id' }, 400);
    }
    const days = await deps.listIgPlaceDays({ userId, placeId: id });
    return c.json({ days });
  });

  const daysSchema = z.object({
    days: z.array(z.number().int().min(1).max(12)).max(12),
  });

  // PUT /extracted/:id/days — body { days: number[] }, replaces the assignment set
  r.put('/extracted/:id/days', zValidator('json', daysSchema), async (c) => {
    const userId = c.get('userId' as never) as string;
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'invalid place id' }, 400);
    }
    const { days } = c.req.valid('json');
    // Dedupe and sort
    const deduped = [...new Set(days)].sort((a, b) => a - b);
    try {
      await deps.setIgPlaceDays({ userId, placeId: id, days: deduped });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      if (msg.includes('not found or not owned')) {
        return c.json({ error: 'place not found' }, 404);
      }
      return c.json({ error: msg }, 500);
    }
    return new Response(null, { status: 204 });
  });

  return r;
}
