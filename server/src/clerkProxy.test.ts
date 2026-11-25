import { test, expect } from "bun:test";
import { Hono } from "hono";
import { CLERK_PROXY_PATH, createClerkProxy } from "./clerkProxy";

function proxiedApp() {
  const calls: { url: string; init: RequestInit }[] = [];
  const app = new Hono();
  app.all(`${CLERK_PROXY_PATH}/*`, createClerkProxy({
    secretKey: "sk_live_test",
    proxyUrl: "https://anthonyl.im/__clerk",
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{"ok":true}', {
        status: 200,
        headers: { "content-type": "application/json", "content-encoding": "gzip", "set-cookie": "__client=1" },
      });
    }) as unknown as typeof fetch,
  }));
  return { app, calls };
}

test("forwards to Clerk's Frontend API with the proxy headers", async () => {
  const { app, calls } = proxiedApp();
  const res = await app.fetch(new Request("https://anthonyl.im/__clerk/v1/client?_clerk_js_version=5", {
    headers: { "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "6.6.6.6", host: "anthonyl.im" },
  }));

  expect(calls[0].url).toBe("https://frontend-api.clerk.dev/v1/client?_clerk_js_version=5");
  const sent = new Headers(calls[0].init.headers);
  expect(sent.get("Clerk-Proxy-Url")).toBe("https://anthonyl.im/__clerk");
  expect(sent.get("Clerk-Secret-Key")).toBe("sk_live_test");
  expect(sent.get("X-Forwarded-For")).toBe("203.0.113.7");
  expect(sent.get("host")).toBeNull();

  expect(res.status).toBe(200);
  expect(res.headers.get("content-encoding")).toBeNull();
  expect(res.headers.get("set-cookie")).toBe("__client=1");
  expect(await res.json()).toEqual({ ok: true });
});

function cookieApp(cookies: string[], headers: Record<string, string> = {}) {
  const app = new Hono();
  app.all(`${CLERK_PROXY_PATH}/*`, createClerkProxy({
    secretKey: "sk_live_test",
    proxyUrl: "https://anthonyl.im/__clerk",
    fetch: (async () => {
      const upstream = new Headers(headers);
      for (const cookie of cookies) upstream.append("set-cookie", cookie);
      return new Response("x", { status: 200, headers: upstream });
    }) as unknown as typeof fetch,
  }));
  return app;
}

test("passes on Clerk's cookies for this site and drops the ones a browser here would reject", async () => {
  const res = await cookieApp([
    "__client=abc; Path=/; Domain=anthonyl.im; HttpOnly; Secure; SameSite=Lax",
    "__client_uat=0; Path=/; Domain=.anthonyl.im; Secure; SameSite=Lax",
    "__session=s; Path=/; Secure",
    "__cf_bm=bot; HttpOnly; Path=/; Domain=frontend-api.clerk.dev",
    "_cfuvid=id; HttpOnly; Path=/; Domain=clerkprod-cloudflare.net",
    "evil=1; Path=/; Domain=notanthonyl.im",
  ]).fetch(new Request("https://anthonyl.im/__clerk/v1/client"));
  expect(res.headers.getSetCookie().map((c) => c.split("=")[0])).toEqual(["__client", "__client_uat", "__session"]);
});

test("a pinned clerk-js file keeps its long cache and sets no cookie, so Cloudflare can cache it", async () => {
  const res = await cookieApp(
    ["__cf_bm=bot; HttpOnly; Path=/; Domain=frontend-api.clerk.dev"],
    { "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable" },
  ).fetch(new Request("https://anthonyl.im/__clerk/npm/@clerk/clerk-js@5.128.2/dist/clerk.browser.js"));
  expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, s-maxage=31536000, immutable");
  expect(res.headers.has("set-cookie")).toBe(false);
});

test("passes a POST body through", async () => {
  const { app, calls } = proxiedApp();
  await app.fetch(new Request("https://anthonyl.im/__clerk/v1/client/sign_ins", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "identifier=a%40b.c",
  }));
  expect(calls[0].init.method).toBe("POST");
  expect(await new Response(calls[0].init.body).text()).toBe("identifier=a%40b.c");
});

function flakyApp(responses: Array<Response | Error>) {
  let calls = 0;
  const app = new Hono();
  app.all(`${CLERK_PROXY_PATH}/*`, createClerkProxy({
    secretKey: "sk_live_test",
    proxyUrl: "https://anthonyl.im/__clerk",
    fetch: (async () => {
      const next = responses[Math.min(calls++, responses.length - 1)];
      if (next instanceof Error) throw next;
      return next;
    }) as unknown as typeof fetch,
  }));
  return { app, calls: () => calls };
}

test("retries a read once when the upstream is unreachable", async () => {
  const { app, calls } = flakyApp([new Error("ECONNRESET"), new Response('{"ok":true}')]);
  const res = await app.fetch(new Request("https://anthonyl.im/__clerk/v1/environment"));
  expect(res.status).toBe(200);
  expect(calls()).toBe(2);
});

test("retries a read once on a gateway error", async () => {
  const { app, calls } = flakyApp([new Response("bad gateway", { status: 502 }), new Response('{"ok":true}')]);
  const res = await app.fetch(new Request("https://anthonyl.im/__clerk/v1/client"));
  expect(res.status).toBe(200);
  expect(calls()).toBe(2);
});

test("answers 502 in Clerk's error shape when the upstream stays down", async () => {
  const originalError = console.error;
  console.error = () => {};
  const { app, calls } = flakyApp([new Error("timeout")]);
  const res = await app.fetch(new Request("https://anthonyl.im/__clerk/v1/environment"));
  console.error = originalError;
  expect(res.status).toBe(502);
  expect(calls()).toBe(2);
  expect(((await res.json()) as { errors: { code: string }[] }).errors[0].code).toBe("proxy_upstream_unreachable");
});

test("never repeats a write", async () => {
  const originalError = console.error;
  console.error = () => {};
  const { app, calls } = flakyApp([new Error("ECONNRESET")]);
  const res = await app.fetch(new Request("https://anthonyl.im/__clerk/v1/client/sign_ins", { method: "POST", body: "a=b" }));
  console.error = originalError;
  expect(res.status).toBe(502);
  expect(calls()).toBe(1);
});

test("drops hop-by-hop headers, so the connection to Clerk stays open for the next request", async () => {
  const { app, calls } = proxiedApp();
  await app.fetch(new Request("https://anthonyl.im/__clerk/v1/client", {
    headers: { connection: "close, x-hop", "keep-alive": "timeout=5", "x-hop": "1", te: "trailers", "x-kept": "1" },
  }));
  const sent = new Headers(calls[0].init.headers);
  for (const name of ["connection", "keep-alive", "x-hop", "te"]) expect(sent.has(name)).toBe(false);
  expect(sent.get("x-kept")).toBe("1");
});

function recordingApp(answers: Array<Response | Error | "hang">, deps: { repeatableWriteTimeoutMs?: number } = {}) {
  const bodies: string[] = [];
  const app = new Hono();
  app.all(`${CLERK_PROXY_PATH}/*`, createClerkProxy({
    secretKey: "sk_live_test",
    proxyUrl: "https://anthonyl.im/__clerk",
    ...deps,
    fetch: (async (_url: string, init: RequestInit) => {
      bodies.push(init.body === undefined ? "" : await new Response(init.body).text());
      const next = answers[Math.min(bodies.length - 1, answers.length - 1)];
      if (next === "hang") {
        return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
      }
      if (next instanceof Error) throw next;
      return next;
    }) as unknown as typeof fetch,
  }));
  return { app, bodies };
}

const quietly = async <T>(run: () => Promise<T>) => {
  const originalError = console.error;
  console.error = () => {};
  try {
    return await run();
  } finally {
    console.error = originalError;
  }
};

test("sends a session token request again, body and all, when the first never arrives", async () => {
  const { app, bodies } = recordingApp([new Error("ECONNRESET"), new Response('{"jwt":"t"}')]);
  const res = await app.fetch(new Request("https://anthonyl.im/__clerk/v1/client/sessions/sess_1/tokens?_clerk_js_version=5", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "organization_id=",
  }));
  expect(res.status).toBe(200);
  expect(bodies).toEqual(["organization_id=", "organization_id="]);
});

test("gives a stalled token request a short deadline, then tries once more", async () => {
  const { app, bodies } = recordingApp(["hang", new Response('{"jwt":"t"}')], { repeatableWriteTimeoutMs: 20 });
  const res = await app.fetch(new Request("https://anthonyl.im/__clerk/v1/client/sessions/sess_1/tokens", { method: "POST" }));
  expect(res.status).toBe(200);
  expect(bodies.length).toBe(2);
});

test("retries a session touch on a gateway error", async () => {
  const { app, bodies } = recordingApp([new Response("bad gateway", { status: 502 }), new Response("{}")]);
  const res = await app.fetch(new Request("https://anthonyl.im/__clerk/v1/client/sessions/sess_1/touch", { method: "POST", body: "a=b" }));
  expect(res.status).toBe(200);
  expect(bodies).toEqual(["a=b", "a=b"]);
});

test("tries a repeatable request twice at most, even when the gateway error is followed by a dropped connection", async () => {
  const { app, bodies } = recordingApp([new Response("bad gateway", { status: 502 }), new Error("ECONNRESET"), new Response("{}")]);
  const res = await quietly(() => app.fetch(new Request("https://anthonyl.im/__clerk/v1/client/sessions/sess_1/tokens", { method: "POST" })));
  expect(res.status).toBe(502);
  expect(bodies.length).toBe(2);
});

test("passes on the second gateway error rather than trying a third time", async () => {
  const { app, bodies } = recordingApp([new Response("bad gateway", { status: 502 }), new Response("busy", { status: 503 })]);
  const res = await app.fetch(new Request("https://anthonyl.im/__clerk/v1/environment"));
  expect(res.status).toBe(503);
  expect(bodies.length).toBe(2);
});

test("still never repeats a sign-in or any other write", async () => {
  for (const path of ["/v1/client/sign_ins", "/v1/client/sessions/sess_1/remove", "/v1/client/sessions/sess_1/tokens/x/y"]) {
    const { app, bodies } = recordingApp([new Error("ECONNRESET"), new Response("{}")]);
    const res = await quietly(() => app.fetch(new Request(`https://anthonyl.im/__clerk${path}`, { method: "POST", body: "a=b" })));
    expect(res.status).toBe(502);
    expect(bodies.length).toBe(1);
  }
});
