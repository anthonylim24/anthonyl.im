import { test, expect } from 'bun:test';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Link previews: every app's shell carries its own title + 1200×630 card.
// "/" regressed once because serveStatic answered it with the raw
// dist/index.html. Needs a built frontend (skipped when dist is absent).
const built = existsSync(resolve(import.meta.dir, '../../frontend/dist/index.html'));

test.skipIf(!built)('each app shell gets its own preview metadata', async () => {
  process.env.KLUSTER_API_KEY ||= 'load-test-stub';
  process.env.KLUSTER_API_BASE_URL ||= 'https://example.invalid';
  process.env.IG_WORKER_ENABLED ||= 'false';
  const app = (await import('../app')).default;
  const cases: [string, string, string][] = [
    ['/lab', 'anthonyl.im — Applied intelligence lab', 'og-landing'],
    ['/chatbot', 'Lim — Ask Anthony Lim&#39;s AI', 'og-chatbot'],
    ['/breathwork', 'BreathFlow — Guided breathing with a watercolour cat', 'og-breathwork'],
    ['/breathwork/progress', 'Progress · BreathFlow', 'og-breathwork'],
    ['/trips', 'Trips — plan a trip, pin by pin', 'og-trips'],
    ['/trips/korea-2026/day/1', 'Seoul + Busan — Korea 2026 trip dossier', 'og-korea'],
  ];
  for (const [path, title, card] of cases) {
    const res = await app.fetch(new Request(`http://localhost${path}`));
    const html = await res.text();
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(html).toContain(`<title>${title}</title>`);
    expect(html).toContain(`/${card}.jpg?v=`);
    expect(html.match(/<title>/g)?.length).toBe(1);
  }
});

test.skipIf(!built)('home and legal pages are plain HTML, and home links the policy', async () => {
  process.env.KLUSTER_API_KEY ||= 'load-test-stub';
  process.env.KLUSTER_API_BASE_URL ||= 'https://example.invalid';
  process.env.IG_WORKER_ENABLED ||= 'false';
  const app = (await import('../app')).default;
  for (const [path, title] of [
    ['/', 'anthonyl.im · Anthony Lim'],
    ['/privacy', 'Privacy Policy · anthonyl.im'],
    ['/terms', 'Terms of Service · anthonyl.im'],
  ]) {
    const res = await app.fetch(new Request(`http://localhost${path}`));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(`<title>${title}</title>`);
    expect(html).not.toContain('id="root"');
  }
  const home = await (await app.fetch(new Request('http://localhost/'))).text();
  expect(home).toContain('href="/privacy"');
});

test.skipIf(!built)('a missing hashed asset is a 404, not the SPA shell', async () => {
  process.env.KLUSTER_API_KEY ||= 'load-test-stub';
  process.env.KLUSTER_API_BASE_URL ||= 'https://example.invalid';
  process.env.IG_WORKER_ENABLED ||= 'false';
  const app = (await import('../app')).default;
  const res = await app.fetch(new Request('http://localhost/assets/photoreal-GONE1234.js'));
  expect(res.status).toBe(404);
  expect(res.headers.get('content-type')).not.toContain('text/html');
  expect(res.headers.get('cache-control')).toContain('no-store');
});
