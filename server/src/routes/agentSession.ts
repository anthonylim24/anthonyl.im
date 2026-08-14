import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  AgentTaskError,
  createClerkAgentTask,
  DEFAULT_AGENT_NAME,
  DEFAULT_SESSION_SECONDS,
  DEFAULT_TASK_DESCRIPTION,
  isAllowedAgentRedirect,
  secretsEqual,
  verifyGithubPushAccess,
  type AgentOnBehalfOf,
} from "../agentTasks";
import { consumeRateLimit, hashedIdentityKey } from "../middleware/rateLimit";

const IDENTITY_WINDOW_MS = 60_000;
const IDENTITY_MAX = 10;

const bodySchema = z.object({
  redirectUrl: z.string().url().max(2000),
  agentName: z.string().min(1).max(80).optional(),
  taskDescription: z.string().min(1).max(200).optional(),
});

export type AgentSessionDeps = {
  clerkSecretKey?: string;
  loginSecret?: string;
  onBehalfOf: AgentOnBehalfOf | null;
  allowedHosts: readonly string[];
  githubRepo?: string;
  createTask?: typeof createClerkAgentTask;
  verifyGithub?: typeof verifyGithubPushAccess;
};

function bearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

export function createAgentSessionRouter(deps: AgentSessionDeps) {
  const agent = new Hono();
  const createTask = deps.createTask ?? createClerkAgentTask;
  const verifyGithub = deps.verifyGithub ?? verifyGithubPushAccess;
  const configured = Boolean(deps.clerkSecretKey && deps.onBehalfOf);

  agent.use("*", async (c, next) => {
    if (!configured) return c.json({ error: "not_configured" }, 404);
    return next();
  });

  agent.get("/session", (c) =>
    c.json(
      {
        error: "method_not_allowed",
        hint: "POST /api/agent/session with Authorization: Bearer <AGENT_LOGIN_SECRET or gh auth token>",
      },
      405,
    ),
  );

  agent.post("/session", zValidator("json", bodySchema), async (c) => {
    if (!deps.clerkSecretKey || !deps.onBehalfOf) {
      return c.json({ error: "not_configured" }, 404);
    }

    const token = bearerToken(c.req.header("Authorization"));
    if (!token) {
      return c.json({ error: "unauthorized", message: "missing Authorization Bearer token" }, 401);
    }

    const secretOk = secretsEqual(deps.loginSecret, token);
    let githubOk = false;
    if (!secretOk && deps.githubRepo) {
      githubOk = await verifyGithub(token, deps.githubRepo);
    }
    if (!secretOk && !githubOk) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const identity = consumeRateLimit(`agent-session-id:${hashedIdentityKey(token)}`, {
      windowMs: IDENTITY_WINDOW_MS,
      max: IDENTITY_MAX,
    });
    if (!identity.ok) {
      c.header("Retry-After", String(identity.retryAfter));
      return c.json({ error: "rate_limited" }, 429);
    }

    const body = c.req.valid("json");
    if (!isAllowedAgentRedirect(body.redirectUrl, deps.allowedHosts)) {
      return c.json(
        {
          error: "invalid_redirect",
          message: "redirectUrl host must be anthonyl.im or localhost",
        },
        400,
      );
    }

    try {
      const result = await createTask({
        secretKey: deps.clerkSecretKey,
        onBehalfOf: deps.onBehalfOf,
        redirectUrl: body.redirectUrl,
        agentName: body.agentName ?? DEFAULT_AGENT_NAME,
        taskDescription: body.taskDescription ?? DEFAULT_TASK_DESCRIPTION,
      });
      return c.json({
        url: result.url,
        agentTaskId: result.agentTaskId,
        expiresInSeconds: DEFAULT_SESSION_SECONDS,
      });
    } catch (err) {
      if (err instanceof AgentTaskError) {
        const status = err.status === 401 || err.status === 403 || err.status === 400 || err.status === 503
          ? err.status
          : 502;
        return c.json({ error: "agent_task_failed", message: err.message }, status);
      }
      throw err;
    }
  });

  return agent;
}
