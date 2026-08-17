import { describe, expect, test } from "bun:test";
import { buildCheckRunBody } from "./reportCheck";
import { evaluatePrGate, prGateConclusion, summarizeRequiredChecks } from "./prGate";
import { createOriginClient } from "./client";
import { REQUIRED_PR_CHECK_KEYS } from "./types";

describe("buildCheckRunBody", () => {
  test("requires conclusion when completed", () => {
    expect(() =>
      buildCheckRunBody({
        owner: "acme",
        repo: "site",
        headSha: "a".repeat(40),
        checkKey: "pr-gate",
        status: "completed",
        suiteExternalId: "suite-1",
        checkExternalId: "run-1",
      }),
    ).toThrow(/conclusion/);
  });

  test("upserts a stable suite + run identity", () => {
    const body = buildCheckRunBody({
      owner: "acme",
      repo: "site",
      headSha: "b".repeat(40),
      checkKey: "pr-server-tests",
      status: "in_progress",
      suiteKey: "anthonyl-im-ci",
      suiteExternalId: "suite-1",
      checkExternalId: "run-1",
      detailsUrl: "https://example.test/run",
      output: { title: "Running", summary: "server tests" },
    });
    expect(body.headSha).toHaveLength(40);
    expect(body.checkSuite.key).toBe("anthonyl-im-ci");
    expect(body.checkRun.key).toBe("pr-server-tests");
    expect(body.checkRun.status).toBe("in_progress");
    expect(body.checkRun.detailsUrl).toBe("https://example.test/run");
  });
});

describe("summarizeRequiredChecks", () => {
  test("waits until every required job has completed successfully", () => {
    const state = summarizeRequiredChecks([
      { id: "1", key: "pr-server-tests", name: "pr-server-tests", status: "completed", conclusion: "success", sha: "x" },
      { id: "2", key: "pr-frontend-typecheck", name: "typecheck", status: "in_progress", sha: "x" },
    ]);
    expect(state.passed).toEqual(["pr-server-tests"]);
    expect(state.pending).toContain("pr-frontend-typecheck");
    expect(state.pending).toContain("pr-frontend-build");
    expect(prGateConclusion(state)).toBe("pending");
  });

  test("fails the gate when any required job failed", () => {
    const runs = REQUIRED_PR_CHECK_KEYS.map((key, i) => ({
      id: String(i),
      key,
      name: key,
      status: "completed" as const,
      conclusion: key === "pr-frontend-tests" ? "failure" : "success",
      sha: "x",
    }));
    const state = summarizeRequiredChecks(runs);
    expect(state.failed).toEqual(["pr-frontend-tests=failure"]);
    expect(prGateConclusion(state)).toBe("failure");
  });

  test("ignores the pr-gate run when summarizing siblings", () => {
    const state = summarizeRequiredChecks([
      { id: "g", key: "pr-gate", name: "pr-gate", status: "in_progress", sha: "x" },
    ]);
    expect(state.pending).toHaveLength(REQUIRED_PR_CHECK_KEYS.length);
  });
});

describe("evaluatePrGate", () => {
  test("pages check runs and returns the aggregate", async () => {
    const calls: string[] = [];
    const client = createOriginClient({
      token: "oit_test",
      fetch: async (input) => {
        const url = String(input);
        calls.push(url);
        return new Response(
          JSON.stringify({
            checkRuns: REQUIRED_PR_CHECK_KEYS.map((key, i) => ({
              id: String(i),
              key,
              name: key,
              status: "completed",
              conclusion: "success",
              sha: "c".repeat(40),
            })),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });
    const state = await evaluatePrGate("acme", "site", "c".repeat(40), client);
    expect(prGateConclusion(state)).toBe("success");
    expect(calls[0]).toContain("/repos/acme/site/commits/");
    expect(calls[0]).toContain("/check-runs");
  });
});
