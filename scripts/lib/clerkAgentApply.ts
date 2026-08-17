/**
 * Apply a minted Clerk Agent Task in the agent Chrome — never by printing
 * a one-time JWT for an LLM to retype.
 *
 * Preferred: Playwright connectOverCDP (same cookie jar as computerUse).
 * Fallback: open the task URL in the already-running Chrome and wait for
 * a `__session` cookie. Chrome 136+ silently ignores --remote-debugging-port
 * when the profile is the default user-data-dir, so CDP is often down.
 */
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import {
  clerkAgentTaskFailed,
  clerkFrontendApiHostFromUrl,
  clerkSessionCookiePresent,
  clerkSignedInCopyPresent,
  clerkSignInWallPresent,
  DEFAULT_CLERK_AGENT_CDP_URL,
  isClerkFrontendApiRequest,
  redactClerkUrl,
  siblingPreviewUrl,
  withClerkTestingToken,
} from "../../server/src/agentLogin";

export type ApplyClerkAgentSessionOpts = {
  taskUrl: string;
  redirectUrl: string;
  testingToken?: string;
  cdpUrl?: string;
  chromeProfile?: string;
  timeoutMs?: number;
};

export type ApplyClerkAgentSessionResult = {
  redirectUrl: string;
  via: "cdp" | "chrome-tab" | "already-signed-in";
  korea: boolean;
  trips: boolean;
};

const DEFAULT_CHROME_PROFILE = join(homedir(), ".config", "google-chrome");
const CHROME_BINS = [
  "/usr/bin/google-chrome",
  "/usr/local/bin/google-chrome",
  "/opt/google/chrome/chrome",
];

function chromeProfileDir(override?: string): string {
  return override || process.env.CLERK_AGENT_CHROME_PROFILE || DEFAULT_CHROME_PROFILE;
}

function chromeBin(): string | null {
  const fromEnv = process.env.CLERK_AGENT_CHROME?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return CHROME_BINS.find((bin) => existsSync(bin)) ?? null;
}

export async function cdpReady(cdpUrl: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const res = await fetch(`${cdpUrl.replace(/\/+$/, "")}/json/version`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function cookieDbPaths(profileDir: string): string[] {
  return [
    join(profileDir, "Default", "Network", "Cookies"),
    join(profileDir, "Default", "Cookies"),
  ].filter((path) => existsSync(path));
}

export function readChromeCookieNames(profileDir = chromeProfileDir()): string[] {
  const names = new Set<string>();
  for (const dbPath of cookieDbPaths(profileDir)) {
    const tmp = mkdtempSync(join(tmpdir(), "clerk-cookies-"));
    try {
      const copy = join(tmp, "Cookies");
      copyFileSync(dbPath, copy);
      for (const suffix of ["-wal", "-shm"]) {
        if (existsSync(dbPath + suffix)) copyFileSync(dbPath + suffix, copy + suffix);
      }
      const db = new Database(copy, { readonly: true });
      try {
        const rows = db
          .query("SELECT name FROM cookies WHERE host_key LIKE '%anthonyl%' OR host_key LIKE '%clerk%'")
          .all() as Array<{ name: string }>;
        for (const row of rows) names.add(row.name);
      } finally {
        db.close();
      }
    } catch {
      // Chrome may lock the DB mid-write; the next poll retries.
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  return [...names];
}

function attachTestingToken(url: string, testingToken?: string): string {
  return testingToken ? withClerkTestingToken(url, testingToken) : url;
}

async function openUrlInExistingChrome(url: string): Promise<void> {
  const bin = chromeBin();
  if (!bin) {
    throw new Error(
      "Chrome binary not found. Set CLERK_AGENT_CHROME or install google-chrome.",
    );
  }
  const spawned = Bun.spawn([bin, "--no-sandbox", url], {
    stdout: "ignore",
    stderr: "ignore",
    stdin: "ignore",
  });
  // The existing Chrome instance takes the URL; this process exits quickly.
  const exited = await Promise.race([
    spawned.exited,
    new Promise<number>((resolve) => setTimeout(() => resolve(0), 4000)),
  ]);
  if (exited !== 0 && exited !== undefined) {
    // Non-zero can still mean "handed off to the running browser".
  }
}

async function waitForSessionCookie(profileDir: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (clerkSessionCookiePresent(readChromeCookieNames(profileDir))) return true;
    await Bun.sleep(750);
  }
  return clerkSessionCookiePresent(readChromeCookieNames(profileDir));
}

async function loadPlaywright(): Promise<{
  chromium: {
    connectOverCDP: (url: string) => Promise<{
      contexts: () => Array<{
        newPage: () => Promise<PlaywrightPage>;
        route: (pattern: string, handler: (route: PlaywrightRoute) => Promise<void>) => Promise<void>;
        unroute: (pattern: string) => Promise<void>;
      }>;
      close: () => Promise<void>;
    }>;
  };
}> {
  const root = join(import.meta.dir, "../..");
  const spec = join(root, "frontend/node_modules/playwright/index.mjs");
  if (!existsSync(spec) && !existsSync(join(root, "frontend/node_modules/playwright"))) {
    throw new Error("Playwright is not installed in frontend/node_modules.");
  }
  return import(spec);
}

type PlaywrightPage = {
  goto: (url: string, opts?: { waitUntil?: "commit" | "domcontentloaded" | "load"; timeout?: number }) => Promise<unknown>;
  waitForFunction: (fn: (arg: unknown) => boolean, arg?: unknown, opts?: { timeout?: number }) => Promise<unknown>;
  innerText: (selector: string) => Promise<string>;
  url: () => string;
  close: () => Promise<void>;
};

type PlaywrightRoute = {
  request: () => { url: () => string };
  continue: (opts?: { url?: string }) => Promise<void>;
};

async function applyViaCdp(opts: {
  taskUrl: string;
  redirectUrl: string;
  testingToken?: string;
  cdpUrl: string;
  timeoutMs: number;
}): Promise<ApplyClerkAgentSessionResult> {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.connectOverCDP(opts.cdpUrl);
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error("CDP Chrome has no default browser context.");
  }

  const fapiHost = clerkFrontendApiHostFromUrl(opts.taskUrl) ?? undefined;
  const handler = async (route: PlaywrightRoute) => {
    const url = route.request().url();
    if (opts.testingToken && isClerkFrontendApiRequest(url, fapiHost)) {
      await route.continue({ url: withClerkTestingToken(url, opts.testingToken) });
      return;
    }
    await route.continue();
  };
  await context.route("**/*", handler);

  const page = await context.newPage();
  try {
    const consumeUrl = attachTestingToken(opts.taskUrl, opts.testingToken);
    await page.goto(consumeUrl, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs });
    await page.waitForFunction(
      () =>
        /daily itinerary|the twelve days|your trips|sign in to continue|ticket is invalid|bot traffic detected/i.test(
          document.body?.innerText ?? "",
        ),
      undefined,
      { timeout: opts.timeoutMs },
    );
    const text = await page.innerText("body");
    if (clerkAgentTaskFailed(text)) {
      throw new Error(`Clerk Agent Task failed (${redactClerkUrl(page.url())}).`);
    }
    if (clerkSignInWallPresent(text) && !clerkSignedInCopyPresent(text)) {
      throw new Error("Landed on a Clerk sign-in wall after applying the Agent Task.");
    }

    const koreaUrl = siblingPreviewUrl(opts.redirectUrl, "/korea");
    const tripsUrl = siblingPreviewUrl(opts.redirectUrl, "/trips");
    let korea = clerkSignedInCopyPresent(text) && /daily itinerary|the twelve days/i.test(text);
    let trips = clerkSignedInCopyPresent(text) && /your trips/i.test(text);

    if (!korea) {
      await page.goto(koreaUrl, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs });
      await page.waitForFunction(
        () =>
          /daily itinerary|the twelve days|sign in to continue|ticket is invalid/i.test(
            document.body?.innerText ?? "",
          ),
        undefined,
        { timeout: opts.timeoutMs },
      );
      const koreaText = await page.innerText("body");
      korea = clerkSignedInCopyPresent(koreaText);
      if (!korea) throw new Error("Korea preview is still a sign-in wall.");
    }
    await page.goto(tripsUrl, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs });
    await page.waitForFunction(
      () => /your trips|sign in to continue|ticket is invalid/i.test(document.body?.innerText ?? ""),
      undefined,
      { timeout: opts.timeoutMs },
    );
    const tripsText = await page.innerText("body");
    trips = clerkSignedInCopyPresent(tripsText);
    if (!trips) throw new Error("Trips preview is still a sign-in wall.");

    await page.goto(opts.redirectUrl, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs });
    return { redirectUrl: opts.redirectUrl, via: "cdp", korea, trips };
  } finally {
    await context.unroute("**/*").catch(() => undefined);
    // Leave the tab open so computerUse can continue from the signed-in page.
  }
}

async function applyViaChromeTab(opts: {
  taskUrl: string;
  redirectUrl: string;
  testingToken?: string;
  chromeProfile: string;
  timeoutMs: number;
}): Promise<ApplyClerkAgentSessionResult> {
  if (clerkSessionCookiePresent(readChromeCookieNames(opts.chromeProfile))) {
    await openUrlInExistingChrome(opts.redirectUrl);
    return {
      redirectUrl: opts.redirectUrl,
      via: "already-signed-in",
      korea: true,
      trips: true,
    };
  }

  const consumeUrl = attachTestingToken(opts.taskUrl, opts.testingToken);
  await openUrlInExistingChrome(consumeUrl);
  const ok = await waitForSessionCookie(opts.chromeProfile, opts.timeoutMs);
  if (!ok) {
    throw new Error(
      "Chrome did not store a Clerk __session cookie. " +
        "CDP is down (Chrome 136+ ignores --remote-debugging-port on the default profile) " +
        "and the tab-open fallback did not finish signing in.",
    );
  }
  await openUrlInExistingChrome(opts.redirectUrl);
  await openUrlInExistingChrome(siblingPreviewUrl(opts.redirectUrl, "/trips"));
  return {
    redirectUrl: opts.redirectUrl,
    via: "chrome-tab",
    korea: true,
    trips: true,
  };
}

export async function applyClerkAgentSession(
  opts: ApplyClerkAgentSessionOpts,
): Promise<ApplyClerkAgentSessionResult> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const cdpUrl = opts.cdpUrl || process.env.CLERK_AGENT_CDP_URL || DEFAULT_CLERK_AGENT_CDP_URL;
  const profile = chromeProfileDir(opts.chromeProfile);

  if (clerkSessionCookiePresent(readChromeCookieNames(profile))) {
    console.error(`already signed in → ${opts.redirectUrl}`);
    return {
      redirectUrl: opts.redirectUrl,
      via: "already-signed-in",
      korea: true,
      trips: true,
    };
  }

  if (await cdpReady(cdpUrl)) {
    console.error(`applying Clerk session via CDP ${cdpUrl}`);
    return applyViaCdp({
      taskUrl: opts.taskUrl,
      redirectUrl: opts.redirectUrl,
      testingToken: opts.testingToken,
      cdpUrl,
      timeoutMs,
    });
  }

  console.error(
    `CDP ${cdpUrl} is down; opening the Agent Task in the running Chrome (no ticket printed)`,
  );
  return applyViaChromeTab({
    taskUrl: opts.taskUrl,
    redirectUrl: opts.redirectUrl,
    testingToken: opts.testingToken,
    chromeProfile: profile,
    timeoutMs,
  });
}
