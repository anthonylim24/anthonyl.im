import type { Context } from "hono";

export const CLERK_PROXY_PATH = "/__clerk";
const CLERK_FRONTEND_API = "https://frontend-api.clerk.dev";

// Bun's fetch decodes the body, so the upstream's encoding and length no
// longer describe what we send on.
const DROPPED_RESPONSE_HEADERS = ["content-encoding", "content-length", "transfer-encoding"];

export interface ClerkProxyDeps {
  secretKey: string;
  proxyUrl: string;
  fetch?: typeof fetch;
}

// Serves Clerk's Frontend API from our own origin, so sign-in works on
// networks that block the clerk.<domain> subdomain.
export function createClerkProxy({ secretKey, proxyUrl, fetch: doFetch = fetch }: ClerkProxyDeps) {
  return async (c: Context) => {
    const url = new URL(c.req.url);
    const target = `${CLERK_FRONTEND_API}${url.pathname.slice(CLERK_PROXY_PATH.length) || "/"}${url.search}`;

    const headers = new Headers(c.req.raw.headers);
    headers.delete("host");
    headers.set("Clerk-Proxy-Url", proxyUrl);
    headers.set("Clerk-Secret-Key", secretKey);
    const clientIp = c.req.header("cf-connecting-ip") ?? c.req.header("x-real-ip");
    if (clientIp) headers.set("X-Forwarded-For", clientIp);
    else headers.delete("X-Forwarded-For");

    const method = c.req.method;
    const hasBody = method !== "GET" && method !== "HEAD";
    const upstream = await doFetch(target, {
      method,
      headers,
      body: hasBody ? c.req.raw.body : undefined,
      redirect: "manual",
      ...(hasBody ? { duplex: "half" } : {}),
    } as RequestInit);

    const responseHeaders = new Headers(upstream.headers);
    for (const name of DROPPED_RESPONSE_HEADERS) responseHeaders.delete(name);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  };
}
