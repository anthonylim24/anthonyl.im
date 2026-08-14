#!/usr/bin/env bun
/**
 * Mint a Clerk Agent Task URL so a browser (Chrome MCP, Playwright) can
 * sign in without the interactive Clerk modal.
 *
 *   bun scripts/clerk-agent-login.ts --pr 123 --path /korea
 *   bun scripts/clerk-agent-login.ts --pr 123 --path /trips
 *
 * Run this helper from a trusted `origin/main` checkout, not a PR worktree —
 * it can send CLERK_SECRET_KEY / AGENT_LOGIN_SECRET / `gh auth token`.
 *
 * Prints the one-time Clerk URL on stdout. Navigate the agent browser there;
 * Clerk sets a session cookie and redirects to the preview page.
 *
 * Auth (first match):
 *   1. CLERK_SECRET_KEY + CLERK_AGENT_USER_ID (or _EMAIL) → call Clerk directly
 *   2. AGENT_LOGIN_SECRET → POST https://anthonyl.im/api/agent/session
 *   3. `gh auth token` as a repo collaborator → same production endpoint
 *
 * `--api` / AGENT_SESSION_API must be anthonyl.im or loopback. The minted
 * session is a dedicated screenshot identity (no production trip writes).
 */
import {
  createClerkAgentTask,
  isAllowedAgentApiBase,
  isAllowedAgentRedirect,
  mintAgentSessionRemote,
  parseAgentOnBehalfOf,
  previewAgentRedirectUrl,
} from "../server/src/agentTasks";

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
    console.error(`minted via Clerk API for ${redirectUrl}`);
    console.log(result.url);
    process.exit(0);
  }

  const bearer = process.env.AGENT_LOGIN_SECRET?.trim() || ghAuthToken();
  if (!bearer) {
    console.error(
      "Need CLERK_SECRET_KEY + CLERK_AGENT_USER_ID (or _EMAIL), or AGENT_LOGIN_SECRET, or `gh auth token`.",
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
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
