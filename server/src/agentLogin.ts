import { AgentTaskError, DEFAULT_UPSTREAM_TIMEOUT_MS, fetchWithTimeout } from "./agentTasks";

/** Query param Clerk FAPI expects to bypass bot detection. */
export const CLERK_TESTING_TOKEN_PARAM = "__clerk_testing_token";

/** Default Chrome DevTools endpoint used by Cursor cloud / computerUse. */
export const DEFAULT_CLERK_AGENT_CDP_URL = "http://127.0.0.1:9222";

/** Applied agent sessions last long enough for a full PR screenshot pass. */
export const AGENT_LOGIN_SESSION_SECONDS = 4 * 60 * 60;

export type ClerkTestingToken = {
  token: string;
  expiresAt: number;
};

export function redactClerkUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "[invalid-url]";
  }
}

export function isClerkBackendApiHost(hostname: string): boolean {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase() === "api.clerk.com";
}

/** True for Clerk Frontend API hosts. Never matches the Backend API. */
export function isClerkFrontendApiHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isClerkBackendApiHost(host)) return false;
  return host === "clerk.accounts.dev" || host.endsWith(".clerk.accounts.dev");
}

export function clerkFrontendApiHostFromUrl(raw: string): string | null {
  try {
    const host = new URL(raw).hostname;
    return isClerkFrontendApiHost(host) ? host : host || null;
  } catch {
    return null;
  }
}

export function isClerkFrontendApiRequest(raw: string, knownFapiHost?: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isClerkBackendApiHost(host)) return false;
  if (knownFapiHost && host === knownFapiHost.replace(/^\[|\]$/g, "").toLowerCase()) {
    return url.pathname.startsWith("/v1/");
  }
  return isClerkFrontendApiHost(host) && url.pathname.startsWith("/v1/");
}

export function withClerkTestingToken(raw: string, token: string): string {
  const url = new URL(raw);
  url.searchParams.set(CLERK_TESTING_TOKEN_PARAM, token);
  return url.toString();
}

export function previewBaseFromRedirect(redirectUrl: string): string {
  const url = new URL(redirectUrl);
  const match = url.pathname.match(/^(\/preview\/pr\/\d+)/);
  return match ? `${url.origin}${match[1]}` : url.origin;
}

export function siblingPreviewUrl(
  redirectUrl: string,
  path: "/korea" | "/trips",
): string {
  const url = new URL(`${previewBaseFromRedirect(redirectUrl)}${path}`);
  url.searchParams.set("hidePreviewChrome", "1");
  return url.toString();
}

export function clerkAgentTaskFailed(text: string): boolean {
  return (
    /ticket is invalid/i.test(text) ||
    /bot traffic detected/i.test(text) ||
    /task (is )?(invalid|expired|already used)/i.test(text)
  );
}

export function clerkSignInWallPresent(text: string): boolean {
  return clerkAgentTaskFailed(text) || /sign in to (continue|view|plan)/i.test(text);
}

/**
 * Signed-in Korea/Trips copy. Do not treat the sign-in card's
 * "South Korea" / "Seoul · Busan" heading as authenticated.
 */
export function clerkSignedInCopyPresent(text: string): boolean {
  if (clerkSignInWallPresent(text)) return false;
  const korea = /daily itinerary/i.test(text) || /the twelve days/i.test(text);
  const trips = /your trips/i.test(text);
  return korea || trips;
}

export function clerkSessionCookiePresent(names: readonly string[]): boolean {
  return names.some((name) => name === "__session" || name.startsWith("__session_"));
}

export function parseClerkTestingTokenResponse(json: unknown): ClerkTestingToken {
  const record = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const nested =
    record?.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : null;
  const token =
    (typeof record?.token === "string" && record.token) ||
    (typeof nested?.token === "string" && nested.token) ||
    "";
  if (!token) {
    throw new AgentTaskError("Clerk testing token response missing token", 502);
  }
  const expiresAtRaw = record?.expires_at ?? record?.expiresAt ?? nested?.expires_at;
  const expiresAt = typeof expiresAtRaw === "number" ? expiresAtRaw : 0;
  return { token, expiresAt };
}

export async function createClerkTestingToken(opts: {
  secretKey: string;
  apiUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<ClerkTestingToken> {
  const apiUrl = (opts.apiUrl ?? "https://api.clerk.com").replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetchWithTimeout(
      opts.fetchImpl ?? fetch,
      `${apiUrl}/v1/testing_tokens`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.secretKey}` },
      },
      opts.timeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS,
    );
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    throw new AgentTaskError(
      timedOut ? "Clerk testing token request timed out" : "Clerk testing token request failed",
      502,
    );
  }

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AgentTaskError(
      `Clerk testing token failed (${res.status})`,
      res.status >= 400 && res.status < 500 ? res.status : 502,
    );
  }
  return parseClerkTestingTokenResponse(json);
}
