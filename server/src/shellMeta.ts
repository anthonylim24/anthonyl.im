// Per-route metadata for the SPA shell (frontend/index.html): title,
// description, link-preview card and the Home Screen install name. The server
// writes these into the HTML so crawlers that run no JavaScript see the right
// card; the inline route-metadata scripts in index.html then update the same
// tags in place. Keep their titles in step with `lib/routeMetadata.ts`.

type AppPreviewMeta = {
  title: string;
  description: string;
  imagePathOrUrl: string;
  imageAlt: string;
  /**
   * The short label under a Home Screen icon (`apple-mobile-web-app-title`,
   * `application-name`). iOS reads it at page load, before any script, so it
   * must be right in the HTML. Only `/trips*` is in a manifest's scope
   * (`trips.webmanifest`, or `korea.webmanifest` for that trip; see
   * `manifestForPath`); elsewhere Add to Home Screen saves a shortcut to
   * that page, so it carries that app's own name.
   */
  installName: string;
};

// Preview cards are 1200×630 JPEGs in frontend/public, each the app's own
// scene with its title. Bump OG_VERSION when a card changes so social caches
// fetch the new one.
const OG_VERSION = "3";
const card = (name: string) => `/og-${name}.jpg?v=${OG_VERSION}`;

export const appPreviews = {
  landing: {
    title: "anthonyl.im — Applied intelligence lab",
    description:
      "Frontier models and the agents that put them to work — they plan before they act, stay inside the bounds you set, and verify every step.",
    imagePathOrUrl: card("landing"),
    installName: "anthonyl.im",
    imageAlt: "“Intelligence you can hold to account.” beside a glass droplet in ultramarine brush strokes",
  },
  chatbot: {
    title: "Lim — Ask Anthony Lim's AI",
    description:
      "Meet Lim, a squishy jelly who answers for Anthony Lim. Ask about his work, projects, and engineering background.",
    imagePathOrUrl: card("chatbot"),
    installName: "Lim",
    imageAlt: "Lim, a glossy coral jelly with big eyes, sitting on a mint rug beside jelly beans",
  },
  breathwork: {
    title: "BreathFlow — Guided breathing with a watercolour cat",
    description:
      "Research-backed breathing — box breathing, cyclic sighing, 4-7-8, resonance and more — paced by a hand-painted cat that breathes with you.",
    imagePathOrUrl: card("breathwork"),
    installName: "BreathFlow",
    imageAlt: "A violet watercolour cat sitting in splashes of paint beside the BreathFlow wordmark",
  },
  korea: {
    title: "Seoul + Busan — Korea 2026 trip dossier",
    description:
      "A 12-day Seoul + Busan trip (May 26 – Jun 6, 2026): reservations, neighbourhoods, the places worth a detour, and a 3D Map Mode.",
    imagePathOrUrl: card("korea"),
    installName: "Korea Trip",
    imageAlt: "A toy clay planet covered in trees and colourful place pins on a pink cover",
  },
  trips: {
    title: "Trips — Plan trips on a map",
    description:
      "Plan trips on a live 3D map: let AI draft the days, pin every stop, and share the plan with whoever is coming.",
    imagePathOrUrl: card("trips"),
    installName: "Trips",
    imageAlt: "A squishy toy globe with a trip pin and a paper plane, under puffy clouds",
  },
} as const satisfies Record<string, AppPreviewMeta>;

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const resolveImageUrl = (imagePathOrUrl: string, siteUrl: string): string =>
  imagePathOrUrl.startsWith("http")
    ? imagePathOrUrl
    : `${siteUrl}${imagePathOrUrl.startsWith("/") ? imagePathOrUrl : `/${imagePathOrUrl}`}`;

/** BreathFlow's pages share a card; each gets its own title. */
const breathworkPages: Record<string, string> = {
  "/breathwork/session": "Breathe",
  "/breathwork/progress": "Progress",
  "/breathwork/settings": "Settings",
};

const isKoreaPath = (pathname: string) => pathname.startsWith("/korea") || pathname.startsWith("/trips/korea-2026");

/**
 * The web app manifest a page links. Every trip but Korea installs as
 * "Trips" (start_url /trips); the Korea trip keeps its own. Elsewhere the
 * link stays Korea's, as it always has been: those pages are outside its
 * /trips scope, so Add to Home Screen saves a shortcut to the page.
 * `lib/routeMetadata.ts` `manifestForPath` and index.html's korea script
 * make the same choice in the browser.
 */
export const manifestForPath = (pathname: string): string =>
  pathname.startsWith("/trips") && !isKoreaPath(pathname) ? "/trips.webmanifest" : "/korea.webmanifest";

export const getPreviewMetaForPath = (pathname: string): AppPreviewMeta => {
  if (pathname.startsWith("/breathwork")) {
    const page = breathworkPages[pathname.replace(/\/+$/, "")];
    return page ? { ...appPreviews.breathwork, title: `${page} · BreathFlow` } : appPreviews.breathwork;
  }
  if (isKoreaPath(pathname)) return appPreviews.korea;
  if (pathname.startsWith("/trips")) return appPreviews.trips;
  if (pathname === "/lab") return appPreviews.landing;
  return appPreviews.chatbot;
};

export const stripExistingPreviewMeta = (html: string): string =>
  html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+name=["']description["'][^>]*>\s*/i, "")
    .replace(/<meta\s+property=["']og:[^>]*>\s*/gi, "")
    .replace(/<meta\s+name=["']twitter:[^>]*>\s*/gi, "")
    .replace(/<meta\s+name=["']apple-mobile-web-app-title["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+name=["']application-name["'][^>]*>\s*/gi, "")
    .replace(/<link\s+rel=["']manifest["'][^>]*>\s*/gi, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>\s*/i, "");

const CHARSET = /<meta\s+charset=["']?[^"'>\s]+["']?\s*\/?>/i;

/**
 * `template` is index.html already through `stripExistingPreviewMeta`. The
 * tags go straight after `<meta charset>`: ahead of the inline route-metadata
 * scripts, which then update them in place instead of racing a later copy.
 */
export const injectPreviewMeta = (template: string, pathname: string, siteUrl: string): string => {
  const preview = getPreviewMetaForPath(pathname);
  const pageUrl = `${siteUrl}${pathname || "/"}`;
  const imageUrl = resolveImageUrl(preview.imagePathOrUrl, siteUrl);
  const metaTags = `
    <title>${escapeHtml(preview.title)}</title>
    <meta name="description" content="${escapeHtml(preview.description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Anthony Lim" />
    <meta property="og:title" content="${escapeHtml(preview.title)}" />
    <meta property="og:description" content="${escapeHtml(preview.description)}" />
    <meta property="og:url" content="${escapeHtml(pageUrl)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeHtml(preview.imageAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(preview.title)}" />
    <meta name="twitter:description" content="${escapeHtml(preview.description)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
    <meta name="twitter:image:alt" content="${escapeHtml(preview.imageAlt)}" />
    <meta name="apple-mobile-web-app-title" content="${escapeHtml(preview.installName)}" />
    <meta name="application-name" content="${escapeHtml(preview.installName)}" />
    <link rel="manifest" href="${manifestForPath(pathname)}" />
    <link rel="canonical" href="${escapeHtml(pageUrl)}" />`;

  // Replacer functions: a string replacement would expand `$&` / `$'` that
  // arrive in the request path (og:url, canonical).
  if (CHARSET.test(template)) return template.replace(CHARSET, (charset) => `${charset}${metaTags}`);
  return template.replace(/<head[^>]*>/i, (head) => `${head}${metaTags}`);
};
