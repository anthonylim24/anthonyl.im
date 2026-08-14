import { describe, expect, test, mock } from "bun:test";
import {
  AgentTaskError,
  createClerkAgentTask,
  isAllowedAgentRedirect,
  parseAgentOnBehalfOf,
  parseAllowedRedirectHosts,
  previewAgentRedirectUrl,
  secretsEqual,
  verifyGithubPushAccess,
} from "./agentTasks";

describe("secretsEqual", () => {
  test("matches identical secrets of different lengths vs a control", () => {
    expect(secretsEqual("abc", "abc")).toBe(true);
    expect(secretsEqual("abc", "abd")).toBe(false);
    expect(secretsEqual("short", "much-longer-secret")).toBe(false);
    expect(secretsEqual(undefined, "x")).toBe(false);
  });
});

describe("parseAgentOnBehalfOf", () => {
  test("prefers user id over email", () => {
    expect(
      parseAgentOnBehalfOf({
        CLERK_AGENT_USER_ID: "user_123",
        CLERK_AGENT_USER_EMAIL: "a@b.co",
      }),
    ).toEqual({ userId: "user_123" });
  });

  test("falls back to email then identifier", () => {
    expect(parseAgentOnBehalfOf({ CLERK_AGENT_USER_EMAIL: " a@b.co " })).toEqual({
      identifier: "a@b.co",
    });
    expect(parseAgentOnBehalfOf({ CLERK_AGENT_USER_IDENTIFIER: "phone" })).toEqual({
      identifier: "phone",
    });
    expect(parseAgentOnBehalfOf({})).toBeNull();
  });
});

describe("isAllowedAgentRedirect", () => {
  test("allows production https paths including previews", () => {
    expect(isAllowedAgentRedirect("https://anthonyl.im/korea")).toBe(true);
    expect(
      isAllowedAgentRedirect("https://anthonyl.im/preview/pr/12/korea?hidePreviewChrome=1"),
    ).toBe(true);
    expect(isAllowedAgentRedirect("https://www.anthonyl.im/trips")).toBe(true);
  });

  test("allows loopback http for local Clerk instances", () => {
    expect(isAllowedAgentRedirect("http://localhost:5173/korea")).toBe(true);
    expect(isAllowedAgentRedirect("http://127.0.0.1:3000/trips")).toBe(true);
  });

  test("rejects open redirects and non-https production", () => {
    expect(isAllowedAgentRedirect("https://anthonyl.im.evil.com/korea")).toBe(false);
    expect(isAllowedAgentRedirect("https://evil.com/?next=https://anthonyl.im")).toBe(false);
    expect(isAllowedAgentRedirect("http://anthonyl.im/korea")).toBe(false);
    expect(isAllowedAgentRedirect("https://user:pass@anthonyl.im/korea")).toBe(false);
    expect(isAllowedAgentRedirect("not a url")).toBe(false);
    expect(isAllowedAgentRedirect("javascript:alert(1)")).toBe(false);
  });
});

describe("parseAllowedRedirectHosts", () => {
  test("defaults when empty", () => {
    expect(parseAllowedRedirectHosts(undefined)).toContain("anthonyl.im");
    expect(parseAllowedRedirectHosts("")).toContain("localhost");
  });

  test("splits a custom list", () => {
    expect(parseAllowedRedirectHosts(" Example.COM , other.dev ")).toEqual([
      "example.com",
      "other.dev",
    ]);
  });
});

describe("previewAgentRedirectUrl", () => {
  test("builds a chrome-hidden preview URL", () => {
    expect(previewAgentRedirectUrl({ siteUrl: "https://anthonyl.im/", pr: 42 })).toBe(
      "https://anthonyl.im/preview/pr/42/korea?hidePreviewChrome=1",
    );
    expect(
      previewAgentRedirectUrl({
        siteUrl: "https://anthonyl.im",
        pr: 7,
        path: "trips",
      }),
    ).toBe("https://anthonyl.im/preview/pr/7/trips?hidePreviewChrome=1");
  });
});

describe("createClerkAgentTask", () => {
  test("POSTs snake_case body and returns url", async () => {
    const fetchImpl = mock(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.on_behalf_of).toEqual({ user_id: "user_1" });
      expect(body.permissions).toBe("*");
      expect(body.redirect_url).toBe("https://anthonyl.im/korea");
      return new Response(
        JSON.stringify({ url: "https://clerk.example/task", agent_task_id: "atsk_1" }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await createClerkAgentTask({
      secretKey: "sk_test",
      onBehalfOf: { userId: "user_1" },
      redirectUrl: "https://anthonyl.im/korea",
      fetchImpl,
    });
    expect(result).toEqual({ url: "https://clerk.example/task", agentTaskId: "atsk_1" });
  });

  test("maps a missing-feature Clerk response to 503", async () => {
    const fetchImpl = mock(async () =>
      new Response(JSON.stringify({ errors: [{ message: "Not Found" }] }), { status: 404 }),
    ) as unknown as typeof fetch;

    try {
      await createClerkAgentTask({
        secretKey: "sk_test",
        onBehalfOf: { identifier: "a@b.co" },
        redirectUrl: "https://anthonyl.im/korea",
        fetchImpl,
      });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AgentTaskError);
      expect((err as AgentTaskError).status).toBe(503);
    }
  });
});

describe("verifyGithubPushAccess", () => {
  test("requires push or admin on the repo", async () => {
    const fetchImpl = mock(async () =>
      new Response(JSON.stringify({ permissions: { push: true, pull: true } }), { status: 200 }),
    ) as unknown as typeof fetch;
    expect(await verifyGithubPushAccess("gho_x", "anthonylim24/anthonyl.im", fetchImpl)).toBe(true);
  });

  test("rejects public-read tokens without permissions.push", async () => {
    const fetchImpl = mock(async () =>
      new Response(JSON.stringify({ id: 1 }), { status: 200 }),
    ) as unknown as typeof fetch;
    expect(await verifyGithubPushAccess("gho_x", "anthonylim24/anthonyl.im", fetchImpl)).toBe(false);
  });

  test("rejects malformed repo names without calling GitHub", async () => {
    const fetchImpl = mock(async () => {
      throw new Error("should not fetch");
    }) as unknown as typeof fetch;
    expect(await verifyGithubPushAccess("gho_x", "../etc/passwd", fetchImpl)).toBe(false);
  });
});
