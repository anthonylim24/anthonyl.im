import { test, expect, describe } from "bun:test";
import { Hono } from "hono";
import {
  MAX_BUCKETS,
  consumeRateLimit,
  createRateLimit,
  rateLimitStore,
  trustedProxyClientAddress,
  userOrClientKey,
} from "./rateLimit";

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

  test("the default key ignores a spoofed first X-Forwarded-For hop", async () => {
    const app = makeApp(1);
    await app.request("/", { headers: { "x-forwarded-for": "1.1.1.1, 203.0.113.50" } });
    const spoofed = await app.request("/", { headers: { "x-forwarded-for": "9.9.9.9, 203.0.113.50" } });
    expect(spoofed.status).toBe(429);
  });

  test("CF-Connecting-IP wins over X-Forwarded-For", async () => {
    const app = makeApp(1);
    await app.request("/", { headers: { "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "10.9.9.1" } });
    const sameClient = await app.request("/", {
      headers: { "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "10.9.9.2" },
    });
    expect(sameClient.status).toBe(429);
  });

  test("userOrClientKey buckets signed-in users separately behind one address", async () => {
    const app = new Hono();
    app.use("/*", async (c, next) => {
      const user = c.req.header("x-test-user");
      if (user) c.set("userId" as never, user as never);
      await next();
    });
    app.use("/*", createRateLimit({ windowMs: 60_000, max: 1, keyPrefix: "per-user", key: userOrClientKey }));
    app.get("/", (c) => c.json({ ok: true }));
    const ip = { "cf-connecting-ip": "203.0.113.99" };
    expect((await app.request("/", { headers: { ...ip, "x-test-user": "u1" } })).status).toBe(200);
    expect((await app.request("/", { headers: { ...ip, "x-test-user": "u1" } })).status).toBe(429);
    expect((await app.request("/", { headers: { ...ip, "x-test-user": "u2" } })).status).toBe(200);
    expect((await app.request("/", { headers: ip })).status).toBe(200);
    expect((await app.request("/", { headers: ip })).status).toBe(429);
  });
});

describe("consumeRateLimit store", () => {
  test("never grows past MAX_BUCKETS", () => {
    rateLimitStore.clear();
    for (let i = 0; i < MAX_BUCKETS + 500; i++) {
      consumeRateLimit(`flood:${i}`, { windowMs: 60_000, max: 5 });
    }
    expect(rateLimitStore.size()).toBeLessThanOrEqual(MAX_BUCKETS);
    // The newest caller is still counted.
    expect(consumeRateLimit(`flood:${MAX_BUCKETS + 499}`, { windowMs: 60_000, max: 1 }).ok).toBe(false);
    rateLimitStore.clear();
  });
});
