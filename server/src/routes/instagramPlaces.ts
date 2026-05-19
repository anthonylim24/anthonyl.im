import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { isInstagramUrl } from '../igPlaces/normalizeUrl';
import type { Queue } from '../igPlaces/queue';
import type { ExtractedPlacesOpts } from '../igPlaces/wire';

export interface InstagramPlacesDeps {
  enqueue: Queue['enqueue'];
  statsHandler: () => Promise<unknown> | unknown;
  listJobs: (userId: string, limit?: number) => Promise<unknown>;
  retryJob: (jobId: number, userId: string) => Promise<boolean>;
  reextractJob: (jobId: number, userId: string) => Promise<boolean>;
  listExtractedPlaces: (opts: ExtractedPlacesOpts) => Promise<{ places: unknown[]; total: number; hasMore: boolean }>;
}

const igUrl = z.string().refine(isInstagramUrl, 'not an instagram url');

const submitSchema = z.union([
  z.object({ url: igUrl }),
  z.object({ urls: z.array(igUrl).min(1).max(50) }),
]);

export function createInstagramPlacesRouter(deps: InstagramPlacesDeps) {
  const r = new Hono();

  r.post('/', zValidator('json', submitSchema), async (c) => {
    const userId = c.get('userId' as never) as string;
    const body = (await c.req.json()) as z.infer<typeof submitSchema>;
    const urls = 'url' in body ? [body.url] : body.urls;
    const jobs = [];
    for (const url of urls) {
      const result = await deps.enqueue(userId, url);
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
    const q = c.req.query('q');

    const validCategories = ['restaurant', 'cafe', 'bar', 'shopping', 'activity', 'hotel', 'landmark', 'other'];
    if (category && !validCategories.includes(category)) {
      return c.json({ error: `invalid category: ${category}` }, 400);
    }

    const validBands = ['high', 'medium', 'low'];
    if (band && !validBands.includes(band)) {
      return c.json({ error: `invalid band: ${band}` }, 400);
    }

    const data = await deps.listExtractedPlaces({ userId, limit, offset, category, band, q });
    return c.json(data);
  });

  return r;
}
