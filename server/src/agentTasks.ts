import { createHash, timingSafeEqual } from "node:crypto";

export type AgentOnBehalfOf =
  | { userId: string; identifier?: never }
  | { identifier: string; userId?: never };

export type AgentTaskResult = {
  url: string;
  agentTaskId: string;
};

export class AgentTaskError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "AgentTaskError";
    this.status = status;
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export const DEFAULT_AGENT_REDIRECT_HOSTS = [
  "anthonyl.im",
  "www.anthonyl.im",
  "localhost",
  "127.0.0.1",
] as const;

export const DEFAULT_AGENT_GITHUB_REPO = "anthonylim24/anthonyl.im";
export const DEFAULT_AGENT_NAME = "anthonyl-im-agent";
export const DEFAULT_TASK_DESCRIPTION = "Automated test / PR preview screenshot";
export const DEFAULT_SESSION_SECONDS = 1800;

/** Length-independent comparison so login-secret checks do not leak size. */
export function secretsEqual(expected: string | undefined, provided: string): boolean {
  if (!expected) return false;
  const left = createHash("sha256").update(expected).digest();
  const right = createHash("sha256").update(provided).digest();
  return timingSafeEqual(left, right);
}

export function parseAgentOnBehalfOf(
  env: Record<string, string | undefined>,
): AgentOnBehalfOf | null {
  const userId = env.CLERK_AGENT_USER_ID?.trim();
  if (userId) return { userId };
  const identifier =
    env.CLERK_AGENT_USER_EMAIL?.trim() || env.CLERK_AGENT_USER_IDENTIFIER?.trim();
  if (identifier) return { identifier };
  return null;
}

export function parseAllowedRedirectHosts(
  raw: string | undefined,
): string[] {
  const fromEnv = (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : [...DEFAULT_AGENT_REDIRECT_HOSTS];
}

/**
 * Open-redirect guard for Clerk Agent Task `redirectUrl`.
 * Production hosts must be https; loopback may use http for local Clerk instances.
 */
export function isAllowedAgentRedirect(
  raw: string,
  allowedHosts: readonly string[] = DEFAULT_AGENT_REDIRECT_HOSTS,
): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (!allowedHosts.some((h) => h.toLowerCase() === host)) return false;
  if (LOCAL_HOSTS.has(host)) return url.protocol === "http:" || url.protocol === "https:";
  return url.protocol === "https:";
}

/** Convenience URL for screenshotting a published PR preview. */
export function previewAgentRedirectUrl(opts: {
  siteUrl: string;
  pr: number;
  path?: string;
  hidePreviewChrome?: boolean;
}): string {
  const site = opts.siteUrl.replace(/\/+$/, "");
  let path = opts.path ?? "/korea";
  if (!path.startsWith("/")) path = `/${path}`;
  const url = new URL(`${site}/preview/pr/${opts.pr}${path}`);
  if (opts.hidePreviewChrome !== false) url.searchParams.set("hidePreviewChrome", "1");
  return url.toString();
}

function clerkErrorMessage(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const errors = (json as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const first = errors[0];
  if (first && typeof first === "object" && "message" in first) {
    const message = (first as { message: unknown }).message;
    return typeof message === "string" ? message : null;
  }
  return null;
}

function isMissingFeatureError(status: number, message: string): boolean {
  if (status === 404 || status === 410) return true;
  return /agent.?task/i.test(message) && /not (found|enabled|available)/i.test(message);
}

export async function createClerkAgentTask(opts: {
  secretKey: string;
  onBehalfOf: AgentOnBehalfOf;
  redirectUrl: string;
  agentName?: string;
  taskDescription?: string;
  sessionMaxDurationInSeconds?: number;
  apiUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<AgentTaskResult> {
  const apiUrl = (opts.apiUrl ?? "https://api.clerk.com").replace(/\/+$/, "");
  const onBehalfOf =
    "userId" in opts.onBehalfOf
      ? { user_id: opts.onBehalfOf.userId }
      : { identifier: opts.onBehalfOf.identifier };
  const body: Record<string, unknown> = {
    on_behalf_of: onBehalfOf,
    permissions: "*",
    agent_name: opts.agentName ?? DEFAULT_AGENT_NAME,
    task_description: opts.taskDescription ?? DEFAULT_TASK_DESCRIPTION,
    redirect_url: opts.redirectUrl,
    session_max_duration_in_seconds:
      opts.sessionMaxDurationInSeconds ?? DEFAULT_SESSION_SECONDS,
  };

  const res = await (opts.fetchImpl ?? fetch)(`${apiUrl}/v1/agents/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = clerkErrorMessage(json) || `Clerk Agent Tasks failed (${res.status})`;
    if (isMissingFeatureError(res.status, message)) {
      throw new AgentTaskError(
        "Clerk Agent Tasks are not enabled on this instance. Enable them in the Clerk dashboard (Beta).",
        503,
      );
    }
    throw new AgentTaskError(message, res.status >= 400 && res.status < 500 ? res.status : 502);
  }

  const record = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const url = typeof record?.url === "string" ? record.url : "";
  if (!url) throw new AgentTaskError("Clerk Agent Tasks response missing url", 502);
  const agentTaskId = String(
    record?.agent_task_id ?? record?.agentTaskId ?? record?.id ?? "",
  );
  return { url, agentTaskId };
}

/** True when the token can push to `owner/repo` (collaborator / GitHub App). */
export async function verifyGithubPushAccess(
  token: string,
  repo: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!token || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return false;
  const res = await fetchImpl(`https://api.github.com/repos/${repo}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "anthonyl.im-agent-session",
    },
  });
  if (!res.ok) return false;
  const body = (await res.json().catch(() => null)) as {
    permissions?: { push?: boolean; admin?: boolean };
  } | null;
  return body?.permissions?.push === true || body?.permissions?.admin === true;
}

export async function mintAgentSessionRemote(opts: {
  apiBase: string;
  bearer: string;
  redirectUrl: string;
  agentName?: string;
  taskDescription?: string;
  fetchImpl?: typeof fetch;
}): Promise<AgentTaskResult> {
  const apiBase = opts.apiBase.replace(/\/+$/, "");
  const res = await (opts.fetchImpl ?? fetch)(`${apiBase}/api/agent/session`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.bearer}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      redirectUrl: opts.redirectUrl,
      agentName: opts.agentName,
      taskDescription: opts.taskDescription,
    }),
  });
  const json = (await res.json().catch(() => null)) as {
    url?: unknown;
    agentTaskId?: unknown;
    error?: unknown;
    message?: unknown;
  } | null;
  if (!res.ok) {
    const message =
      (typeof json?.message === "string" && json.message) ||
      (typeof json?.error === "string" && json.error) ||
      `agent session mint failed (${res.status})`;
    throw new AgentTaskError(message, res.status);
  }
  if (typeof json?.url !== "string" || !json.url) {
    throw new AgentTaskError("agent session response missing url", 502);
  }
  return {
    url: json.url,
    agentTaskId: typeof json.agentTaskId === "string" ? json.agentTaskId : "",
  };
}
