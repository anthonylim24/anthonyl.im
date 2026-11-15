import type { MiddlewareHandler } from "hono";
import { secureHeaders } from "hono/secure-headers";

const DEFAULT_REFERRER_POLICY = "strict-origin-when-cross-origin";

/**
 * Site-wide response headers. Deliberately narrow: the CSP is only
 * `frame-ancestors 'self'` (no clickjacking), because a script / connect /
 * img policy would have to track Clerk, MapLibre and OpenFreeMap tiles,
 * Google 3D Tiles, PostHog and PR previews, and one missed host breaks
 * sign-in or a map. Hono's other defaults are off for the same reason
 * (`Cross-Origin-Opener-Policy: same-origin` would break Clerk's OAuth popup).
 */
const secure = secureHeaders({
  // No includeSubDomains: not every name under anthonyl.im is ours to promise HTTPS for.
  strictTransportSecurity: "max-age=31536000",
  xContentTypeOptions: true,
  contentSecurityPolicy: { frameAncestors: ["'self'"] },
  // Set below, so a route that chose a stricter policy keeps it.
  referrerPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
  xDnsPrefetchControl: false,
  xDownloadOptions: false,
  xFrameOptions: false,
  xPermittedCrossDomainPolicies: false,
  xXssProtection: false,
});

/** PR previews send `no-referrer` so preview URLs never leak; everything else gets the default. */
const referrerPolicy: MiddlewareHandler = async (c, next) => {
  await next();
  if (!c.res.headers.has("Referrer-Policy")) c.res.headers.set("Referrer-Policy", DEFAULT_REFERRER_POLICY);
};

export const securityHeaders: MiddlewareHandler[] = [secure, referrerPolicy];
