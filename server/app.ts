import { Hono, type Context } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { prettyJSON } from "hono/pretty-json";
import { config } from "./src/config";
import { errorHandler } from "./src/middleware/error";
import invokeRouter from "./src/routes/invoke";
import koreaRouter from "./src/routes/korea";
import entityRouter from "./src/routes/entity";
import { createInstagramPlacesRouter } from "./src/routes/instagramPlaces";
import { createTripsRouter } from "./src/routes/trips";
import { getTripStore } from "./src/trips/store";
import { createGoogleGeocoder, createTripsLlm } from "./src/trips/ai";
import { createClerkAuth, verifyClerkOptional } from "./src/middleware/clerkAuth";
import { createRateLimit, trustedProxyClientAddress } from "./src/middleware/rateLimit";
import { bootIgWorker, getQueue, listJobsForUser, listExtractedPlaces, listIgPlaceDays, setIgPlaceDays } from "./src/igPlaces/wire";
import { createPreviewRouter, getPreviewRoot, previewSiteUrl } from "./src/preview";
import { createAgentSessionRouter } from "./src/routes/agentSession";
import { parseAgentOnBehalfOf, parseAllowedRedirectHosts } from "./src/agentTasks";
import { join, resolve } from "path";
import { BUN_IDLE_TIMEOUT_SEC } from "./src/httpIdleTimeout";

const app = new Hono();
const siteUrl = (process.env.SITE_URL || "https://anthonyl.im").replace(/\/+$/, "");

type AppPreviewMeta = {
  title: string;
  description: string;
  imagePathOrUrl: string;
  imageAlt: string;
};

// Preview cards are 1200×630 JPEGs in frontend/public, each the app's own
// scene with its title. Bump OG_VERSION when a card changes so social caches
// fetch the new one.
const OG_VERSION = "2";
const card = (name: string) => `/og-${name}.jpg?v=${OG_VERSION}`;

const appPreviews = {
  landing: {
    title: "anthonyl.im — Applied intelligence lab",
    description:
      "Frontier models and the agents that put them to work — they plan before they act, stay inside the bounds you set, and verify every step.",
    imagePathOrUrl: card("landing"),
    imageAlt: "“Intelligence you can hold to account.” beside a glass droplet in ultramarine brush strokes",
  },
  chatbot: {
    title: "Lim — Ask Anthony Lim's AI",
    description:
      "Meet Lim, a squishy jelly who answers for Anthony Lim. Ask about his work, projects, and engineering background.",
    imagePathOrUrl: card("chatbot"),
    imageAlt: "Lim, a glossy coral jelly with big eyes, sitting on a mint rug beside jelly beans",
  },
  breathwork: {
    title: "BreathFlow — Guided breathing with a watercolour cat",
    description:
      "Research-backed breathing — box breathing, cyclic sighing, 4-7-8, resonance and more — paced by a hand-painted cat that breathes with you.",
    imagePathOrUrl: card("breathwork"),
    imageAlt: "A violet watercolour cat sitting in splashes of paint beside the BreathFlow wordmark",
  },
  korea: {
    title: "Seoul + Busan — Korea 2026 trip dossier",
    description:
      "A 12-day Seoul + Busan trip (May 26 – Jun 6, 2026): reservations, neighbourhoods, the places worth a detour, and a 3D Map Mode.",
    imagePathOrUrl: card("korea"),
    imageAlt: "A toy clay planet covered in trees and colourful place pins on a pink cover",
  },
  trips: {
    title: "Trips — plan a trip, pin by pin",
    description:
      "Plan trips with AI, save places from Instagram posts, ask the concierge, and explore every day in 3D Map Mode.",
    imagePathOrUrl: card("trips"),
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

const resolveImageUrl = (imagePathOrUrl: string): string =>
  imagePathOrUrl.startsWith("http")
    ? imagePathOrUrl
    : `${siteUrl}${imagePathOrUrl.startsWith("/") ? imagePathOrUrl : `/${imagePathOrUrl}`}`;

/** BreathFlow's pages share a card; each gets its own title. */
const breathworkPages: Record<string, string> = {
  "/breathwork/session": "Breathe",
  "/breathwork/progress": "Progress",
  "/breathwork/settings": "Settings",
};

const getPreviewMetaForPath = (pathname: string): AppPreviewMeta => {
  if (pathname.startsWith("/breathwork")) {
    const page = breathworkPages[pathname.replace(/\/+$/, "")];
    return page ? { ...appPreviews.breathwork, title: `${page} · BreathFlow` } : appPreviews.breathwork;
  }
  if (pathname.startsWith("/korea") || pathname.startsWith("/trips/korea-2026")) return appPreviews.korea;
  if (pathname.startsWith("/trips")) return appPreviews.trips;
  if (pathname === "/" || pathname === "") return appPreviews.landing;
  return appPreviews.chatbot;
};

const stripExistingPreviewMeta = (html: string): string =>
  html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+name=["']description["'][^>]*>\s*/i, "")
    .replace(/<meta\s+property=["']og:[^>]*>\s*/gi, "")
    .replace(/<meta\s+name=["']twitter:[^>]*>\s*/gi, "")
    .replace(/<meta\s+name=["']apple-mobile-web-app-title["'][^>]*>\s*/gi, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>\s*/i, "");

const injectPreviewMeta = (html: string, pathname: string): string => {
  const preview = getPreviewMetaForPath(pathname);
  const pageUrl = `${siteUrl}${pathname || "/"}`;
  const imageUrl = resolveImageUrl(preview.imagePathOrUrl);
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
    <meta name="apple-mobile-web-app-title" content="${escapeHtml(preview.title)}" />
    <link rel="canonical" href="${escapeHtml(pageUrl)}" />`;

  return stripExistingPreviewMeta(html).replace("</head>", `${metaTags}\n  </head>`);
};

// Group middleware by functionality
const commonMiddleware = [
  logger(),
  prettyJSON(),
  cors({
    origin: config.corsOrigin,
    credentials: true,
    exposeHeaders: ["Content-Type"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }),
  errorHandler,
];

// Apply common middleware
app.use("*", ...commonMiddleware);

// SSE headers middleware
const sseHeaders = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache",
  "X-Accel-Buffering": "no",
  Connection: "keep-alive",
} as const;

app.use("/api/invoke/*", async (c, next) => {
  Object.entries(sseHeaders).forEach(([key, value]) => {
    c.header(key, value);
  });
  await next();
});

// Korea concierge chat is also SSE-streamed (Gemini relay).
app.use("/api/korea/chat", async (c, next) => {
  Object.entries(sseHeaders).forEach(([key, value]) => {
    c.header(key, value);
  });
  await next();
});

// Trip concierge chat — same SSE shape, scoped to a trip document.
app.use("/api/trips/:id/chat", async (c, next) => {
  Object.entries(sseHeaders).forEach(([key, value]) => {
    c.header(key, value);
  });
  await next();
});

// Rate limiting for public LLM endpoints
const invokeRateLimit = createRateLimit({ windowMs: 60_000, max: 20, keyPrefix: "invoke" });
const entityRateLimit = createRateLimit({ windowMs: 60_000, max: 30, keyPrefix: "entity" });
app.use("/api/invoke/*", invokeRateLimit);
app.use("/api/entity/*", entityRateLimit);

// API Routes
app.route("/api/invoke", invokeRouter);
app.route("/api/korea", koreaRouter);
app.route("/api/entity", entityRouter);

// Multi-trip travel planner — Clerk-authenticated CRUD + AI generation /
// enhancement + per-day Map Mode places. The Korea trip is seeded into the
// store on first request and appears as a normal trip.
const tripsRateLimit = createRateLimit({ windowMs: 60_000, max: 60, keyPrefix: "trips" });
app.use("/api/trips/*", tripsRateLimit);
app.use("/api/trips/:id/*", tripsRateLimit);
app.route(
  "/api/trips",
  createTripsRouter({
    store: getTripStore(),
    verifyAuth: (authHeader) =>
      verifyClerkOptional(authHeader, {
        secretKey: config.clerkSecretKey,
        devBearer: config.igDevBearer,
        devUserId: config.igDevUserId,
      }),
    // Gemini 3.7 Flash (Maps → JSON retry) with Groq as final fallback —
    // Groq's on-demand tier 8k-TPM still 413s on full-trip itineraries, so
    // it's last resort only.
    llm: createTripsLlm({
      geminiApiKey: config.geminiApiKey,
      groqApiKey: config.groqApiKey,
    }),
    geocode: config.googleMapsApiKey ? createGoogleGeocoder(config.googleMapsApiKey) : null,
  }),
);

// IG place extractor — Clerk-gated route + in-process worker
const clerkAuth = (config.clerkSecretKey || config.igDevBearer)
  ? createClerkAuth({
      secretKey: config.clerkSecretKey,
      devBearer: config.igDevBearer,
      devUserId: config.igDevUserId,
    })
  : null;

if (clerkAuth) {
  const igPlacesRouter = createInstagramPlacesRouter({
    enqueue: (userId, url, opts) => getQueue().enqueue(userId, url, opts),
    statsHandler: async () => {
      try {
        const counts = await getQueue().stats();
        return { enabled: config.igWorkerEnabled, ...counts };
      } catch (err) {
        return { enabled: config.igWorkerEnabled, error: 'stats unavailable' };
      }
    },
    listJobs: listJobsForUser,
    retryJob: (jobId, userId) => getQueue().retryJob(jobId, userId),
    reextractJob: (jobId, userId) => getQueue().reextractJob(jobId, userId),
    listExtractedPlaces,
    listIgPlaceDays,
    setIgPlaceDays,
  });
  app.use('/api/korea/places/from-instagram/*', clerkAuth);
  app.route('/api/korea/places/from-instagram', igPlacesRouter);
} else {
  // Always answer JSON on this path so the SPA fallback can't intercept and
  // serve index.html with status 200 — which silently breaks the polling FE.
  console.warn('[ig-places] CLERK_SECRET_KEY and IG_DEV_BEARER both missing; route will 503 with a JSON error');
  app.all('/api/korea/places/from-instagram', (c) => c.json({
    error: 'ig_places_not_configured',
    message: 'Server is missing CLERK_SECRET_KEY (or IG_DEV_BEARER for dev). Set it and restart.',
  }, 503));
  app.all('/api/korea/places/from-instagram/*', (c) => c.json({
    error: 'ig_places_not_configured',
    message: 'Server is missing CLERK_SECRET_KEY (or IG_DEV_BEARER for dev). Set it and restart.',
  }, 503));
}

bootIgWorker();

// Clerk Agent Tasks — mint a one-time sign-in URL for AI agents / Playwright
// against production or PR previews. 404 until CLERK_SECRET_KEY and
// CLERK_AGENT_USER_ID (or _EMAIL) are set. Never a public bypass.
const agentSessionRateLimit = createRateLimit({
  windowMs: 60_000,
  max: 10,
  keyPrefix: "agent-session",
  key: trustedProxyClientAddress,
});
app.use("/api/agent/*", agentSessionRateLimit);
app.route(
  "/api/agent",
  createAgentSessionRouter({
    clerkSecretKey: config.clerkSecretKey,
    loginSecret: config.agentLoginSecret,
    onBehalfOf: parseAgentOnBehalfOf(process.env),
    allowedHosts: parseAllowedRedirectHosts(config.agentRedirectHosts),
    githubRepo: config.agentGithubRepo,
  }),
);

// Remote PR previews — published by .github/workflows/preview.yml into
// $PREVIEW_ROOT/<pr>/ (default ~/previews). Mounted before static/SPA so a
// missing preview returns 404 rather than the production index.html.
app.route("/", createPreviewRouter({
    root: getPreviewRoot(),
    siteUrl: previewSiteUrl(),
  }));

// Health check
app.get("/health", (c) =>
  c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV || "development",
  })
);

const distPath = resolve(import.meta.dir, "../frontend/dist");

// `/sw.js` MUST be served fresh on every request — the browser only updates
// the service worker when it detects a byte-difference in the SW script, so
// a cached SW means deploys never roll out. We route it explicitly before the
// static-asset middleware so we can set our own headers.
app.get("/sw.js", async (c) => {
  const file = Bun.file(join(distPath, "sw.js"));
  c.header("Cache-Control", "no-cache, no-store, must-revalidate");
  c.header("Pragma", "no-cache");
  c.header("Service-Worker-Allowed", "/");
  c.header("Content-Type", "application/javascript; charset=utf-8");
  return c.body(await file.text());
});

// Twilio SMS proof-of-consent page — static HTML (no SPA shell) so compliance
// crawlers that do not execute JS still see the full opt-in disclosure.
app.get("/sms-consent", async (c) => {
  const file = Bun.file(join(distPath, "sms-consent.html"));
  if (!(await file.exists())) {
    return c.text("SMS consent page not found", 404);
  }
  c.header("Cache-Control", "no-cache, no-store, must-revalidate");
  c.header("Pragma", "no-cache");
  c.header("Content-Type", "text/html; charset=utf-8");
  return c.html(await file.text());
});


// Serve static assets — content-hashed bundles get long-cache so the new
// bundle hashes (the only files referenced by the fresh index.html) are
// immutable + browser-cached, while the entry HTML stays no-cache below.
app.use(
  "/assets/*",
  serveStatic({
    root: distPath,
    onFound: (_, c) => {
      c.header("Cache-Control", "public, max-age=31536000, immutable");
    },
  }),
);
// The SPA shell, with per-route title / description / preview card. The HTML
// itself must never be long-cached — it references hashed asset filenames that
// change on every build, so a stale index.html would point at deleted bundles.
const spaShell = async (c: Context) => {
  const baseHtml = await Bun.file(join(distPath, "index.html")).text();
  const withMeta = injectPreviewMeta(baseHtml, c.req.path);
  c.header("Cache-Control", "no-cache, no-store, must-revalidate");
  c.header("Pragma", "no-cache");
  c.header("Expires", "0");
  return c.html(withMeta);
};
// Registered ahead of serveStatic, which would otherwise answer "/" with the
// raw dist/index.html (no landing metadata, no no-cache headers).
app.get("/", spaShell);
app.use("*", serveStatic({ root: distPath }));

// Legacy Korea dossier URLs fold into the seeded trip.
app.get("/korea", (c) => c.redirect("/trips/korea-2026", 301));
app.get("/korea/", (c) => c.redirect("/trips/korea-2026", 301));
app.get("/korea/places", (c) => c.redirect("/trips/korea-2026/places", 301));
app.get("/korea/ingest", (c) => c.redirect("/trips/korea-2026?ingest=1", 301));
app.get("/korea/day/:slug", (c) => c.redirect(`/trips/korea-2026/day/${c.req.param("slug")}`, 301));
app.get("/korea/*", (c) => c.redirect("/trips/korea-2026", 301));

// Serve index.html for all other routes (SPA fallback).
app.get("*", spaShell);

// Bun auto-serves this default export when the entry is `server/app.ts`.
// Attach idleTimeout so that path keeps SSE alive the same way `index.ts` does.
Object.assign(app, { idleTimeout: BUN_IDLE_TIMEOUT_SEC });

export default app;
