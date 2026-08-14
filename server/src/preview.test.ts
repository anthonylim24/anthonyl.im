import { afterEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildPreviewMeta,
  createPreviewRouter,
  getPreviewRoot,
  isPreviewPrId,
  parsePreviewPath,
  previewApiUpstreamPath,
  previewBasePath,
  resolvePreviewPath,
  shouldSpaFallback,
  stampPreviewDist,
  stampPreviewHtml,
  waitForPreview,
  safeHttpUrl,
} from "./preview";

const temps: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "preview-"));
  temps.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("parsePreviewPath", () => {
  test("parses the preview root, nested SPA paths, and assets", () => {
    expect(parsePreviewPath("/preview/pr/12")).toEqual({ pr: "12", rest: "" });
    expect(parsePreviewPath("/preview/pr/12/")).toEqual({ pr: "12", rest: "" });
    expect(parsePreviewPath("/preview/pr/12/korea")).toEqual({ pr: "12", rest: "korea" });
    expect(parsePreviewPath("/preview/pr/12/assets/index-a.js")).toEqual({
      pr: "12",
      rest: "assets/index-a.js",
    });
  });

  test("rejects non-preview paths and oversized PR ids", () => {
    expect(parsePreviewPath("/korea")).toBeNull();
    expect(parsePreviewPath("/preview/pr/")).toBeNull();
    expect(parsePreviewPath("/preview/pr/abc/")).toBeNull();
    expect(parsePreviewPath("/preview/pr/12345678901/")).toBeNull();
  });
});

describe("resolvePreviewPath", () => {
  test("blocks path traversal including encoded dots", () => {
    const root = "/var/previews";
    expect(resolvePreviewPath(root, "12", "../../.env")).toBeNull();
    expect(resolvePreviewPath(root, "../12", "index.html")).toBeNull();
    expect(resolvePreviewPath(root, "12", "assets/app.js")).toBe(
      join(root, "12", "assets/app.js"),
    );
  });

  test("rejects non-numeric PR ids", () => {
    expect(isPreviewPrId("")).toBe(false);
    expect(isPreviewPrId("-1")).toBe(false);
    expect(isPreviewPrId("12b")).toBe(false);
    expect(isPreviewPrId("12")).toBe(true);
  });
});

describe("shouldSpaFallback", () => {
  test("falls back for app routes but not missing hashed assets", () => {
    expect(shouldSpaFallback("")).toBe(true);
    expect(shouldSpaFallback("korea")).toBe(true);
    expect(shouldSpaFallback("trips/abc/day/1")).toBe(true);
    expect(shouldSpaFallback("assets/index-hash.js")).toBe(false);
    expect(shouldSpaFallback("favicon-chat.svg")).toBe(false);
    expect(shouldSpaFallback("preview.json")).toBe(false);
    expect(shouldSpaFallback("api/korea/chat")).toBe(false);
    expect(shouldSpaFallback("api")).toBe(false);
  });
});

describe("stampPreviewHtml", () => {
  test("injects noindex + chip and is idempotent", () => {
    const meta = buildPreviewMeta({
      pr: 9,
      sha: "abcdef123456",
      htmlUrl: "https://github.com/anthonylim24/anthonyl.im/pull/9",
    });
    const once = stampPreviewHtml(
      "<html><head><title>x</title></head><body><div id=\"root\"></div></body></html>",
      meta,
    );
    expect(once).toContain('name="robots" content="noindex, nofollow"');
    expect(once).toContain('data-pr-preview="9"');
    expect(once).toContain("PR #9 preview");
    expect(once).toContain("hidePreviewChrome");
    expect(once).toContain("min-height:44px");

    const twice = stampPreviewHtml(once, meta);
    expect(twice.split("data-pr-preview=").length).toBe(2);
    expect(twice.split("<!-- pr-preview-head -->").length).toBe(2);
  });

  test("escapes untrusted PR metadata before embedding", () => {
    const stamped = stampPreviewHtml("<html><head></head><body></body></html>", {
      v: 1,
      pr: 1,
      sha: "<script>alert(1)</script>",
      builtAt: "2026-01-01T00:00:00.000Z",
      base: "/preview/pr/1/",
      htmlUrl: "https://example.com/?q=\"><script>alert(1)</script>",
    });
    expect(stamped).not.toContain("<script>alert(1)</script>");
    expect(stamped).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  test("drops javascript: preview links", () => {
    const stamped = stampPreviewHtml("<html><head></head><body></body></html>", {
      v: 1,
      pr: 1,
      sha: "abc",
      builtAt: "2026-01-01T00:00:00.000Z",
      base: "/preview/pr/1/",
      htmlUrl: "javascript:alert(document.cookie)",
    });
    expect(stamped).not.toContain("javascript:");
    expect(stamped).toContain("https://github.com/anthonylim24/anthonyl.im/pull/1");
  });
});

describe("createPreviewRouter", () => {
  async function seededApp() {
    const root = await tempDir();
    const prDir = join(root, "42");
    await mkdir(join(prDir, "assets"), { recursive: true });
    await writeFile(
      join(prDir, "index.html"),
      "<html><head><title>PR</title></head><body><div id=\"root\"></div></body></html>",
    );
    await writeFile(join(prDir, "assets", "app.js"), "console.log('ok')");
    await stampPreviewDist(
      prDir,
      buildPreviewMeta({ pr: 42, sha: "deadbeefcafebabe", siteUrl: "https://anthonyl.im" }),
    );

    const app = new Hono();
    app.route("/", createPreviewRouter({ root, siteUrl: "https://anthonyl.im" }));
    app.get("*", (c) => c.text("PRODUCTION_SPA"));
    return { app, root };
  }

  test("serves stamped HTML, SPA fallback, and hashed assets", async () => {
    const { app } = await seededApp();

    const html = await app.request("https://anthonyl.im/preview/pr/42/");
    expect(html.status).toBe(200);
    expect(html.headers.get("content-type")).toMatch(/text\/html/);
    expect(html.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(html.headers.get("x-preview-pr")).toBe("42");
    const body = await html.text();
    expect(body).toContain('id="root"');
    expect(body).toContain('data-pr-preview="42"');
    expect(body).not.toContain("PRODUCTION_SPA");

    const spa = await app.request("https://anthonyl.im/preview/pr/42/korea");
    expect(spa.status).toBe(200);
    expect(await spa.text()).toContain('data-pr-preview="42"');

    const nested = await app.request("https://anthonyl.im/preview/pr/42/trips/abc/day/1");
    expect(nested.status).toBe(200);
    expect(await nested.text()).toContain('id="root"');

    const healthApp = new Hono();
    healthApp.route("/", createPreviewRouter({ root: (await seededApp()).root }));
    healthApp.get("/health", (c) => c.json({ status: "ok" }));
    const health = await healthApp.request("https://anthonyl.im/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });

    const asset = await app.request("https://anthonyl.im/preview/pr/42/assets/app.js");
    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toContain("immutable");
    expect(await asset.text()).toBe("console.log('ok')");
  });

  test("does not fall through to production SPA for missing previews or assets", async () => {
    const { app } = await seededApp();

    const missingPr = await app.request("https://anthonyl.im/preview/pr/99/");
    expect(missingPr.status).toBe(404);
    const missingBody = await missingPr.text();
    expect(missingBody).toContain("Preview not published");
    expect(missingBody).not.toContain("PRODUCTION_SPA");

    const missingAsset = await app.request(
      "https://anthonyl.im/preview/pr/42/assets/missing.js",
    );
    expect(missingAsset.status).toBe(404);
    expect(await missingAsset.json()).toEqual({ error: "not_found" });

    // Browsers normalize `/preview/pr/42/../../.env` before the request is
    // sent. The dangerous case is a single path segment that still contains
    // `..` after decoding.
    const encoded = await app.request(
      "https://anthonyl.im/preview/pr/42/" + encodeURIComponent("../../.env"),
    );
    expect(encoded.status).not.toBe(200);
    expect(await encoded.text()).not.toContain("PRODUCTION_SPA");
  });

  test("redirects the unslashed PR URL and lists published previews", async () => {
    const { app } = await seededApp();

    const redirect = await app.request("https://anthonyl.im/preview/pr/42");
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get("location")).toBe("/preview/pr/42/");

    const index = await app.request("https://anthonyl.im/preview/");
    expect(index.status).toBe(200);
    const listing = await index.text();
    expect(listing).toContain("PR #42");
    expect(listing).toContain("deadbee");
  });

  test("serves preview.json for agent polling", async () => {
    const { app } = await seededApp();
    const res = await app.request("https://anthonyl.im/preview/pr/42/preview.json");
    expect(res.status).toBe(200);
    const meta = await res.json();
    expect(meta.pr).toBe(42);
    expect(meta.sha).toBe("deadbeefcafebabe");
    expect(meta.base).toBe(previewBasePath(42));
  });

  test("proxies /preview/pr/:n/api/* to the loopback preview API", async () => {
    const { app, root } = await seededApp();
    await writeFile(join(root, "42", "api.json"), JSON.stringify({ port: 4123, pid: 99 }));

    let capturedUrl = "";
    let capturedMethod = "";
    const fetchImpl: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedMethod = String(init?.method ?? "GET");
      return new Response(JSON.stringify({ from: "preview-api" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const proxied = new Hono();
    proxied.route("/", createPreviewRouter({ root, siteUrl: "https://anthonyl.im", fetchImpl }));

    const res = await proxied.request("https://anthonyl.im/preview/pr/42/api/korea/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hi" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-preview-api")).toBe("1");
    expect(await res.json()).toEqual({ from: "preview-api" });
    expect(capturedUrl).toBe("http://127.0.0.1:4123/api/korea/chat");
    expect(capturedMethod).toBe("POST");
  });

  test("404s JSON when the preview API is not published", async () => {
    const { app } = await seededApp();
    const res = await app.request("https://anthonyl.im/preview/pr/42/api/korea/chat", {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "preview_api_not_published" });
  });
});

describe("previewApiUpstreamPath", () => {
  test("strips the preview mount so the sidecar sees /api/...", () => {
    expect(previewApiUpstreamPath("42", "/preview/pr/42/api/korea/chat")).toBe("/api/korea/chat");
    expect(previewApiUpstreamPath("42", "/preview/pr/42/api/trips/x/chat")).toBe(
      "/api/trips/x/chat",
    );
  });
});

describe("stampFromArgs", () => {
  test("writes preview.json and stamps index.html", async () => {
    const { stampFromArgs } = await import("./previewStamp");
    const dir = await tempDir();
    await writeFile(
      join(dir, "index.html"),
      "<html><head></head><body><div id=\"root\"></div></body></html>",
    );
    await stampFromArgs([
      "--dir",
      dir,
      "--pr",
      "88",
      "--sha",
      "cafebabedead",
      "--html-url",
      "https://github.com/anthonylim24/anthonyl.im/pull/88",
    ]);
    const meta = JSON.parse(await Bun.file(join(dir, "preview.json")).text());
    expect(meta.pr).toBe(88);
    expect(meta.sha).toBe("cafebabedead");
    const html = await Bun.file(join(dir, "index.html")).text();
    expect(html).toContain('data-pr-preview="88"');
  });
});

describe("publish-preview.sh", () => {
  test("atomically publishes, then removes, a preview tree", async () => {
    const root = await tempDir();
    const dist = await tempDir();
    await writeFile(join(dist, "index.html"), '<html><body><div id="root"></div></body></html>');
    await writeFile(
      join(dist, "preview.json"),
      JSON.stringify(buildPreviewMeta({ pr: 1, sha: "abc" })) + "\n",
    );
    const tarball = join(root, "p.tar.gz");
    const pack = Bun.spawnSync(["tar", "-C", dist, "-czf", tarball, "."]);
    expect(pack.exitCode).toBe(0);

    const script = join(import.meta.dir, "../../deploy/publish-preview.sh");
    const publish = Bun.spawnSync(["bash", script, "publish", "1", tarball], {
      env: { ...process.env, PREVIEW_ROOT: root },
    });
    expect(publish.exitCode).toBe(0);
    expect(await Bun.file(join(root, "1", "index.html")).exists()).toBe(true);
    expect(await Bun.file(join(root, "1", "preview.json")).exists()).toBe(true);

    const remove = Bun.spawnSync(["bash", script, "remove", "1"], {
      env: { ...process.env, PREVIEW_ROOT: root },
    });
    expect(remove.exitCode).toBe(0);
    expect(await Bun.file(join(root, "1", "index.html")).exists()).toBe(false);
  });

  test("rejects path-like PR ids", async () => {
    const script = join(import.meta.dir, "../../deploy/publish-preview.sh");
    const result = Bun.spawnSync(["bash", script, "remove", "../etc"], {
      env: { ...process.env, PREVIEW_ROOT: await tempDir() },
    });
    expect(result.exitCode).not.toBe(0);
  });

  test("rejects tarballs that traverse out of the extract directory", async () => {
    const root = await tempDir();
    const evil = await tempDir();
    await writeFile(join(evil, "pwned"), "nope");
    const tarball = join(root, "evil.tar.gz");
    const pack = Bun.spawnSync(
      ["tar", "-C", evil, "-czf", tarball, "--transform=s,^,../,", "pwned"],
    );
    expect(pack.exitCode).toBe(0);

    const script = join(import.meta.dir, "../../deploy/publish-preview.sh");
    const publish = Bun.spawnSync(["bash", script, "publish", "1", tarball], {
      env: { ...process.env, PREVIEW_ROOT: root },
    });
    expect(publish.exitCode).not.toBe(0);
    expect(publish.stderr.toString()).toContain("unsafe tar member");
    expect(await Bun.file(join(root, "pwned")).exists()).toBe(false);
  });

  test("prune ignores .incoming and only counts numeric PR trees", async () => {
    const root = await tempDir();
    const incoming = join(root, ".incoming", "99");
    await mkdir(incoming, { recursive: true });
    await writeFile(join(incoming, "keep"), "yes");

    for (const pr of ["1", "2", "3"]) {
      const dir = join(root, pr);
      await mkdir(dir);
      await writeFile(join(dir, "index.html"), "x");
    }
    // Make PR 1 the oldest so the cap drops it.
    Bun.spawnSync(["touch", "-d", "2020-01-01T00:00:00Z", join(root, "1")]);
    Bun.spawnSync(["touch", "-d", "2021-01-01T00:00:00Z", join(root, "2")]);
    Bun.spawnSync(["touch", "-d", "2022-01-01T00:00:00Z", join(root, "3")]);

    const script = join(import.meta.dir, "../../deploy/publish-preview.sh");
    const prune = Bun.spawnSync(["bash", script, "prune"], {
      env: {
        ...process.env,
        PREVIEW_ROOT: root,
        PREVIEW_MAX_COUNT: "2",
        PREVIEW_MAX_AGE_DAYS: "9999",
      },
    });
    expect(prune.exitCode).toBe(0);
    expect(await Bun.file(join(incoming, "keep")).exists()).toBe(true);
    expect(await Bun.file(join(root, "1", "index.html")).exists()).toBe(false);
    expect(await Bun.file(join(root, "2", "index.html")).exists()).toBe(true);
    expect(await Bun.file(join(root, "3", "index.html")).exists()).toBe(true);
  });
});

describe("waitForPreview", () => {
  test("returns once preview.json matches the expected SHA", async () => {
    const meta = buildPreviewMeta({ pr: 7, sha: "abc1234deadbeef" });
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      if (calls < 2) return new Response("missing", { status: 404 });
      return Response.json(meta);
    };
    const result = await waitForPreview({
      pr: 7,
      sha: "abc1234",
      timeoutMs: 1_000,
      intervalMs: 1,
      fetchImpl,
      sleep: async () => undefined,
    });
    expect(result.sha).toBe("abc1234deadbeef");
    expect(calls).toBe(2);
  });

  test("times out on SHA mismatch", async () => {
    const fetchImpl: typeof fetch = async () =>
      Response.json(buildPreviewMeta({ pr: 7, sha: "ffff" }));
    await expect(
      waitForPreview({
        pr: 7,
        sha: "abc",
        timeoutMs: 5,
        intervalMs: 10,
        fetchImpl,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow(/sha mismatch/);
  });
});

describe("safeHttpUrl", () => {
  test("allows http(s) and rejects other schemes", () => {
    expect(safeHttpUrl("https://anthonyl.im/preview/")).toBe("https://anthonyl.im/preview/");
    expect(safeHttpUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeHttpUrl("data:text/html,x")).toBeUndefined();
  });
});

describe("getPreviewRoot", () => {
  test("prefers PREVIEW_ROOT and otherwise uses ~/previews", () => {
    expect(getPreviewRoot({ PREVIEW_ROOT: "/tmp/previews" })).toBe("/tmp/previews");
    expect(getPreviewRoot({ PREVIEW_ROOT: "  /var/p  " }).endsWith("/var/p")).toBe(true);
    expect(getPreviewRoot({}).endsWith("/previews")).toBe(true);
  });
});
