import type { Context } from "hono";
import { count } from "./observability";

export const CLERK_PROXY_PATH = "/__clerk";
export const CLERK_FRONTEND_API = "https://frontend-api.clerk.dev";

// Bun's fetch decodes the body, so the upstream's encoding and length no
// longer describe what we send on.
const DROPPED_RESPONSE_HEADERS = ["content-encoding", "content-length", "transfer-encoding"];

const RETRY_PAUSE_MS = 150;

// Hop-by-hop headers describe the connection a request arrived on (RFC 9110
// §7.6.1), not the request. nginx sends Bun `Connection: close`; passed on,
// it made Bun open a new TLS connection to Clerk for every request, and each
// new connection can lose its SYN and stall 1 s, then 3 s.
const HOP_BY_HOP = ["connection", "keep-alive", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade"];

// Writes that are safe to send twice: minting a session token and marking the
// session active. These are almost all of the proxy's traffic (a token every
// minute per open tab), and a stalled one leaves clerk-js stuck until a reload.
const REPEATABLE_WRITE = /^\/v1\/client\/sessions\/[^/]+\/(?:tokens(?:\/[^/]+)?|touch)$/;

function storedOn(host: string, cookie: string): boolean {
  const domain = /;\s*domain=\.?([^;]+)/i.exec(cookie)?.[1].trim().toLowerCase();
  return !domain || host === domain || host.endsWith(`.${domain}`);
}

export interface ClerkProxyDeps {
  secretKey: string;
  proxyUrl: string;
  fetch?: typeof fetch;
  /** Deadline for one upstream attempt. */
  timeoutMs?: number;
  /** Deadline for one attempt at a repeatable write: a token answers in
   *  ~120 ms (p99 ~700 ms), so one this late is better sent again. */
  repeatableWriteTimeoutMs?: number;
}

/** Headers Clerk's Frontend API needs to treat a request as proxied. */
export function clerkProxyHeaders(base: Headers, { secretKey, proxyUrl }: Pick<ClerkProxyDeps, "secretKey" | "proxyUrl">) {
  const headers = new Headers(base);
  const named = (base.get("connection") ?? "").split(",").map((name) => name.trim()).filter(Boolean);
  for (const name of [...HOP_BY_HOP, ...named]) headers.delete(name);
  headers.delete("host");
  headers.set("Clerk-Proxy-Url", proxyUrl);
  headers.set("Clerk-Secret-Key", secretKey);
  return headers;
}

// Serves Clerk's Frontend API from our own origin, so sign-in works on
// networks that block the clerk.<domain> subdomain.
export function createClerkProxy({
  secretKey,
  proxyUrl,
  fetch: doFetch = fetch,
  timeoutMs = 10_000,
  repeatableWriteTimeoutMs = 5_000,
}: ClerkProxyDeps) {
  const siteHost = new URL(proxyUrl).hostname.toLowerCase();
  return async (c: Context) => {
    const url = new URL(c.req.url);
    const path = url.pathname.slice(CLERK_PROXY_PATH.length) || "/";
    const target = `${CLERK_FRONTEND_API}${path}${url.search}`;

    const headers = clerkProxyHeaders(c.req.raw.headers, { secretKey, proxyUrl });
    const clientIp = c.req.header("cf-connecting-ip") ?? c.req.header("x-real-ip");
    if (clientIp) headers.set("X-Forwarded-For", clientIp);
    else headers.delete("X-Forwarded-For");

    const method = c.req.method;
    const hasBody = method !== "GET" && method !== "HEAD";
    // A read is safe to repeat; most writes may already have happened upstream.
    const repeatable = !hasBody || REPEATABLE_WRITE.test(path);
    // A repeatable write's body (a few bytes) is read first so it can be sent
    // again; any other body streams straight through.
    const body = !hasBody ? undefined : repeatable ? await c.req.arrayBuffer() : c.req.raw.body;
    const deadline = hasBody && repeatable ? repeatableWriteTimeoutMs : timeoutMs;
    const attempt = () =>
      doFetch(target, {
        method,
        headers,
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(deadline),
        ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
      } as RequestInit);

    // At most two attempts: a second on a network error or a gateway error.
    const attempts = repeatable ? 2 : 1;
    let upstream: Response | null = null;
    let failure: unknown = null;
    for (let tried = 1; tried <= attempts; tried++) {
      if (tried > 1) {
        count("clerk_proxy.retries");
        await Bun.sleep(RETRY_PAUSE_MS);
      }
      try {
        upstream = await attempt();
      } catch (error) {
        upstream = null;
        failure = error;
        continue;
      }
      if (tried === attempts || upstream.status < 502 || upstream.status > 504) break;
      await upstream.body?.cancel();
    }
    if (!upstream) return unreachable(c, failure);

    const responseHeaders = new Headers(upstream.headers);
    for (const name of DROPPED_RESPONSE_HEADERS) responseHeaders.delete(name);
    // Clerk's Cloudflare sets __cf_bm and _cfuvid for its own domains, pinned
    // clerk-js included. Browsers here reject them, and Cloudflare will not
    // cache a response that sets a cookie.
    responseHeaders.delete("set-cookie");
    for (const cookie of upstream.headers.getSetCookie()) {
      if (storedOn(siteHost, cookie)) responseHeaders.append("set-cookie", cookie);
    }
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
