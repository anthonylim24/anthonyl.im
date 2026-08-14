import { test, expect, describe } from "bun:test";
import { Hono } from "hono";
import { createRateLimit, trustedProxyClientAddress } from "./rateLimit";

function makeApp(max: number, windowMs = 60_000) {
  const app = new Hono();
  app.use("/*", createRateLimit({ windowMs, max, keyPrefix: "test" }));
  app.get("/", (c) => c.json({ ok: true }));
  return app;
}

describe("createRateLimit", () => {
  test("requests under the limit return 200", async () => {
    const app = makeApp(3);
    for (let i = 0; i < 3; i++) {
      const res = await app.request("/", {
        headers: { "x-forwarded-for": `10.0.0.1` },
      });
      expect(res.status).toBe(200);
    }
  });

  test("request N+1 within window returns 429 with Retry-After", async () => {
    const app = makeApp(2);
    for (let i = 0; i < 2; i++) {
      await app.request("/", { headers: { "x-forwarded-for": "10.0.0.2" } });
    }
    const res = await app.request("/", {
      headers: { "x-forwarded-for": "10.0.0.2" },
    });
    expect(res.status).toBe(429);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("rate_limited");
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  test("different x-forwarded-for values get independent buckets", async () => {
    const app = makeApp(1);
    await app.request("/", { headers: { "x-forwarded-for": "10.1.1.1" } });
    const blocked = await app.request("/", {
      headers: { "x-forwarded-for": "10.1.1.1" },
    });
    expect(blocked.status).toBe(429);

    const allowed = await app.request("/", {
      headers: { "x-forwarded-for": "10.1.1.2" },
    });
    expect(allowed.status).toBe(200);
  });

  test("trustedProxyClientAddress uses the last X-Forwarded-For hop", async () => {
    const app = new Hono();
    app.use(
      "/*",
      createRateLimit({
        windowMs: 60_000,
        max: 1,
        keyPrefix: "trusted-xff",
        key: trustedProxyClientAddress,
      }),
    );
    app.get("/", (c) => c.json({ ok: true }));

    const first = await app.request("/", {
      headers: { "x-forwarded-for": "198.51.100.1, 203.0.113.10" },
    });
    expect(first.status).toBe(200);

    const rotatedClient = await app.request("/", {
      headers: { "x-forwarded-for": "198.51.100.99, 203.0.113.10" },
    });
    expect(rotatedClient.status).toBe(429);

    const otherPeer = await app.request("/", {
      headers: { "x-forwarded-for": "198.51.100.1, 203.0.113.11" },
    });
    expect(otherPeer.status).toBe(200);
  });
});
