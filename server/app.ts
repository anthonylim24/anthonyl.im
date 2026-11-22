import { Hono, type Context } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { prettyJSON } from "hono/pretty-json";
import { config } from "./src/config";
import invokeRouter from "./src/routes/invoke";
import { createInstagramPlacesRouter } from "./src/routes/instagramPlaces";
import { createTripsRouter } from "./src/routes/trips";
import { createPlaceSearchRouter } from "./src/routes/placeSearch";
import { createGooglePlaceTypeahead } from "./src/trips/placeSearch";
import { createGooglePlaceDetails } from "./src/trips/placeDetails";
import { getTripStore } from "./src/trips/store";
import { createGoogleGeocoder, createPhotonGeocoder, createTripsLlm } from "./src/trips/ai";
import { createTripReviewWorker, REVIEW_SWEEP_MS } from "./src/trips/reviewWorker";
import { onShutdown } from "./src/shutdown";
import { createClerkAuth, verifyClerkOptional } from "./src/middleware/clerkAuth";
import { createRateLimit, trustedProxyClientAddress, userOrClientKey } from "./src/middleware/rateLimit";
import { bootIgWorker, getQueue, listJobsForUser, listExtractedPlaces, listIgPlaceDays, setIgPlaceDays, removeExtractedPlace } from "./src/igPlaces/wire";
import { createPreviewRouter, getPreviewRoot, previewSiteUrl } from "./src/preview";
import { createAgentSessionRouter } from "./src/routes/agentSession";
import { parseAgentOnBehalfOf, parseAllowedRedirectHosts } from "./src/agentTasks";
import { CLERK_FRONTEND_API, CLERK_PROXY_PATH, clerkProxyHeaders, createClerkProxy } from "./src/clerkProxy";
import {
  canReadMetrics,
  createReadiness,
  createTelemetryRouter,
  httpCheck,
  metricsSnapshot,
  onError,
  requestLog,
  type HealthCheck,
} from "./src/observability";
import { join, resolve } from "path";
import { BUN_IDLE_TIMEOUT_SEC } from "./src/httpIdleTimeout";
import { securityHeaders } from "./src/securityHeaders";
import { createBoundedMemo, createDistReader } from "./src/distFiles";
import { injectPreviewMeta, stripExistingPreviewMeta } from "./src/shellMeta";
import { STATIC_PAGES } from "./src/staticPages";

const app = new Hono();
const siteUrl = (process.env.SITE_URL || "https://anthonyl.im").replace(/\/+$/, "");

// Group middleware by functionality
const commonMiddleware = [
  requestLog(),
  ...securityHeaders,
  prettyJSON(),
  cors({
    origin: config.corsOrigin,
    credentials: true,
    exposeHeaders: ["Content-Type"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }),
];

// Apply common middleware
app.use("*", ...commonMiddleware);
app.onError(onError);

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

// Trip concierge chat — same SSE shape, scoped to a trip document.
app.use("/api/trips/:id/chat", async (c, next) => {
  Object.entries(sseHeaders).forEach(([key, value]) => {
    c.header(key, value);
  });
  await next();
});

// Rate limiting for public LLM endpoints
app.use("/api/invoke/*", createRateLimit({ windowMs: 60_000, max: 20, keyPrefix: "invoke" }));

// API Routes
app.route("/api/invoke", invokeRouter);

// Multi-trip travel planner — Clerk-authenticated CRUD + AI generation /
// enhancement + per-day Map Mode places. The Korea trip is seeded into the
// store on first request and appears as a normal trip.
const tripStore = getTripStore();
// Gemini (GEMINI_MODEL, Maps → Search → JSON retry) with Groq as final fallback —
// Groq's on-demand tier 8k-TPM still 413s on full-trip itineraries, so
// it's last resort only.
const tripsLlm = createTripsLlm({
  geminiApiKey: config.geminiApiKey,
  groqApiKey: config.groqApiKey,
});
// No Maps key → keyless Photon (OpenStreetMap) so AI places still get coordinates.
const tripsGeocode = config.googleMapsApiKey ? createGoogleGeocoder(config.googleMapsApiKey) : createPhotonGeocoder();
// One worker for AI reviews: `/enhance` kicks it with each new run, and (when
// TRIPS_REVIEW_WORKER is on) it also sweeps the queue, below.
const reviewWorker = tripsLlm
  ? createTripReviewWorker({ store: tripStore, llm: tripsLlm, geocode: tripsGeocode })
  : undefined;
app.route(
  "/api/trips",
  createTripsRouter({
    store: tripStore,
    rateLimit: createRateLimit({ windowMs: 60_000, max: 60, keyPrefix: "trips", key: userOrClientKey }),
    verifyAuth: (authHeader) =>
      verifyClerkOptional(authHeader, {
        secretKey: config.clerkSecretKey,
        devBearer: config.igDevBearer,
        devUserId: config.igDevUserId,
      }),
    llm: tripsLlm,
    geocode: tripsGeocode,
    reviewWorker,
  }),
);

// The sweep picks up retries, runs whose worker died, and (with its first
// pass, now) the runs this process's restart left behind. On shutdown the
// runs in progress are handed back so the next process takes them at once
// without spending an attempt; PM2 kills the process ~1.6 s after SIGINT.
if (reviewWorker && config.tripsReviewWorkerEnabled) {
  reviewWorker.start(REVIEW_SWEEP_MS);
  onShutdown("trips-review", async () => {
    reviewWorker.stop();
    await reviewWorker.drain(1_000);
  });
  console.log(`[trips/review] worker sweeping every ${REVIEW_SWEEP_MS / 1000}s`);
} else if (reviewWorker) {
  console.log("[trips/review] TRIPS_REVIEW_WORKER is off: reviews start when asked for, nothing sweeps");
}

// Type-ahead place search for the planner's place fields (Google Places,
// biased to the trip). Its own bucket: a search per pause in typing must
// never starve trip saves.
app.route(
  "/api/places",
  createPlaceSearchRouter({
    search: config.googleMapsApiKey ? createGooglePlaceTypeahead(config.googleMapsApiKey) : null,
    rateLimit: createRateLimit({ windowMs: 60_000, max: 120, keyPrefix: "places", key: userOrClientKey }),
    // The wishlist's details popover: Place Details plus up to six photos per
    // answer, so a tighter bucket than type-ahead.
    details: config.googleMapsApiKey ? createGooglePlaceDetails(config.googleMapsApiKey) : null,
    detailsRateLimit: createRateLimit({ windowMs: 10 * 60_000, max: 60, keyPrefix: "place-details", key: userOrClientKey }),
    verifyAuth: (authHeader) =>
      verifyClerkOptional(authHeader, {
        secretKey: config.clerkSecretKey,
        devBearer: config.igDevBearer,
        devUserId: config.igDevUserId,
      }),
  }),
);

// IG place extractor — Clerk-gated route + in-process worker
const IG_ROUTE_BASES = ['/api/instagram', '/api/korea/places/from-instagram'] as const;
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
    removeExtractedPlace,
    enqueueRateLimit: createRateLimit({ windowMs: 60_000, max: 10, keyPrefix: "ig-enqueue", key: userOrClientKey }),
  });
  // `/api/instagram` is the path the trips planner uses; the Korea path is
  // the same router, kept for older clients.
  for (const base of IG_ROUTE_BASES) {
    app.use(`${base}/*`, clerkAuth);
    app.route(base, igPlacesRouter);
  }
} else {
  // Always answer JSON on this path so the SPA fallback can't intercept and
  // serve index.html with status 200 — which silently breaks the polling FE.
  console.warn('[ig-places] CLERK_SECRET_KEY and IG_DEV_BEARER both missing; route will 503 with a JSON error');
  for (const base of IG_ROUTE_BASES) {
    for (const path of [base, `${base}/*`]) {
      app.all(path, (c) => c.json({
        error: 'ig_places_not_configured',
        message: 'Server is missing CLERK_SECRET_KEY (or IG_DEV_BEARER for dev). Set it and restart.',
      }, 503));
    }
  }
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

if (config.clerkSecretKey) {
  app.all(`${CLERK_PROXY_PATH}/*`, createClerkProxy({
    secretKey: config.clerkSecretKey,
    proxyUrl: config.clerkProxyUrl,
  }));
}

// Remote PR previews — published by .github/workflows/preview.yml into
// $PREVIEW_ROOT/<pr>/ (default ~/previews). Mounted before static/SPA so a
// missing preview returns 404 rather than the production index.html.
app.route("/", createPreviewRouter({
    root: getPreviewRoot(),
    siteUrl: previewSiteUrl(),
  }));

const distPath = resolve(import.meta.dir, "../frontend/dist");

// Health. `/health` answers from memory (deploys and the droplet watchdog poll
// it); `/health/ready` also asks the services sign-in and trips depend on, and
// `/health/metrics` reports request counts, latencies and memory.
app.get("/health", (c) =>
  c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV || "development",
  })
);

const readinessChecks: HealthCheck[] = [
  {
    name: "frontend",
    run: async () => {
      if (!(await Bun.file(join(distPath, "index.html")).exists())) throw new Error("index.html missing");
    },
  },
];
if (config.clerkSecretKey) {
  readinessChecks.push(
    httpCheck("clerk", `${CLERK_FRONTEND_API}/v1/environment`, {
      headers: clerkProxyHeaders(new Headers(), { secretKey: config.clerkSecretKey, proxyUrl: config.clerkProxyUrl }),
    }),
  );
}
if (config.supabaseUrl && config.supabaseServiceKey) {
  readinessChecks.push(
    httpCheck("supabase", `${config.supabaseUrl}/auth/v1/health`, { headers: { apikey: config.supabaseServiceKey } }),
  );
}
const readiness = createReadiness(readinessChecks);

app.get("/health/ready", async (c) => {
  const report = await readiness();
  c.header("Cache-Control", "no-store");
  return c.json(report, report.status === "ok" ? 200 : 503);
});
// Request counts and memory are not for the public: a shell on the droplet,
// or a bearer matching METRICS_TOKEN.
app.get("/health/metrics", (c) => {
  c.header("Cache-Control", "no-store");
  if (!canReadMetrics(c, config.metricsToken)) return c.json({ error: "forbidden" }, 403);
  return c.json(metricsSnapshot());
});

// Browser error beacon: a line in the server log per client-side failure.
app.use("/api/telemetry", createRateLimit({ windowMs: 60_000, max: 30, keyPrefix: "telemetry" }));
app.route("/api/telemetry", createTelemetryRouter());

// An API path nobody serves is a JSON 404, never the SPA shell with a 200.
app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

// In production dist/ only changes on a deploy, which restarts the process,
// so each file is read once. In development every request reads the disk.
const memoiseDist = process.env.NODE_ENV === "production";
const readDist = createDistReader(distPath, { memoise: memoiseDist });

// `/sw.js` MUST be served fresh on every request — the browser only updates
// the service worker when it detects a byte-difference in the SW script, so
// a cached SW means deploys never roll out. We route it explicitly before the
// static-asset middleware so we can set our own headers.
app.get("/sw.js", async (c) => {
  c.header("Cache-Control", "no-cache, no-store, must-revalidate");
  c.header("Pragma", "no-cache");
  c.header("Service-Worker-Allowed", "/");
  c.header("Content-Type", "application/javascript; charset=utf-8");
  return c.body(await readDist("sw.js"));
});

// Twilio SMS proof-of-consent page — static HTML (no SPA shell) so compliance
// crawlers that do not execute JS still see the full opt-in disclosure.
app.get("/sms-consent", async (c) => {
  const file = Bun.file(join(distPath, STATIC_PAGES["/sms-consent"]));
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
// A hashed bundle that is not on disk must be a 404, never the SPA shell: a
// tab left open across a deploy asks for old chunk names, and HTML served as
// JavaScript fails the import with no way to tell why (and the service
// worker would cache it).
app.all("/assets/*", (c) => {
  c.header("Cache-Control", "no-cache, no-store, must-revalidate");
  return c.text("Not found", 404);
});
// The SPA shell, with per-route title / description / preview card. The HTML
// itself must never be long-cached — it references hashed asset filenames that
// change on every build, so a stale index.html would point at deleted bundles.
// Rendered shells are memoised per path (og:url and canonical carry it); the
// cap bounds what random paths can make it hold.
const renderedShells = createBoundedMemo<string>(256, { enabled: memoiseDist });
const spaShell = async (c: Context) => {
  const template = await readDist("index.html", stripExistingPreviewMeta);
  const html = renderedShells.get(c.req.path, () => injectPreviewMeta(template, c.req.path, siteUrl));
  c.header("Cache-Control", "no-cache, no-store, must-revalidate");
  c.header("Pragma", "no-cache");
  c.header("Expires", "0");
  return c.html(html);
};
// Plain HTML, readable without JavaScript, because Google's OAuth branding
// review fetches these URLs and does not run the SPA. (/sms-consent has its
// own no-store route above.)
for (const [path, file] of Object.entries(STATIC_PAGES)) {
  if (path === "/sms-consent") continue;
  app.get(path, async (c) => {
    c.header("Cache-Control", "no-cache");
    return c.html(await readDist(file));
  });
}
// "/" is Lim. Registered ahead of serveStatic, which would otherwise answer
// it with the raw index.html (no preview meta, no no-store).
app.get("/", spaShell);
app.use("*", serveStatic({ root: distPath }));

// Lim used to live at /chatbot; it is the home page now.
app.get("/chatbot", (c) => c.redirect("/", 301));
app.get("/chatbot/", (c) => c.redirect("/", 301));

// Legacy Korea dossier URLs fold into the seeded trip.
app.get("/korea", (c) => c.redirect("/trips/korea-2026", 301));
app.get("/korea/", (c) => c.redirect("/trips/korea-2026", 301));
app.get("/korea/places", (c) => c.redirect("/trips/korea-2026", 301));
app.get("/korea/ingest", (c) => c.redirect("/trips/korea-2026", 301));
app.get("/korea/day/:slug", (c) => c.redirect(`/trips/korea-2026/day/${c.req.param("slug")}`, 301));
app.get("/korea/*", (c) => c.redirect("/trips/korea-2026", 301));

// Serve index.html for all other routes (SPA fallback).
app.get("*", spaShell);

// Bun auto-serves this default export when the entry is `server/app.ts`.
// Attach idleTimeout so that path keeps SSE alive the same way `index.ts` does.
Object.assign(app, { idleTimeout: BUN_IDLE_TIMEOUT_SEC });

export default app;
