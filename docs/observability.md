# Observability and self-healing

| Piece | Location | Notes |
|-------|----------|-------|
| Request ids, access log, counters | `server/src/observability.ts` (`requestLog`, `onError`) | Every response carries `X-Request-Id` (Cloudflare's ray id when present). One log line per request (`GET /api/trips 200 12ms id=…`); quiet for assets and `/health`. Thrown errors go through `app.onError` and answer JSON with the `requestId` |
| `/health` | `server/app.ts` | Answers from memory. Deploys, the uptime workflow and the droplet watchdog poll it; keep it dependency-free |
| `/health/ready` | `createReadiness` | Asks Clerk's Frontend API, Supabase and the built frontend, each with a 4 s deadline, cached 20 s. 503 with per-check detail when one is down |
| `/health/metrics` | `metricsSnapshot` | Request counts, 4xx / 5xx, p50 / p95 per group (api, clerk, asset, page), memory, named counters (`clerk_proxy.failures`, `client.<kind>`). In memory; a restart resets it |
| Browser error beacon | `POST /api/telemetry`, `frontend/src/lib/telemetry.ts` | `reportClientEvent(kind, message, detail)` writes a `[client] …` line to the server log: uncaught errors, unhandled rejections, route crashes, missing chunks, stalled sign-in. Deduplicated, ten a page, never throws. It goes to our own origin because networks that break the page usually block third-party analytics too |
| Clerk proxy | `server/src/clerkProxy.ts` | 10 s deadline per attempt; a read is retried once on a network error or 502–504, a write never; a dead upstream answers 502 in Clerk's error shape |
| Stalled sign-in | `frontend/src/lib/authStall.ts`, `TripsLayout` | If Clerk has not loaded after 10 s (or reports `error`), `diagnose` probes `/health` and the proxy, the gate says what is unreachable (offline / this site / sign-in), keeps probing with backoff, and reloads (at most twice a tab) once everything answers |

Outside the app: a systemd watchdog on the droplet restarts PM2 after three failed `/health` checks, nginx serves a self-reloading outage page for 502 / 503 / 504, and `.github/workflows/uptime.yml` probes production every 15 minutes and opens an `uptime` issue on failure. Files and install steps: [`deploy/README.md`](../deploy/README.md).

Some home networks (Xfinity Advanced Security) block `anthonyl.im` hostnames over TCP while HTTP/3 still gets through, so a visitor can see the shell load and sign-in fail. That is the case the stalled sign-in screen exists for; it cannot be fixed from the server.
