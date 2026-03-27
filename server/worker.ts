import app from "./app";
import type { Bindings } from "./src/types";

const HTML_CACHE_TTL = 300;
const SWR_TTL = 60;

export default {
  async fetch(
    request: Request,
    env: Bindings,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const cache = caches.default;

    const shouldCache =
      request.method === "GET" &&
      !url.pathname.startsWith("/api/") &&
      url.pathname !== "/health";

    if (shouldCache) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }

    const response = await app.fetch(request, env, ctx);

    if (shouldCache && response.ok) {
      const headers = new Headers(response.headers);
      headers.set(
        "Cache-Control",
        `public, s-maxage=${HTML_CACHE_TTL}, stale-while-revalidate=${SWR_TTL}`
      );

      const responseToCache = new Response(response.clone().body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });

      ctx.waitUntil(cache.put(request, responseToCache));
    }

    return response;
  },
};
