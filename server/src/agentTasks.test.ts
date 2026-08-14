import { describe, expect, test, mock } from "bun:test";
import {
  AgentTaskError,
  createClerkAgentTask,
  fetchWithTimeout,
  isAllowedAgentApiBase,
  isAllowedAgentRedirect,
  parseAgentOnBehalfOf,
  parseAllowedRedirectHosts,
  previewAgentRedirectUrl,
  secretsEqual,
  DEFAULT_CLERK_AGENT_USER_ID,
  nextGithubInstallationReposUrl,
  verifyGithubAgentAccess,
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

  test("does not bake the screenshot user — the login helper applies that default", () => {
    expect(DEFAULT_CLERK_AGENT_USER_ID).toMatch(/^user_[A-Za-z0-9]+$/);
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
    expect(isAllowedAgentRedirect("http://[::1]:3000/korea")).toBe(true);
    expect(isAllowedAgentRedirect("http://[0:0:0:0:0:0:0:1]/trips")).toBe(true);
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

describe("isAllowedAgentApiBase", () => {
  test("allows production and loopback origins only", () => {
    expect(isAllowedAgentApiBase("https://anthonyl.im")).toBe(true);
    expect(isAllowedAgentApiBase("https://anthonyl.im/")).toBe(true);
    expect(isAllowedAgentApiBase("http://127.0.0.1:3000")).toBe(true);
    expect(isAllowedAgentApiBase("http://[::1]:3000")).toBe(true);
  });

  test("rejects arbitrary --api origins before a bearer is sent", () => {
    expect(isAllowedAgentApiBase("https://evil.example")).toBe(false);
    expect(isAllowedAgentApiBase("https://anthonyl.im.evil.com")).toBe(false);
    expect(isAllowedAgentApiBase("http://anthonyl.im")).toBe(false);
    expect(isAllowedAgentApiBase("https://user:pass@anthonyl.im")).toBe(false);
    expect(isAllowedAgentApiBase("not a url")).toBe(false);
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

  test("converts a stalled Clerk request into AgentTaskError", async () => {
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      })) as unknown as typeof fetch;

    try {
      await createClerkAgentTask({
        secretKey: "sk_test",
        onBehalfOf: { userId: "user_1" },
        redirectUrl: "https://anthonyl.im/korea",
        fetchImpl,
        timeoutMs: 20,
      });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AgentTaskError);
      expect((err as AgentTaskError).status).toBe(502);
      expect((err as AgentTaskError).message).toMatch(/timed out/);
    }
  });

  test("times out when headers arrive but the body never completes", async () => {
    const fetchImpl = mock(async () =>
      new Response(new ReadableStream({ start() { /* never enqueue or close */ } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    try {
      await fetchWithTimeout(fetchImpl, "https://api.clerk.com/v1/agents/tasks", {}, 20);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).name).toBe("AbortError");
    }
  });
});

describe("nextGithubInstallationReposUrl", () => {
  test("returns the next installation-repos URL", () => {
    expect(
      nextGithubInstallationReposUrl(
        '<https://api.github.com/installation/repositories?per_page=100&page=2>; rel="next", <https://api.github.com/installation/repositories?per_page=100&page=3>; rel="last"',
      ),
    ).toBe("https://api.github.com/installation/repositories?per_page=100&page=2");
  });

  test("rejects forged Link hosts and missing next", () => {
    expect(nextGithubInstallationReposUrl(null)).toBeNull();
    expect(
      nextGithubInstallationReposUrl(
        '<https://evil.example/installation/repositories?page=2>; rel="next"',
      ),
    ).toBeNull();
    expect(
      nextGithubInstallationReposUrl(
        '<https://api.github.com/user/repos?page=2>; rel="next"',
      ),
    ).toBeNull();
    expect(
      nextGithubInstallationReposUrl(
        '<https://api.github.com/installation/repositories?page=2>; rel="last"',
      ),
    ).toBeNull();
  });
});

describe("verifyGithubAgentAccess", () => {
  test("accepts collaborator push or admin without an installation call", async () => {
    const fetchImpl = mock(async (url: string) => {
      expect(String(url)).toContain("/repos/anthonylim24/anthonyl.im");
      return new Response(JSON.stringify({ permissions: { push: true, pull: true } }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await verifyGithubAgentAccess("gho_x", "anthonylim24/anthonyl.im", fetchImpl)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("rejects public-read tokens that are not an installation on this repo", async () => {
    const fetchImpl = mock(async (url: string) => {
      if (String(url).includes("/repos/")) {
        return new Response(JSON.stringify({ id: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: "Bad credentials" }), { status: 403 });
    }) as unknown as typeof fetch;
    expect(await verifyGithubAgentAccess("gho_x", "anthonylim24/anthonyl.im", fetchImpl)).toBe(false);
  });

  test("rejects pull-only collaborator tokens", async () => {
    const fetchImpl = mock(async (url: string) => {
      if (String(url).includes("/repos/")) {
        return new Response(JSON.stringify({ permissions: { pull: true, push: false } }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    }) as unknown as typeof fetch;
    expect(await verifyGithubAgentAccess("gho_x", "anthonylim24/anthonyl.im", fetchImpl)).toBe(false);
  });

  test("accepts an installation token even when the listed repo reports push:false", async () => {
    // Cursor cloud ghs_ tokens expose permissions but every flag is false.
    const noPerms = { admin: false, maintain: false, pull: false, push: false, triage: false };
    const fetchImpl = mock(async (url: string) => {
      if (String(url).includes("/repos/")) {
        return new Response(JSON.stringify({ permissions: noPerms }), { status: 200 });
      }
      expect(String(url)).toContain("/installation/repositories");
      return new Response(
        JSON.stringify({
          total_count: 1,
          repositories: [{ full_name: "anthonylim24/anthonyl.im", permissions: noPerms }],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    expect(await verifyGithubAgentAccess("ghs_x", "anthonylim24/anthonyl.im", fetchImpl)).toBe(true);
  });

  test("matches installation repo names case-insensitively", async () => {
    const fetchImpl = mock(async (url: string) => {
      if (String(url).includes("/repos/")) {
        return new Response(JSON.stringify({ id: 1 }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ repositories: [{ full_name: "AnthonyLim24/anthonyl.im" }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    expect(await verifyGithubAgentAccess("ghs_x", "anthonylim24/anthonyl.im", fetchImpl)).toBe(true);
  });

  test("rejects an installation token for a different repo", async () => {
    const fetchImpl = mock(async (url: string) => {
      if (String(url).includes("/repos/")) {
        return new Response(JSON.stringify({ id: 1 }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ repositories: [{ full_name: "other/repo" }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    expect(await verifyGithubAgentAccess("ghs_x", "anthonylim24/anthonyl.im", fetchImpl)).toBe(false);
  });

  test("follows a trusted installation Link next page", async () => {
    const fetchImpl = mock(async (url: string) => {
      const href = String(url);
      if (href.includes("/repos/")) {
        return new Response(JSON.stringify({ id: 1 }), { status: 200 });
      }
      if (!href.includes("page=2")) {
        return new Response(
          JSON.stringify({ repositories: [{ full_name: "other/repo" }] }),
          {
            status: 200,
            headers: {
              Link: '<https://api.github.com/installation/repositories?per_page=100&page=2>; rel="next"',
            },
          },
        );
      }
      return new Response(
        JSON.stringify({ repositories: [{ full_name: "anthonylim24/anthonyl.im" }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    expect(await verifyGithubAgentAccess("ghs_x", "anthonylim24/anthonyl.im", fetchImpl)).toBe(true);
  });

  test("rejects malformed repo names without calling GitHub", async () => {
    const fetchImpl = mock(async () => {
      throw new Error("should not fetch");
    }) as unknown as typeof fetch;
    expect(await verifyGithubAgentAccess("gho_x", "../etc/passwd", fetchImpl)).toBe(false);
  });

  test("falls through to installation after a repo transport failure", async () => {
    const fetchImpl = mock(async (url: string) => {
      if (String(url).includes("/repos/")) {
        throw new Error("ECONNRESET");
      }
      return new Response(
        JSON.stringify({ repositories: [{ full_name: "anthonylim24/anthonyl.im" }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    expect(await verifyGithubAgentAccess("ghs_x", "anthonylim24/anthonyl.im", fetchImpl)).toBe(true);
  });

  test("treats installation transport failures as unauthorized", async () => {
    const fetchImpl = mock(async (url: string) => {
      if (String(url).includes("/repos/")) {
        return new Response(JSON.stringify({ id: 1 }), { status: 200 });
      }
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    expect(await verifyGithubAgentAccess("gho_x", "anthonylim24/anthonyl.im", fetchImpl)).toBe(false);
  });

  test("keeps verifyGithubPushAccess as an alias", async () => {
    expect(verifyGithubPushAccess).toBe(verifyGithubAgentAccess);
  });
});
