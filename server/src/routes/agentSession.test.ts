import { describe, expect, test, mock } from "bun:test";
import { Hono } from "hono";
import { createAgentSessionRouter } from "./agentSession";
import { AgentTaskError } from "../agentTasks";

const allowedHosts = ["anthonyl.im", "localhost"];

function app(overrides: Parameters<typeof createAgentSessionRouter>[0] extends infer T ? Partial<T> : never = {}) {
  const createTask = mock(async () => ({ url: "https://clerk.example/t", agentTaskId: "atsk_1" }));
  const verifyGithub = mock(async () => false);
  const router = createAgentSessionRouter({
    clerkSecretKey: "sk_test",
    loginSecret: "login-secret",
    onBehalfOf: { userId: "user_1" },
    allowedHosts,
    githubRepo: "anthonylim24/anthonyl.im",
    createTask,
    verifyGithub,
    ...overrides,
  });
  return {
    app: new Hono().route("/api/agent", router),
    createTask,
    verifyGithub,
  };
}

async function post(
  hono: Hono,
  body: unknown,
  token?: string,
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return hono.request("/api/agent/session", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/agent/session", () => {
  test("404 when Clerk agent user is not configured", async () => {
    const { app: hono } = app({ clerkSecretKey: undefined, onBehalfOf: null });
    const res = await post(hono, { redirectUrl: "https://anthonyl.im/korea" }, "login-secret");
    expect(res.status).toBe(404);
  });

  test("401 without a bearer token", async () => {
    const { app: hono } = app();
    const res = await post(hono, { redirectUrl: "https://anthonyl.im/korea" });
    expect(res.status).toBe(401);
  });

  test("401 on wrong secret when GitHub also denies", async () => {
    const { app: hono, createTask } = app();
    const res = await post(hono, { redirectUrl: "https://anthonyl.im/korea" }, "nope");
    expect(res.status).toBe(401);
    expect(createTask).not.toHaveBeenCalled();
  });

  test("400 on disallowed redirect host", async () => {
    const { app: hono, createTask } = app();
    const res = await post(hono, { redirectUrl: "https://evil.example/phish" }, "login-secret");
    expect(res.status).toBe(400);
    expect(createTask).not.toHaveBeenCalled();
  });

  test("200 mints a task URL with the login secret", async () => {
    const { app: hono, createTask, verifyGithub } = app();
    const res = await post(
      hono,
      { redirectUrl: "https://anthonyl.im/preview/pr/9/korea?hidePreviewChrome=1" },
      "login-secret",
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://clerk.example/t",
      agentTaskId: "atsk_1",
      expiresInSeconds: 1800,
    });
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(verifyGithub).not.toHaveBeenCalled();
  });

  test("200 accepts a GitHub collaborator token", async () => {
    const verifyGithub = mock(async (token: string) => token === "gho_ok");
    const { app: hono, createTask } = app({ verifyGithub });
    const res = await post(hono, { redirectUrl: "http://localhost:5173/korea" }, "gho_ok");
    expect(res.status).toBe(200);
    expect(createTask).toHaveBeenCalledTimes(1);
  });

  test("maps Clerk AgentTaskError to JSON", async () => {
    const createTask = mock(async () => {
      throw new AgentTaskError("Clerk Agent Tasks are not enabled on this instance. Enable them in the Clerk dashboard (Beta).", 503);
    });
    const { app: hono } = app({ createTask });
    const res = await post(hono, { redirectUrl: "https://anthonyl.im/korea" }, "login-secret");
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("agent_task_failed");
  });

  test("GET is 405 when configured", async () => {
    const { app: hono } = app();
    const res = await hono.request("/api/agent/session");
    expect(res.status).toBe(405);
  });

  test("GET is 404 when not configured", async () => {
    const { app: hono } = app({ clerkSecretKey: undefined, onBehalfOf: null });
    const res = await hono.request("/api/agent/session");
    expect(res.status).toBe(404);
  });
});
