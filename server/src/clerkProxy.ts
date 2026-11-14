import type { Context } from "hono";
import { count } from "./observability";

export const CLERK_PROXY_PATH = "/__clerk";
export const CLERK_FRONTEND_API = "https://frontend-api.clerk.dev";

// Bun's fetch decodes the body, so the upstream's encoding and length no
// longer describe what we send on.
const DROPPED_RESPONSE_HEADERS = ["content-encoding", "content-length", "transfer-encoding"];

const RETRY_PAUSE_MS = 150;

export interface ClerkProxyDeps {
  secretKey: string;
  proxyUrl: string;
  fetch?: typeof fetch;
  /** Deadline for one upstream attempt. */
  timeoutMs?: number;
}

/** Headers Clerk's Frontend API needs to treat a request as proxied. */
export function clerkProxyHeaders(base: Headers, { secretKey, proxyUrl }: Pick<ClerkProxyDeps, "secretKey" | "proxyUrl">) {
  const headers = new Headers(base);
  headers.delete("host");
  headers.set("Clerk-Proxy-Url", proxyUrl);
  headers.set("Clerk-Secret-Key", secretKey);
  return headers;
}

// Serves Clerk's Frontend API from our own origin, so sign-in works on
// networks that block the clerk.<domain> subdomain.
export function createClerkProxy({ secretKey, proxyUrl, fetch: doFetch = fetch, timeoutMs = 10_000 }: ClerkProxyDeps) {
  return async (c: Context) => {
    const url = new URL(c.req.url);
    const target = `${CLERK_FRONTEND_API}${url.pathname.slice(CLERK_PROXY_PATH.length) || "/"}${url.search}`;

    const headers = clerkProxyHeaders(c.req.raw.headers, { secretKey, proxyUrl });
    const clientIp = c.req.header("cf-connecting-ip") ?? c.req.header("x-real-ip");
    if (clientIp) headers.set("X-Forwarded-For", clientIp);
    else headers.delete("X-Forwarded-For");

    const method = c.req.method;
    const hasBody = method !== "GET" && method !== "HEAD";
    const attempt = () =>
      doFetch(target, {
        method,
        headers,
        body: hasBody ? c.req.raw.body : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        ...(hasBody ? { duplex: "half" } : {}),
      } as RequestInit);

    let upstream: Response;
    try {
      upstream = await attempt();
      // A read is safe to repeat; a write may already have happened upstream.
      if (!hasBody && upstream.status >= 502 && upstream.status <= 504) {
        await upstream.body?.cancel();
        count("clerk_proxy.retries");
        await Bun.sleep(RETRY_PAUSE_MS);
        upstream = await attempt();
      }
    } catch (first) {
      if (hasBody) return unreachable(c, first);
      count("clerk_proxy.retries");
      try {
        await Bun.sleep(RETRY_PAUSE_MS);
        upstream = await attempt();
      } catch (second) {
        return unreachable(c, second);
      }
    }

    const responseHeaders = new Headers(upstream.headers);
    for (const name of DROPPED_RESPONSE_HEADERS) responseHeaders.delete(name);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  };
}

// Clerk's own error shape, so clerk-js reports it instead of failing to parse.
function unreachable(c: Context, error: unknown) {
  count("clerk_proxy.failures");
  console.error(`[clerk-proxy] ${c.req.method} ${c.req.path} failed:`, error instanceof Error ? error.message : error);
  c.header("Cache-Control", "no-store");
  c.header("Retry-After", "2");
  return c.json(
    { errors: [{ code: "proxy_upstream_unreachable", message: "Sign-in service is temporarily unreachable.", long_message: "The sign-in service could not be reached. Try again in a moment." }] },
    502,
  );
}
