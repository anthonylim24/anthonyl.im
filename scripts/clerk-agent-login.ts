#!/usr/bin/env bun
/**
 * Mint a Clerk Agent Task URL so a browser (Chrome MCP, Playwright) can
 * sign in without the interactive Clerk modal.
 *
 *   bun scripts/clerk-agent-login.ts --pr 123 --path /korea
 *   bun scripts/clerk-agent-login.ts --pr 123 --path /trips
 *
 * When this checkout is not a clean `origin/main`, the helper re-execs from a
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
import { chmodSync, existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function refuse(message: string): never {
  console.error(message);
  console.error("Refusing to send credentials from this worktree.");
  process.exit(1);
}

function ensurePrivateDir(path: string): void {
  if (isSymlink(path)) refuse(`Refusing symlink at ${path}`);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (isSymlink(path)) refuse(`Refusing symlink at ${path}`);
  chmodSync(path, 0o700);
}

function gitCommonDir(cwd?: string): string | null {
  const out = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd);
  if (!out.ok || !out.stdout) return null;
  try {
    return realpathSync(out.stdout);
  } catch {
    return null;
  }
}

function isTrustedOriginMain(argv: string[]): boolean {
  if (process.env[TRUSTED_ENV] === "1") return true;
  if (argv.includes("--skip-main-check")) return true;
  if (!git(["fetch", "origin", "main"]).ok) return false;
  const dirty = git(["status", "--porcelain"]);
  if (!dirty.ok || dirty.stdout.length > 0) return false;
  const head = git(["rev-parse", "HEAD"]);
  const main = git(["rev-parse", "origin/main"]);
  return head.ok && main.ok && head.stdout.length > 0 && head.stdout === main.stdout;
}

function ensureOriginMainWorktree(): string {
  const fetched = git(["fetch", "origin", "main"]);
  if (!fetched.ok) refuse(fetched.stderr || "git fetch origin main failed");

  const expected = git(["rev-parse", "origin/main"]);
  if (!expected.ok || !expected.stdout) refuse("origin/main is missing after fetch.");

  const sourceCommon = gitCommonDir();
  if (!sourceCommon) refuse("Could not resolve this repository's git directory.");

  const parent = join(homedir(), ".cache", "anthonyl-im-agent-login");
  ensurePrivateDir(parent);
  const worktree = join(parent, "main");
  if (isSymlink(worktree)) refuse(`Refusing symlink worktree at ${worktree}`);

  const scriptPath = join(worktree, "scripts", "clerk-agent-login.ts");
  const worktreeIsOurs = () => gitCommonDir(worktree) === sourceCommon;

  if (existsSync(scriptPath)) {
    if (!worktreeIsOurs()) refuse("Existing login worktree is not this repository.");
    const checkout = git(["checkout", "--detach", expected.stdout], worktree);
    if (!checkout.ok) {
      git(["worktree", "remove", "--force", worktree]);
      git(["worktree", "prune"]);
    }
  } else if (existsSync(worktree)) {
    git(["worktree", "remove", "--force", worktree]);
    git(["worktree", "prune"]);
    if (existsSync(worktree) || isSymlink(worktree)) {
      refuse(`Could not replace ${worktree}`);
    }
  }

  if (!existsSync(scriptPath)) {
    const added = git(["worktree", "add", "--detach", worktree, expected.stdout]);
    if (!added.ok) refuse(added.stderr || `Could not create ${worktree}`);
  }

  if (isSymlink(worktree) || !worktreeIsOurs()) {
    refuse("Login worktree is not this repository.");
  }
  const head = git(["rev-parse", "HEAD"], worktree);
  if (!head.ok || head.stdout !== expected.stdout) {
    refuse("Login worktree HEAD does not match origin/main.");
  }
  try {
    chmodSync(worktree, 0o700);
  } catch {
    // git checkout may leave the tree as 0755; private parent is the boundary.
  }
  return worktree;
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

if (!isTrustedOriginMain(argv)) {
  reexecFromOriginMain(argv);
}

applyDefaultScreenshotUser();

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
        "Need push/admin on the repo, or a GitHub App installation that includes it.\n" +
        "Cursor cloud `ghs_` tokens report permissions.push=false; they authorize via installation membership.\n" +
        "Or use CLERK_SECRET_KEY (the helper defaults the screenshot user) from a trusted origin/main checkout.",
    );
  }
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
