import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { prettyJSON } from "hono/pretty-json";
import { config } from "./src/config";
import { errorHandler } from "./src/middleware/error";
import invokeRouter from "./src/routes/invoke";
import { join, resolve } from "path";

const app = new Hono();
const siteUrl = (process.env.SITE_URL || "https://anthonyl.im").replace(/\/+$/, "");

type AppPreviewMeta = {
  title: string;
  description: string;
  imagePathOrUrl: string;
  imageAlt: string;
};

const appPreviews = {
  chatbot: {
    title: "Anthony Lim AI Chatbot",
    description:
      "Chat with Anthony's AI assistant to explore his experience, projects, and technical background.",
    imagePathOrUrl:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&h=630&q=80",
    imageAlt: "Futuristic AI interface with glowing code and circuitry visuals",
  },
  breathwork: {
    title: "Breathwork by Anthony Lim",
    description:
      "Guided breathing sessions with streaks, XP, and progress tracking for calm, focus, and recovery.",
    imagePathOrUrl:
      "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1200&h=630&q=80",
    imageAlt: "Person meditating at sunrise with calm natural tones",
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

const getPreviewMetaForPath = (pathname: string): AppPreviewMeta => {
  if (pathname.startsWith("/breathwork")) return appPreviews.breathwork;
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

// API Routes
app.route("/api/invoke", invokeRouter);

// Health check
app.get("/health", (c) =>
  c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV || "development",
  })
);

const distPath =
  process.env.NODE_ENV === "development"
    ? resolve(process.cwd(), "frontend/dist")
    : resolve(process.cwd(), "anthonyl.im/frontend/dist");

// Serve static assets
app.use("*", serveStatic({ root: distPath }));

// Serve index.html for all other routes (SPA fallback)
app.get("*", async (c) => {
  const baseHtml = await Bun.file(join(distPath, "index.html")).text();
  const withMeta = injectPreviewMeta(baseHtml, c.req.path);
  return c.html(withMeta);
});

export default app;
