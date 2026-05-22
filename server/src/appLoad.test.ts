import { test, expect } from 'bun:test';

// Module-load smoke test. Production crashed on 2026-05-22 because
// `fetchBusyness.ts` imported `GEMINI_BASE` from `gemini.ts` where that
// symbol wasn't exported, but every existing unit test mocks the
// dependency chain so the broken import never executed under
// `bun test`. This test forces Bun to evaluate the full route /
// worker dependency graph the way production does at PM2 start-up,
// so a missing/renamed export fails the gate instead of pm2.

test('server/app.ts loads without throwing — catches missing-export regressions', async () => {
  // The app reads env at import time. Stub the minimum it needs to
  // get past config.ts's required-key check. Matches the CI env in
  // .github/workflows/deploy.yml.
  process.env.KLUSTER_API_KEY ||= 'load-test-stub';
  process.env.KLUSTER_API_BASE_URL ||= 'https://example.invalid';
  process.env.IG_WORKER_ENABLED ||= 'false';

  // Importing app.ts pulls in every route (including igPlaces.wire,
  // which transitively imports fetchBusyness + gemini). Any
  // missing/renamed export anywhere in that graph throws here.
  const mod = await import('../app');
  expect(mod).toBeDefined();
});
