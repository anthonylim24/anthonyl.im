import { Hono, type Context, type MiddlewareHandler } from "hono";
import { z } from "zod";

// Request ids, a one-line access log, in-memory counters, deep health checks
// and the browser error beacon. Everything here is process-local: a restart
// resets it, which is fine for a single PM2 process.

const LATENCY_SAMPLES = 200;
const startedAt = Date.now();

type Group = "api" | "clerk" | "asset" | "page";

interface GroupStats {
  count: number;
  errors4xx: number;
  errors5xx: number;
  latencies: number[];
  next: number;
}

const groups = new Map<Group, GroupStats>();
const counters = new Map<string, number>();

export function count(name: string, by = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + by);
}

function groupOf(path: string): Group {
  if (path.startsWith("/__clerk/")) return "clerk";
  if (path.startsWith("/api/")) return "api";
  if (path.startsWith("/assets/") || /\.[a-z0-9]{2,5}$/i.test(path)) return "asset";
  return "page";
}

export function recordRequest(path: string, status: number, ms: number): void {
  const group = groupOf(path);
  let stats = groups.get(group);
  if (!stats) {
    stats = { count: 0, errors4xx: 0, errors5xx: 0, latencies: [], next: 0 };
    groups.set(group, stats);
  }
  stats.count++;
  if (status >= 500) stats.errors5xx++;
  else if (status >= 400) stats.errors4xx++;
  stats.latencies[stats.next] = ms;
  stats.next = (stats.next + 1) % LATENCY_SAMPLES;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

export function metricsSnapshot() {
  const memory = process.memoryUsage();
  const requests: Record<string, unknown> = {};
  for (const [group, stats] of groups) {
    const sorted = [...stats.latencies].sort((a, b) => a - b);
    requests[group] = {
      count: stats.count,
      errors4xx: stats.errors4xx,
      errors5xx: stats.errors5xx,
      p50Ms: Math.round(percentile(sorted, 50)),
      p95Ms: Math.round(percentile(sorted, 95)),
    };
  }
  return {
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    rssMb: Math.round(memory.rss / 1048576),
    heapUsedMb: Math.round(memory.heapUsed / 1048576),
    requests,
    counters: Object.fromEntries(counters),
  };
}

/** For tests. */
export function resetMetrics(): void {
  groups.clear();
  counters.clear();
}

const QUIET = /^\/(assets\/|health$|favicon|icons\/|cf-fonts\/)/;

/** Tags each request with an id (Cloudflare's ray id when there is one),
 *  times it, and logs one line once it is answered. */
export function requestLog(log: (line: string) => void = console.log): MiddlewareHandler {
  return async (c, next) => {
    const started = performance.now();
    const id = c.req.header("cf-ray") ?? crypto.randomUUID().slice(0, 12);
    c.set("requestId" as never, id as never);
    await next();
    const ms = performance.now() - started;
    const status = c.res.status;
    c.header("X-Request-Id", id);
    recordRequest(c.req.path, status, ms);
    if (status < 400 && QUIET.test(c.req.path)) return;
    log(`${c.req.method} ${c.req.path} ${status} ${Math.round(ms)}ms id=${id}`);
  };
}

/** Hono routes thrown errors to `onError`, not to middleware around `next()`. */
export function onError(error: Error, c: Context): Response {
  const status = "status" in error ? Number(error.status) : 500;
  const id = c.get("requestId" as never) as string | undefined;
  if (!(status >= 400 && status < 500)) {
    count("unhandled_errors");
    console.error(`[error] ${c.req.method} ${c.req.path} id=${id ?? "-"}`, error);
  }
  const expose = status >= 400 && status < 500;
  return c.json(
    { success: false, error: expose ? error.message : "Internal server error", requestId: id },
    (expose ? status : 500) as 500,
  );
}

// ── Deep health ──────────────────────────────────────────────────────────

export interface HealthCheck {
  name: string;
  /** Resolves when healthy, rejects with the reason when not. */
  run: (signal: AbortSignal) => Promise<void>;
}

export interface ReadyReport {
  status: "ok" | "degraded";
  checkedAt: string;
  checks: Record<string, { ok: boolean; ms: number; error?: string }>;
}

/** Runs every check with a deadline and remembers the answer for `ttlMs`, so
 *  a monitor polling this cannot hammer the upstreams. */
export function createReadiness(checks: HealthCheck[], { ttlMs = 20_000, timeoutMs = 4_000 } = {}) {
  let cached: { at: number; report: ReadyReport } | null = null;
  let inFlight: Promise<ReadyReport> | null = null;

  const runAll = async (): Promise<ReadyReport> => {
    const results = await Promise.all(
      checks.map(async (check) => {
        const started = performance.now();
        try {
          await check.run(AbortSignal.timeout(timeoutMs));
          return [check.name, { ok: true, ms: Math.round(performance.now() - started) }] as const;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return [check.name, { ok: false, ms: Math.round(performance.now() - started), error: message.slice(0, 200) }] as const;
        }
      }),
    );
    const report: ReadyReport = {
      status: results.every(([, r]) => r.ok) ? "ok" : "degraded",
      checkedAt: new Date().toISOString(),
      checks: Object.fromEntries(results),
    };
    cached = { at: Date.now(), report };
    return report;
  };

  return async (): Promise<ReadyReport> => {
    if (cached && Date.now() - cached.at < ttlMs) return cached.report;
    inFlight ??= runAll().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

export function httpCheck(name: string, url: string, init: RequestInit = {}, doFetch: typeof fetch = fetch): HealthCheck {
  return {
    name,
    run: async (signal) => {
      const res = await doFetch(url, { ...init, signal, redirect: "manual" });
      await res.body?.cancel();
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
    },
  };
}

// ── Browser error beacon ─────────────────────────────────────────────────

const ClientEvent = z.object({
  kind: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
  message: z.string().max(500),
  route: z.string().max(200).optional(),
  detail: z.record(z.string().max(40), z.union([z.string().max(300), z.number(), z.boolean(), z.null()])).optional(),
});

const printable = (value: string) => value.replace(/[^\x20-\x7e]+/g, " ");

/** `POST /` takes one small event from the browser (an error, a stalled
 *  sign-in) and writes it to the log, so failures on networks that block
 *  third-party analytics are still visible. Nothing is stored. */
export function createTelemetryRouter(log: (line: string) => void = console.warn) {
  const router = new Hono();
  router.post("/", async (c) => {
    const text = await c.req.text();
    if (text.length > 4_000) return c.json({ error: "too_large" }, 413);
    let parsed;
    try {
      parsed = ClientEvent.safeParse(JSON.parse(text));
    } catch {
      return c.json({ error: "invalid" }, 400);
    }
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const { kind, message, route, detail } = parsed.data;
    count(`client.${kind}`);
    const ray = c.req.header("cf-ray") ?? "-";
    const country = c.req.header("cf-ipcountry") ?? "-";
    log(
      `[client] ${kind} route=${printable(route ?? "-")} ray=${ray} country=${country} ` +
        `msg=${JSON.stringify(printable(message))} detail=${printable(JSON.stringify(detail ?? {}))}`,
    );
    return c.body(null, 204);
  });
  return router;
}
