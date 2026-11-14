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
