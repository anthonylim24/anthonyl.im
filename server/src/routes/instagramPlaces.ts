import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { isInstagramUrl } from '../igPlaces/normalizeUrl';
import type { Queue } from '../igPlaces/queue';

export interface InstagramPlacesDeps {
  enqueue: Queue['enqueue'];
  statsHandler: () => Promise<unknown> | unknown;
  listJobs: (userId: string, limit?: number) => Promise<unknown>;
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
    const limit = limitParam ? Math.min(100, Math.max(1, Number(limitParam))) : 20;
    const data = await deps.listJobs(userId, limit);
    return c.json(data);
  });

  return r;
}
