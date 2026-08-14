#!/usr/bin/env bun
/**
 * Mint a Clerk Agent Task URL so a browser (Chrome MCP, Playwright) can
 * sign in without the interactive Clerk modal.
 *
 *   bun scripts/clerk-agent-login.ts --pr 123 --path /korea
 *   bun scripts/clerk-agent-login.ts --pr 123 --path /trips
 *
 * When this checkout is not `origin/main`, the helper re-execs from a
 * fetched main worktree before sending CLERK_SECRET_KEY / AGENT_LOGIN_SECRET
 * / `gh auth token`. Override with CLERK_AGENT_LOGIN_TRUSTED=1 or
 * `--skip-main-check` (tests / already-trusted trees only).
 *
 * Prints the one-time Clerk URL on stdout. Navigate the agent browser there;
 * Clerk sets a session cookie and redirects to the preview page.
 *
 * Auth (first match):
 *   1. CLERK_SECRET_KEY + screenshot user → call Clerk directly
 *      (CLERK_AGENT_USER_ID / _EMAIL, or the dedicated default user)
 *   2. AGENT_LOGIN_SECRET → POST https://anthonyl.im/api/agent/session
 *   3. `gh auth token` with push/admin OR a GitHub App installation that
 *      includes this repo (Cursor cloud `ghs_` tokens) → same endpoint
 *
 * `--api` / AGENT_SESSION_API must be anthonyl.im or loopback. The minted
 * session is the dedicated screenshot identity — not a personal production
 * login. Do not pass `--redirect https://anthonyl.im/korea`.
 */
import { existsSync } from "node:fs";
import {
  AgentTaskError,
  createClerkAgentTask,
  DEFAULT_CLERK_AGENT_USER_ID,
  isAllowedAgentApiBase,
  isAllowedAgentRedirect,
  mintAgentSessionRemote,
  parseAgentOnBehalfOf,
  previewAgentRedirectUrl,
} from "../server/src/agentTasks";

const MAIN_WORKTREE = "/tmp/anthonyl-im-agent-login";
const TRUSTED_ENV = "CLERK_AGENT_LOGIN_TRUSTED";

function arg(flag: string, argv: string[]): string | undefined {
  const idx = argv.indexOf(`--${flag}`);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

function usage(): never {
  console.error(`usage:
  bun scripts/clerk-agent-login.ts --pr <n> [--path /korea|/trips]
  bun scripts/clerk-agent-login.ts --redirect <preview-or-localhost-url>

Then open the printed URL in the agent browser (Chrome MCP / Playwright).`);
  process.exit(2);
}

function ghAuthToken(): string | null {
  try {
    const out = Bun.spawnSync(["gh", "auth", "token"], { stdout: "pipe", stderr: "pipe" });
    if (out.exitCode !== 0) return null;
    const token = new TextDecoder().decode(out.stdout).trim();
    return token || null;
  } catch {
    return null;
  }
}

function git(args: string[], cwd?: string): { ok: boolean; stdout: string; stderr: string } {
  try {
    const out = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
    return {
      ok: out.exitCode === 0,
      stdout: new TextDecoder().decode(out.stdout).trim(),
      stderr: new TextDecoder().decode(out.stderr).trim(),
    };
  } catch (err) {
    return { ok: false, stdout: "", stderr: err instanceof Error ? err.message : String(err) };
  }
}

function isTrustedOriginMain(argv: string[]): boolean {
  if (process.env[TRUSTED_ENV] === "1") return true;
  if (argv.includes("--skip-main-check")) return true;
  const head = git(["rev-parse", "HEAD"]);
  const main = git(["rev-parse", "origin/main"]);
  return head.ok && main.ok && head.stdout.length > 0 && head.stdout === main.stdout;
}

function ensureOriginMainWorktree(): string {
  const fetched = git(["fetch", "origin", "main"]);
  if (!fetched.ok) {
    console.error(fetched.stderr || "git fetch origin main failed");
    console.error("Refusing to send credentials from this worktree.");
    process.exit(1);
  }

  const scriptPath = `${MAIN_WORKTREE}/scripts/clerk-agent-login.ts`;
  if (existsSync(scriptPath)) {
    git(["fetch", "origin", "main"], MAIN_WORKTREE);
    const checkout = git(["checkout", "--detach", "origin/main"], MAIN_WORKTREE);
    if (checkout.ok) return MAIN_WORKTREE;
    git(["worktree", "remove", "--force", MAIN_WORKTREE]);
  } else if (existsSync(MAIN_WORKTREE)) {
    git(["worktree", "remove", "--force", MAIN_WORKTREE]);
    git(["worktree", "prune"]);
  }

  const added = git(["worktree", "add", "--detach", MAIN_WORKTREE, "origin/main"]);
  if (!added.ok) {
    console.error(added.stderr || `Could not create ${MAIN_WORKTREE}`);
    console.error("Refusing to send credentials from this worktree.");
    process.exit(1);
  }
  return MAIN_WORKTREE;
}

function applyDefaultScreenshotUser(): void {
  if (parseAgentOnBehalfOf(process.env)) return;
  process.env.CLERK_AGENT_USER_ID = DEFAULT_CLERK_AGENT_USER_ID;
}

function reexecFromOriginMain(argv: string[]): never {
  applyDefaultScreenshotUser();
  const worktree = ensureOriginMainWorktree();
  console.error("re-executing clerk-agent-login from origin/main worktree");
  const child = Bun.spawnSync(["bun", "scripts/clerk-agent-login.ts", ...argv], {
    cwd: worktree,
    env: { ...process.env, [TRUSTED_ENV]: "1" },
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  process.exit(child.exitCode ?? 1);
}

const argv = process.argv.slice(2);
if (!isTrustedOriginMain(argv)) {
  reexecFromOriginMain(argv);
}

applyDefaultScreenshotUser();

const siteUrl = arg("site-url", argv) ?? process.env.SITE_URL ?? "https://anthonyl.im";
const redirectArg = arg("redirect", argv);
const prRaw = arg("pr", argv);
const path = arg("path", argv) ?? "/korea";

let redirectUrl = redirectArg;
if (!redirectUrl && prRaw) {
  const pr = Number(prRaw);
  if (!Number.isInteger(pr) || pr < 1) usage();
  redirectUrl = previewAgentRedirectUrl({ siteUrl, pr, path });
}
if (!redirectUrl) usage();
if (!isAllowedAgentRedirect(redirectUrl)) {
  console.error(`Refusing disallowed redirectUrl: ${redirectUrl}`);
  process.exit(1);
}

const onBehalfOf = parseAgentOnBehalfOf(process.env);
const clerkKey = process.env.CLERK_SECRET_KEY?.trim();

try {
  if (clerkKey && onBehalfOf) {
    const result = await createClerkAgentTask({
      secretKey: clerkKey,
      onBehalfOf,
      redirectUrl,
      agentName: arg("agent-name", argv),
      taskDescription: arg("task", argv) ?? `agent login → ${redirectUrl}`,
    });
    const via =
      "userId" in onBehalfOf && onBehalfOf.userId === DEFAULT_CLERK_AGENT_USER_ID
        ? "Clerk API (default screenshot user)"
        : "Clerk API";
    console.error(`minted via ${via} for ${redirectUrl}`);
    console.log(result.url);
    process.exit(0);
  }

  const bearer = process.env.AGENT_LOGIN_SECRET?.trim() || ghAuthToken();
  if (!bearer) {
    console.error(
      "Need CLERK_SECRET_KEY (screenshot user defaults if unset), or AGENT_LOGIN_SECRET, or `gh auth token`.",
    );
    process.exit(1);
  }

  const apiBase = arg("api", argv) ?? process.env.AGENT_SESSION_API ?? siteUrl;
  if (!isAllowedAgentApiBase(apiBase)) {
    console.error(
      `Refusing to send credentials to untrusted API origin: ${apiBase}\n` +
        "Use https://anthonyl.im or a loopback --api (http://127.0.0.1:3000).",
    );
    process.exit(1);
  }
  const result = await mintAgentSessionRemote({
    apiBase,
    bearer,
    redirectUrl,
    agentName: arg("agent-name", argv),
    taskDescription: arg("task", argv),
  });
  console.error(`minted via ${apiBase}/api/agent/session for ${redirectUrl}`);
  console.log(result.url);
} catch (err) {
  if (err instanceof AgentTaskError && err.status === 401) {
    console.error(
      "Production POST /api/agent/session rejected this GitHub token.\n" +
        "Cursor cloud `gh` tokens have no push; they work after production deploys the installation-token check.\n" +
        "Until then use CLERK_SECRET_KEY (the helper defaults the screenshot user) from a trusted origin/main checkout.",
    );
  }
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
