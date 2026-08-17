import { listCheckRunsForCommit, type ListedCheckRun } from "./reportCheck";
import { createOriginClient, type OriginClient } from "./client";
import {
  PR_GATE_CHECK_KEY,
  REQUIRED_PR_CHECK_KEYS,
  type OriginClientOptions,
} from "./types";

export type PrGateState = {
  pending: string[];
  failed: string[];
  passed: string[];
};

export function summarizeRequiredChecks(
  runs: ListedCheckRun[],
  required: readonly string[] = REQUIRED_PR_CHECK_KEYS,
): PrGateState {
  const latestByKey = new Map<string, ListedCheckRun>();
  for (const run of runs) {
    if (run.key === PR_GATE_CHECK_KEY) continue;
    const prev = latestByKey.get(run.key);
    if (!prev) {
      latestByKey.set(run.key, run);
      continue;
    }
    // Prefer the last occurrence; list order is not guaranteed, so keep
    // completed+failure over stale in_progress when keys collide.
    if (run.status === "completed" && prev.status !== "completed") {
      latestByKey.set(run.key, run);
    }
  }

  const pending: string[] = [];
  const failed: string[] = [];
  const passed: string[] = [];
  for (const key of required) {
    const run = latestByKey.get(key);
    if (!run || run.status !== "completed") {
      pending.push(key);
      continue;
    }
    if (run.conclusion !== "success") {
      failed.push(`${key}=${run.conclusion ?? "unknown"}`);
      continue;
    }
    passed.push(key);
  }
  return { pending, failed, passed };
}

export function prGateConclusion(state: PrGateState): "pending" | "success" | "failure" {
  if (state.failed.length > 0) return "failure";
  if (state.pending.length > 0) return "pending";
  return "success";
}

export async function evaluatePrGate(
  owner: string,
  repo: string,
  sha: string,
  clientOrOpts: OriginClient | OriginClientOptions,
): Promise<PrGateState> {
  const client = "request" in clientOrOpts ? clientOrOpts : createOriginClient(clientOrOpts);
  const runs = await listCheckRunsForCommit(owner, repo, sha, client);
  return summarizeRequiredChecks(runs);
}
