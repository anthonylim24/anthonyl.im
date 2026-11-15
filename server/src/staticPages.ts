/**
 * Server-rendered HTML pages that are not the SPA shell: readable without
 * JavaScript (Google's OAuth branding review, compliance crawlers). The
 * service worker keeps its own copy of these paths (`STATIC_PAGES` in
 * frontend/public/sw.js, which cannot import this); `staticPages.test.ts`
 * fails when the two drift.
 */
export const STATIC_PAGES = {
  "/home": "home.html",
  "/privacy": "privacy.html",
  "/terms": "terms.html",
  "/sms-consent": "sms-consent.html",
} as const satisfies Record<string, string>;
