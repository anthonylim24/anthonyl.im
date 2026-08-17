#!/usr/bin/env bun
/**
 * Poll a published PR preview until preview.json matches the expected SHA.
 *
 *   bun scripts/wait-for-preview.ts --pr 123
 *   bun scripts/wait-for-preview.ts --pr 123 --sha abcdef1 --timeout 720
 *
 * Prints the preview.json body on success. Exit 1 on timeout.
 * Default timeout is 12 minutes so a cold GitHub Actions preview build
 * can finish. Screenshot `${base}` routes with `?hidePreviewChrome=1`.
 * Clerk-gated `/korea` and `/trips` need `bun scripts/clerk-agent-login.ts`
 * (applies the session in Chrome; do not paste the ticket URL).
 */
import { waitForPreview } from "../server/src/preview";

function arg(flag: string, argv: string[]): string | undefined {
  const idx = argv.indexOf(`--${flag}`);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

const argv = process.argv.slice(2);
const pr = Number(arg("pr", argv));
if (!Number.isInteger(pr) || pr < 1) {
  console.error("usage: bun scripts/wait-for-preview.ts --pr <n> [--sha <sha>] [--timeout 720]");
  process.exit(2);
}
const timeoutSec = Number(arg("timeout", argv) ?? 720);
try {
  const meta = await waitForPreview({
    pr,
    sha: arg("sha", argv),
    timeoutMs: timeoutSec * 1000,
    siteUrl: arg("site-url", argv),
  });
  console.log(JSON.stringify(meta, null, 2));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
