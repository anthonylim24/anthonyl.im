import { describe, expect, test, mock } from "bun:test";
import { AgentTaskError } from "./agentTasks";
import {
  AGENT_LOGIN_SESSION_SECONDS,
  CLERK_TESTING_TOKEN_PARAM,
  chromeCookieUnexpired,
  clerkAgentTaskFailed,
  clerkFrontendApiHostFromUrl,
  clerkSessionCookiePresent,
  clerkSignedInCopyPresent,
  clerkSignInWallPresent,
  createClerkTestingToken,
  isAnthonylImCookieHost,
  isClerkFrontendApiHost,
  isClerkFrontendApiRequest,
  parseClerkTestingTokenResponse,
  previewBaseFromRedirect,
  redactClerkUrl,
  siblingPreviewUrl,
  withClerkTestingToken,
} from "./agentLogin";

describe("redactClerkUrl", () => {
  test("strips ticket and testing-token query params", () => {
    expect(
      redactClerkUrl(
        "https://natural-bee-70.clerk.accounts.dev/v1/agents/tasks?ticket=eyJhbGciOi.secret&__clerk_testing_token=tok",
      ),
    ).toBe("https://natural-bee-70.clerk.accounts.dev/v1/agents/tasks");
  });

  test("returns a placeholder for invalid input", () => {
    expect(redactClerkUrl("not a url")).toBe("[invalid-url]");
  });
});

describe("isClerkFrontendApiHost / request", () => {
  test("accepts *.clerk.accounts.dev and rejects the Backend API", () => {
    expect(isClerkFrontendApiHost("natural-bee-70.clerk.accounts.dev")).toBe(true);
    expect(isClerkFrontendApiHost("clerk.accounts.dev")).toBe(true);
    expect(isClerkFrontendApiHost("api.clerk.com")).toBe(false);
    expect(isClerkFrontendApiHost("anthonyl.im")).toBe(false);
  });

  test("matches FAPI /v1/ paths only", () => {
    expect(
      isClerkFrontendApiRequest("https://natural-bee-70.clerk.accounts.dev/v1/client"),
    ).toBe(true);
    expect(isClerkFrontendApiRequest("https://api.clerk.com/v1/testing_tokens")).toBe(false);
    expect(isClerkFrontendApiRequest("https://anthonyl.im/korea")).toBe(false);
  });

  test("accepts a known FAPI host from the Agent Task URL", () => {
    expect(
      isClerkFrontendApiRequest(
        "https://clerk.anthonyl.im/v1/client",
        "clerk.anthonyl.im",
      ),
    ).toBe(true);
    expect(
      isClerkFrontendApiRequest("https://clerk.anthonyl.im/other", "clerk.anthonyl.im"),
    ).toBe(false);
  });

  test("reads the FAPI host from a task URL", () => {
    expect(
      clerkFrontendApiHostFromUrl(
        "https://natural-bee-70.clerk.accounts.dev/v1/agents/tasks?ticket=x",
      ),
    ).toBe("natural-bee-70.clerk.accounts.dev");
  });

  test("rejects the Backend API and unrelated hosts", () => {
    expect(clerkFrontendApiHostFromUrl("https://api.clerk.com/v1/testing_tokens")).toBeNull();
    expect(clerkFrontendApiHostFromUrl("https://anthonyl.im/korea")).toBeNull();
    expect(clerkFrontendApiHostFromUrl("https://evil.example/v1/client")).toBeNull();
  });

  test("accepts a custom Clerk satellite domain", () => {
    expect(clerkFrontendApiHostFromUrl("https://clerk.anthonyl.im/v1/agents/tasks")).toBe(
      "clerk.anthonyl.im",
    );
  });
});

describe("withClerkTestingToken", () => {
  test("sets the Clerk testing-token query param", () => {
    const url = withClerkTestingToken(
      "https://natural-bee-70.clerk.accounts.dev/v1/agents/tasks?ticket=abc",
      "1713877200-c_token",
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get("ticket")).toBe("abc");
    expect(parsed.searchParams.get(CLERK_TESTING_TOKEN_PARAM)).toBe("1713877200-c_token");
  });
});

describe("preview helpers", () => {
  test("previewBaseFromRedirect keeps the PR mount", () => {
    expect(
      previewBaseFromRedirect("https://anthonyl.im/preview/pr/12/korea?hidePreviewChrome=1"),
    ).toBe("https://anthonyl.im/preview/pr/12");
  });

  test("siblingPreviewUrl switches korea-2026 ↔ trips on the same preview", () => {
    expect(
      siblingPreviewUrl(
        "https://anthonyl.im/preview/pr/9/trips/korea-2026?hidePreviewChrome=1",
        "/trips",
      ),
    ).toBe("https://anthonyl.im/preview/pr/9/trips?hidePreviewChrome=1");
    expect(
      siblingPreviewUrl("https://anthonyl.im/preview/pr/9/trips?hidePreviewChrome=1", "/trips/korea-2026"),
    ).toBe("https://anthonyl.im/preview/pr/9/trips/korea-2026?hidePreviewChrome=1");
    expect(
      siblingPreviewUrl("https://anthonyl.im/preview/pr/9/trips?hidePreviewChrome=1", "/korea"),
    ).toBe("https://anthonyl.im/preview/pr/9/korea?hidePreviewChrome=1");
  });

  test("agent sessions are longer than the 30-minute HTTP default", () => {
    expect(AGENT_LOGIN_SESSION_SECONDS).toBe(14_400);
  });
});

describe("sign-in wall vs signed-in copy", () => {
  test("detects the Korea and Trips gates", () => {
    expect(clerkSignInWallPresent("Sign in to continue")).toBe(true);
    expect(
      clerkSignInWallPresent("Sign in to view the full itinerary, reservations, and live travel status."),
    ).toBe(true);
    expect(clerkSignInWallPresent("Sign in to plan days, reservations, and Map Mode.")).toBe(true);
  });

  test("does not treat the Korea sign-in card heading as authenticated", () => {
    const wall = [
      "South Korea",
      "Seoul · Busan",
      "Sign in to view the full itinerary, reservations, and live travel status.",
      "Sign in to continue",
    ].join("\n");
    expect(clerkSignedInCopyPresent(wall)).toBe(false);
    expect(clerkSignInWallPresent(wall)).toBe(true);
  });

  test("detects signed-in Korea and Trips pages", () => {
    expect(clerkSignedInCopyPresent("The twelve days\nDaily itinerary")).toBe(true);
    expect(clerkSignedInCopyPresent("Itinerary workspace\nYour trips\nNew trip")).toBe(true);
    expect(clerkSignedInCopyPresent("Inbox\nOpen a trip to edit it in place.\nNew trip")).toBe(true);
    expect(clerkSignedInCopyPresent("Enhance trip\nItinerary")).toBe(true);
  });

  test("detects ticket / bot failures", () => {
    expect(clerkAgentTaskFailed("The ticket is invalid")).toBe(true);
    expect(clerkAgentTaskFailed("Bot traffic detected")).toBe(true);
    expect(clerkAgentTaskFailed("Daily itinerary")).toBe(false);
  });

  test("session cookies are the __session family only", () => {
    expect(clerkSessionCookiePresent(["__client_uat", "__clerk_db_jwt"])).toBe(false);
    expect(clerkSessionCookiePresent(["__client_uat", "__session"])).toBe(true);
    expect(clerkSessionCookiePresent(["__session_ERNhlnnx"])).toBe(true);
  });

  test("scopes session cookies to anthonyl.im and drops expired Chrome rows", () => {
    expect(isAnthonylImCookieHost(".anthonyl.im")).toBe(true);
    expect(isAnthonylImCookieHost("anthonyl.im")).toBe(true);
    expect(isAnthonylImCookieHost("notanthonyl.im")).toBe(false);
    expect(isAnthonylImCookieHost(".natural-bee-70.clerk.accounts.dev")).toBe(false);
    expect(chromeCookieUnexpired(0)).toBe(true);
    const chromeEpochOffsetMs = 11_644_473_600_000;
    const expiredUtc = (Date.now() - 60_000 + chromeEpochOffsetMs) * 1000;
    const liveUtc = (Date.now() + 60_000 + chromeEpochOffsetMs) * 1000;
    expect(chromeCookieUnexpired(expiredUtc)).toBe(false);
    expect(chromeCookieUnexpired(liveUtc)).toBe(true);
  });
});

describe("parseClerkTestingTokenResponse / createClerkTestingToken", () => {
  test("reads the Backend API shape", () => {
    expect(
      parseClerkTestingTokenResponse({
        object: "testing_token",
        token: "1713877200-c_fixture",
        expires_at: 1713880800,
      }),
    ).toEqual({
      token: "1713877200-c_fixture",
      expiresAt: 1713880800,
    });
  });

  test("reads nested camelCase expiresAt", () => {
    expect(
      parseClerkTestingTokenResponse({
        data: { token: "tok_nested", expiresAt: 99 },
      }),
    ).toEqual({ token: "tok_nested", expiresAt: 99 });
  });

  test("POSTs /v1/testing_tokens with the secret", async () => {
    const fetchImpl = mock(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.clerk.com/v1/testing_tokens");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({ Authorization: "Bearer sk_test" });
      return new Response(
        JSON.stringify({ object: "testing_token", token: "tok_1", expires_at: 9 }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await createClerkTestingToken({ secretKey: "sk_test", fetchImpl });
    expect(result).toEqual({ token: "tok_1", expiresAt: 9 });
  });

  test("maps a failed mint to AgentTaskError", async () => {
    const fetchImpl = mock(
      async () => new Response("nope", { status: 401 }),
    ) as unknown as typeof fetch;
    try {
      await createClerkTestingToken({ secretKey: "sk_bad", fetchImpl });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AgentTaskError);
      expect((err as AgentTaskError).status).toBe(401);
    }
  });
});
