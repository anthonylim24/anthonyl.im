import { Hono, type Context } from "hono";
import { homedir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";

/** URL prefix every remote PR preview is published under. */
export const PREVIEW_MOUNT = "/preview";
export const PREVIEW_PR_PREFIX = "/preview/pr";

const PR_ID_RE = /^\d{1,10}$/;
const PREVIEW_PATH_RE = /^\/preview\/pr\/(\d{1,10})(?:\/(.*))?$/;
const STAGING_DIR = ".staging";
const META_FILENAME = "preview.json";

const MIME_BY_EXT: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

const ASSET_EXT_RE =
  /\.(?:css|gif|ico|jpe?g|js|json|map|mjs|png|svg|txt|webmanifest|webp|woff2?|xml)$/i;

export type PreviewMeta = {
  v: 1;
  pr: number;
  sha: string;
  builtAt: string;
  base: string;
  htmlUrl?: string;
  siteUrl?: string;
};

export type PreviewApiTarget = {
  port: number;
  pid?: number;
};

const PREVIEW_API_HEADER = "X-Preview-API";
const PREVIEW_API_FILENAME = "api.json";

export function previewApiUpstreamPath(pr: string, pathname: string): string {
  const prefix = `${PREVIEW_PR_PREFIX}/${pr}`;
  if (pathname === prefix || pathname === `${prefix}/`) return "/";
  if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  return pathname;
}

export async function readPreviewApiTarget(prRoot: string): Promise<PreviewApiTarget | null> {
  try {
    const raw = await readFile(join(prRoot, PREVIEW_API_FILENAME), "utf8");
    const parsed = JSON.parse(raw) as Partial<PreviewApiTarget>;
    if (typeof parsed.port !== "number" || !Number.isInteger(parsed.port)) return null;
    if (parsed.port < 1 || parsed.port > 65535) return null;
    return {
      port: parsed.port,
      ...(typeof parsed.pid === "number" ? { pid: parsed.pid } : {}),
    };
  } catch {
    return null;
  }
}

export type PreviewRequest = {
  pr: string;
  rest: string;
};

export function isPreviewPrId(value: string): boolean {
  return PR_ID_RE.test(value);
}

export function previewBasePath(pr: string | number): string {
  return `${PREVIEW_PR_PREFIX}/${pr}/`;
}

export function parsePreviewPath(pathname: string): PreviewRequest | null {
  const match = pathname.match(PREVIEW_PATH_RE);
  if (!match) return null;
  return { pr: match[1], rest: decodeRest(match[2] ?? "") };
}

function decodeRest(rest: string): string {
  if (!rest) return "";
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

export function getPreviewRoot(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.PREVIEW_ROOT?.trim();
  if (fromEnv) return resolve(fromEnv);
  return join(homedir(), "previews");
}

/**
 * Resolve a preview file under `root/<pr>/...` with a hard path-traversal
 * guard. Returns null when the PR id is invalid or the resolved path would
 * escape the preview directory.
 */
export function resolvePreviewPath(
  root: string,
  pr: string,
  rest: string,
): string | null {
  if (!isPreviewPrId(pr)) return null;
  const prRoot = resolve(root, pr);
  const target = resolve(prRoot, rest);
  if (target !== prRoot && !target.startsWith(prRoot + sep)) return null;
  return target;
}

export function shouldSpaFallback(rest: string): boolean {
  if (!rest || rest.endsWith("/")) return true;
  if (rest.startsWith("assets/")) return false;
  if (rest === "api" || rest.startsWith("api/")) return false;
  return !ASSET_EXT_RE.test(rest);
}

export function mimeForPath(filePath: string): string {
  return MIME_BY_EXT[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Allow only http(s) URLs in preview chrome (blocks javascript: / data:). */
export function safeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function buildPreviewMeta(input: {
  pr: number;
  sha: string;
  builtAt?: string;
  htmlUrl?: string;
  siteUrl?: string;
}): PreviewMeta {
  return {
    v: 1,
    pr: input.pr,
    sha: input.sha,
    builtAt: input.builtAt ?? new Date().toISOString(),
    base: previewBasePath(input.pr),
    ...(input.htmlUrl ? { htmlUrl: input.htmlUrl } : {}),
    ...(input.siteUrl ? { siteUrl: input.siteUrl } : {}),
  };
}

const HEAD_MARK_START = "<!-- pr-preview-head -->";
const HEAD_MARK_END = "<!-- /pr-preview-head -->";
const BODY_MARK_START = "<!-- pr-preview-body -->";
const BODY_MARK_END = "<!-- /pr-preview-body -->";

function stripMarked(html: string, start: string, end: string): string {
  const from = html.indexOf(start);
  const to = html.indexOf(end);
  if (from === -1 || to === -1 || to < from) return html;
  return html.slice(0, from) + html.slice(to + end.length);
}

function previewChipInnerHtml(meta: PreviewMeta): string {
  const pr = String(meta.pr);
  const sha = escapeHtml(meta.sha.slice(0, 7));
  const htmlUrl = escapeHtml(
    safeHttpUrl(meta.htmlUrl) ??
      `https://github.com/anthonylim24/anthonyl.im/pull/${pr}`,
  );
  return [
    '<span style="width:6px;height:6px;border-radius:99px;background:#B8860B;flex:0 0 auto" aria-hidden="true"></span>',
    `<span><strong style="font-weight:600">PR #${pr} preview</strong>`,
    `<span style="color:#78716C"> · ${sha} · not production</span></span>`,
    `<a href="${htmlUrl}" rel="noopener noreferrer" style="color:#B8860B;font-weight:600;min-height:44px;min-width:44px;display:inline-flex;align-items:center;justify-content:center;text-decoration:underline">PR</a>`,
    '<button type="button" aria-label="Hide preview badge" style="min-height:44px;min-width:44px;border:0;background:transparent;color:#78716C;cursor:pointer;font:inherit">✕</button>',
  ].join("");
}

export function stampPreviewHtml(html: string, meta: PreviewMeta): string {
  const without = stripMarked(
    stripMarked(html, HEAD_MARK_START, HEAD_MARK_END),
    BODY_MARK_START,
    BODY_MARK_END,
  );
  const pr = String(meta.pr);
  const fullSha = escapeHtml(meta.sha);
  const builtAt = escapeHtml(meta.builtAt);
  const chipHtml = JSON.stringify(previewChipInnerHtml(meta));

  const headBlock = `${HEAD_MARK_START}
    <meta name="robots" content="noindex, nofollow" />
    <meta name="pr-preview" content="${pr}" />
    ${HEAD_MARK_END}`;

  const bodyBlock = `${BODY_MARK_START}
    <div id="pr-preview-root" data-pr-preview="${pr}" data-pr-sha="${fullSha}" data-pr-built="${builtAt}" hidden></div>
    <script>
      (function () {
        try {
          var params = new URLSearchParams(location.search);
          if (params.get("hidePreviewChrome") === "1") return;
          if (sessionStorage.getItem("hidePreviewChrome") === "1") return;
        } catch (e) {}
        var chip = document.createElement("aside");
        chip.setAttribute("aria-label", "Pull request preview");
        chip.setAttribute("role", "status");
        chip.style.cssText = [
          "position:fixed",
          "left:max(8px, env(safe-area-inset-left))",
          "bottom:max(8px, env(safe-area-inset-bottom))",
          "z-index:2147483646",
          "display:flex",
          "align-items:center",
          "gap:10px",
          "min-height:44px",
          "max-width:min(420px, calc(100vw - 16px))",
          "padding:8px 10px 8px 12px",
          "border-radius:10px",
          "border:1px solid rgba(28,25,23,0.12)",
          "background:#FFFEFA",
          "color:#1C1917",
          "font:500 12px/1.3 Inter, system-ui, sans-serif",
          "box-shadow:0 8px 24px rgba(28,25,23,0.12)",
          "overflow-wrap:anywhere"
        ].join(";");
        chip.innerHTML = ${chipHtml};
        var hide = chip.querySelector("button");
        if (hide) hide.addEventListener("click", function () {
          try { sessionStorage.setItem("hidePreviewChrome", "1"); } catch (e) {}
          chip.remove();
        });
        document.body.appendChild(chip);
      })();
    </script>
    ${BODY_MARK_END}`;

  let next = without;
  if (next.includes("</head>")) {
    next = next.replace("</head>", `${headBlock}\n  </head>`);
  } else {
    next = headBlock + next;
  }
  if (next.includes("</body>")) {
    next = next.replace("</body>", `${bodyBlock}\n  </body>`);
  } else {
    next += bodyBlock;
  }
  return next;
}

export async function writePreviewMeta(dir: string, meta: PreviewMeta): Promise<void> {
  await Bun.write(join(dir, META_FILENAME), JSON.stringify(meta, null, 2) + "\n");
}

export async function stampPreviewDist(dir: string, meta: PreviewMeta): Promise<void> {
  await writePreviewMeta(dir, meta);
  const indexPath = join(dir, "index.html");
  const file = Bun.file(indexPath);
  if (!(await file.exists())) {
    throw new Error(`stampPreviewDist: missing ${indexPath}`);
  }
  const stamped = stampPreviewHtml(await file.text(), meta);
  await Bun.write(indexPath, stamped);
}

export async function readPreviewMeta(dir: string): Promise<PreviewMeta | null> {
  try {
    const raw = await readFile(join(dir, META_FILENAME), "utf8");
    const parsed = JSON.parse(raw) as Partial<PreviewMeta>;
    if (typeof parsed.pr !== "number" || typeof parsed.sha !== "string") return null;
    if (typeof parsed.base !== "string" || typeof parsed.builtAt !== "string") return null;
    return {
      v: 1,
      pr: parsed.pr,
      sha: parsed.sha,
      builtAt: parsed.builtAt,
      base: parsed.base,
      ...(typeof parsed.htmlUrl === "string" ? { htmlUrl: parsed.htmlUrl } : {}),
      ...(typeof parsed.siteUrl === "string" ? { siteUrl: parsed.siteUrl } : {}),
    };
  } catch {
    return null;
  }
}

export async function listPreviewMetas(root: string): Promise<PreviewMeta[]> {
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const metas: PreviewMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === STAGING_DIR || !isPreviewPrId(entry.name)) {
      continue;
    }
    const meta = await readPreviewMeta(join(root, entry.name));
    if (meta) metas.push(meta);
  }
  metas.sort((a, b) => b.pr - a.pr);
  return metas;
}

function previewHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  };
}

function notFoundPage(pr?: string): string {
  const label = pr ? `PR #${escapeHtml(pr)}` : "this pull request";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex, nofollow" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Preview not published</title>
    <style>
      body { margin: 0; min-height: 100dvh; display: grid; place-items: center;
        background: #F5F2ED; color: #1C1917; font: 16px/1.5 Inter, system-ui, sans-serif; }
      main { max-width: 28rem; padding: 1.5rem; }
      h1 { font-family: "Cormorant Garamond", Georgia, serif; font-weight: 500;
        font-size: 2rem; margin: 0 0 0.5rem; }
      p { margin: 0; color: #78716C; }
    </style>
  </head>
  <body>
    <main>
      <h1>Preview not published</h1>
      <p>No remote preview is on disk for ${label}. Wait for the preview workflow, or this is an unknown PR number.</p>
    </main>
  </body>
</html>`;
}

function indexPage(metas: PreviewMeta[], siteUrl: string): string {
  const origin = (safeHttpUrl(siteUrl) ?? "https://anthonyl.im").replace(/\/+$/, "");
  const rows = metas
    .map((meta) => {
      const href = `${origin}${previewBasePath(meta.pr)}`;
      return `<li><a href="${escapeHtml(href)}">PR #${meta.pr}</a>
        <span> · ${escapeHtml(meta.sha.slice(0, 7))} · ${escapeHtml(meta.builtAt)}</span></li>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex, nofollow" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PR previews</title>
    <style>
      body { margin: 0; background: #F5F2ED; color: #1C1917;
        font: 16px/1.5 Inter, system-ui, sans-serif; }
      main { max-width: 40rem; margin: 0 auto; padding: 2.5rem 1.25rem; }
      h1 { font-family: "Cormorant Garamond", Georgia, serif; font-weight: 500;
        font-size: 2.25rem; margin: 0 0 0.75rem; }
      p, span { color: #78716C; }
      a { color: #B8860B; }
      ul { padding: 0; list-style: none; display: grid; gap: 0.75rem; }
      li { background: #FFFEFA; border: 1px solid rgba(28,25,23,0.08);
        border-radius: 0.5rem; padding: 0.9rem 1rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>PR previews</h1>
      <p>Remote frontend builds for open pull requests. Korea and Trips still require a Clerk session.</p>
      ${metas.length === 0 ? "<p>No previews published.</p>" : `<ul>${rows}</ul>`}
    </main>
  </body>
</html>`;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

async function servePreviewFile(c: Context, root: string, siteUrl: string) {
  const pathname = new URL(c.req.url).pathname;
  const parsed = parsePreviewPath(pathname);
  if (!parsed) {
    return c.html(notFoundPage(), 404);
  }

  const prRoot = resolvePreviewPath(root, parsed.pr, "");
  if (!prRoot) {
    return c.html(notFoundPage(parsed.pr), 404);
  }

  if (!(await fileExists(join(prRoot, "index.html")))) {
    return c.html(notFoundPage(parsed.pr), 404);
  }

  const rest = parsed.rest.replace(/\/+$/, "");
  const target = resolvePreviewPath(root, parsed.pr, rest);
  if (!target) {
    return c.json({ error: "invalid_path" }, 400);
  }

  let filePath = target;
  if (rest === "" || !(await fileExists(filePath))) {
    if (!shouldSpaFallback(parsed.rest)) {
      return c.json({ error: "not_found" }, 404);
    }
    filePath = join(prRoot, "index.html");
  }

  const isHtml = extname(filePath).toLowerCase() === ".html";
  const cacheControl = isHtml
    ? "no-cache, no-store, must-revalidate"
    : parsed.rest.startsWith("assets/")
      ? "public, max-age=31536000, immutable"
      : "no-cache";

  const headers = previewHeaders({
    "Cache-Control": cacheControl,
    "Content-Type": mimeForPath(filePath),
    "X-Preview-PR": parsed.pr,
  });

  if (isHtml) {
    let html = await Bun.file(filePath).text();
    if (!html.includes("data-pr-preview=")) {
      const meta =
        (await readPreviewMeta(prRoot)) ??
        buildPreviewMeta({
          pr: Number(parsed.pr),
          sha: "unknown",
          siteUrl,
        });
      html = stampPreviewHtml(html, meta);
    }
    for (const [key, value] of Object.entries(headers)) {
      c.header(key, value);
    }
    return c.html(html);
  }

  return new Response(Bun.file(filePath).stream(), { headers });
}

async function proxyPreviewApi(
  c: Context,
  root: string,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const pr = c.req.param("pr");
  if (!isPreviewPrId(pr)) {
    return c.json({ error: "invalid_pr" }, 400);
  }
  const prRoot = resolvePreviewPath(root, pr, "");
  if (!prRoot) return c.json({ error: "invalid_pr" }, 400);

  const target = await readPreviewApiTarget(prRoot);
  if (!target) {
    return c.json({ error: "preview_api_not_published" }, 404);
  }

  const url = new URL(c.req.url);
  const upstreamPath = previewApiUpstreamPath(pr, url.pathname);
  const upstream = `http://127.0.0.1:${target.port}${upstreamPath}${url.search}`;

  const headers = new Headers(c.req.raw.headers);
  headers.delete("host");
  headers.delete("content-length");

  const method = c.req.method;
  const init: RequestInit = {
    method,
    headers,
    signal: c.req.raw.signal,
    redirect: "manual",
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = c.req.raw.body;
    Object.assign(init, { duplex: "half" });
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetchImpl(upstream, init);
  } catch (err) {
    console.error(`[preview-api] proxy ${pr} → :${target.port} failed:`, err);
    return c.json({ error: "preview_api_unreachable" }, 502);
  }

  const out = new Headers(upstreamRes.headers);
  out.set(PREVIEW_API_HEADER, "1");
  out.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(upstreamRes.body, { status: upstreamRes.status, headers: out });
}

export function createPreviewRouter(opts: {
  root: string;
  siteUrl?: string;
  fetchImpl?: typeof fetch;
}): Hono {
  const siteUrl = (opts.siteUrl ?? "https://anthonyl.im").replace(/\/+$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const app = new Hono();

  const listing = async (c: Context) => {
    const metas = await listPreviewMetas(opts.root);
    for (const [key, value] of Object.entries(
      previewHeaders({ "Cache-Control": "no-cache, no-store, must-revalidate" }),
    )) {
      c.header(key, value);
    }
    return c.html(indexPage(metas, siteUrl));
  };

  app.get("/preview", listing);
  app.get("/preview/", listing);

  app.all("/preview/pr/:pr/api", (c) => proxyPreviewApi(c, opts.root, fetchImpl));
  app.all("/preview/pr/:pr/api/*", (c) => proxyPreviewApi(c, opts.root, fetchImpl));

  app.get("/preview/pr/:pr", (c) => {
    const pr = c.req.param("pr");
    if (!isPreviewPrId(pr)) return c.html(notFoundPage(pr), 404);
    const pathname = new URL(c.req.url).pathname;
    if (!pathname.endsWith("/")) {
      return c.redirect(`${PREVIEW_PR_PREFIX}/${pr}/`, 308);
    }
    return servePreviewFile(c, opts.root, siteUrl);
  });

  app.get("/preview/pr/:pr/", (c) => servePreviewFile(c, opts.root, siteUrl));
  app.get("/preview/pr/:pr/*", (c) => servePreviewFile(c, opts.root, siteUrl));

  app.all("/preview/*", (c) => {
    for (const [key, value] of Object.entries(previewHeaders())) {
      c.header(key, value);
    }
    return c.json({ error: "not_found" }, 404);
  });

  return app;
}

export function previewSiteUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.SITE_URL || "https://anthonyl.im").replace(/\/+$/, "");
}

function shaMatches(actual: string, expected: string): boolean {
  const a = actual.toLowerCase();
  const b = expected.toLowerCase();
  return a === b || a.startsWith(b) || b.startsWith(a);
}

/** Poll `/preview/pr/:n/preview.json` until it exists (and optionally matches SHA). */
export async function waitForPreview(opts: {
  pr: number;
  sha?: string;
  timeoutMs?: number;
  intervalMs?: number;
  siteUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): Promise<PreviewMeta> {
  const siteUrl = (opts.siteUrl ?? previewSiteUrl()).replace(/\/+$/, "");
  const url = `${siteUrl}${previewBasePath(opts.pr)}preview.json`;
  const timeoutMs = opts.timeoutMs ?? 720_000;
  const intervalMs = opts.intervalMs ?? 3_000;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const deadline = Date.now() + timeoutMs;
  let lastError = "not fetched";

  while (Date.now() <= deadline) {
    try {
      const res = await fetchImpl(url, { cache: "no-store" });
      if (res.ok) {
        const meta = (await res.json()) as PreviewMeta;
        if (typeof meta.pr !== "number" || typeof meta.sha !== "string") {
          lastError = "invalid preview.json";
        } else if (opts.sha && !shaMatches(meta.sha, opts.sha)) {
          lastError = `sha mismatch: got ${meta.sha}, want ${opts.sha}`;
        } else {
          return meta;
        }
      } else {
        lastError = `HTTP ${res.status}`;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (Date.now() + intervalMs > deadline) break;
    await sleep(intervalMs);
  }

  throw new Error(
    `preview not ready for PR ${opts.pr} (${lastError}). ` +
      `Poll ${url}. A 404 HTML page titled "Preview not published" means ` +
      `production Hono cannot see $PREVIEW_ROOT/${opts.pr}/index.html ` +
      `(closed PRs are deleted; open PRs must match PREVIEW_ROOT on the droplet).`,
  );
}
