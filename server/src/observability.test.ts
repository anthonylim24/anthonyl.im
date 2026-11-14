import { beforeEach, expect, test } from "bun:test";
import { Hono } from "hono";
import {
  createReadiness,
  createTelemetryRouter,
  httpCheck,
  metricsSnapshot,
  onError,
  requestLog,
  resetMetrics,
} from "./observability";

beforeEach(resetMetrics);

test("requestLog tags the response, counts it and logs one line", async () => {
  const lines: string[] = [];
  const app = new Hono();
  app.use("*", requestLog((line) => lines.push(line)));
  app.get("/api/thing", (c) => c.json({ ok: true }));
  app.get("/assets/a.js", (c) => c.text("x"));

  const res = await app.fetch(new Request("http://x/api/thing", { headers: { "cf-ray": "abc123-SJC" } }));
  await app.fetch(new Request("http://x/assets/a.js"));

  expect(res.headers.get("x-request-id")).toBe("abc123-SJC");
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(/^GET \/api\/thing 200 \d+ms id=abc123-SJC$/);
  const { requests } = metricsSnapshot() as { requests: Record<string, { count: number }> };
  expect(requests.api.count).toBe(1);
  expect(requests.asset.count).toBe(1);
});

test("onError answers JSON with the request id and hides 5xx detail", async () => {
  const app = new Hono();
  app.use("*", requestLog(() => {}));
  app.onError(onError);
  app.get("/boom", () => {
    throw new Error("secret detail");
  });
  app.get("/bad", () => {
    throw Object.assign(new Error("nope"), { status: 422 });
  });

  const originalError = console.error;
  console.error = () => {};
  const boom = await app.fetch(new Request("http://x/boom", { headers: { "cf-ray": "r1" } }));
  console.error = originalError;
  expect(boom.status).toBe(500);
  expect(await boom.json()).toEqual({ success: false, error: "Internal server error", requestId: "r1" });

  const bad = await app.fetch(new Request("http://x/bad"));
  expect(bad.status).toBe(422);
  expect(((await bad.json()) as { error: string }).error).toBe("nope");
  expect((metricsSnapshot().counters as Record<string, number>).unhandled_errors).toBe(1);
});

test("readiness reports each check and caches the answer", async () => {
  let runs = 0;
  const ready = createReadiness([
    { name: "good", run: async () => { runs++; } },
    { name: "bad", run: async () => { throw new Error("down"); } },
  ]);
  const report = await ready();
  await ready();
  expect(runs).toBe(1);
  expect(report.status).toBe("degraded");
  expect(report.checks.good.ok).toBe(true);
  expect(report.checks.bad).toMatchObject({ ok: false, error: "down" });
});

test("readiness times a hung check out", async () => {
  const ready = createReadiness(
    [{ name: "hung", run: (signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("timed out")))) }],
    { timeoutMs: 20 },
  );
  expect((await ready()).checks.hung.ok).toBe(false);
});

test("httpCheck fails on a 5xx and passes otherwise", async () => {
  const signal = AbortSignal.timeout(1000);
  const up = httpCheck("up", "https://x.invalid", {}, (async () => new Response("ok")) as unknown as typeof fetch);
  const down = httpCheck("down", "https://x.invalid", {}, (async () => new Response("no", { status: 503 })) as unknown as typeof fetch);
  await up.run(signal);
  expect(down.run(signal)).rejects.toThrow("HTTP 503");
});

test("telemetry logs a valid event and rejects junk", async () => {
  const lines: string[] = [];
  const app = new Hono().route("/api/telemetry", createTelemetryRouter((line) => lines.push(line)));
  const post = (body: string) => app.fetch(new Request("http://x/api/telemetry", { method: "POST", body }));

  const ok = await post(JSON.stringify({ kind: "auth_stalled", message: "sign-in\nstalled", route: "/trips", detail: { cause: "auth" } }));
  expect(ok.status).toBe(204);
  expect(lines[0]).toContain("[client] auth_stalled route=/trips");
  expect(lines[0]).not.toContain("\n");
  expect((metricsSnapshot().counters as Record<string, number>)["client.auth_stalled"]).toBe(1);

  expect((await post("not json")).status).toBe(400);
  expect((await post(JSON.stringify({ kind: "Bad Kind", message: "x" }))).status).toBe(400);
  expect((await post(JSON.stringify({ kind: "x_y", message: "m".repeat(5000) }))).status).toBe(413);
});
