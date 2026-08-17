import { createOriginClient, repoPath, type OriginClient } from "./client";
import {
  DEFAULT_SUITE_KEY,
  DEFAULT_SUITE_NAME,
  type CheckConclusion,
  type CheckOutput,
  type CheckStatus,
  type OriginClientOptions,
} from "./types";

export type UpsertCheckRunInput = {
  owner: string;
  repo: string;
  headSha: string;
  checkKey: string;
  checkName?: string;
  status: CheckStatus;
  conclusion?: CheckConclusion;
  suiteKey?: string;
  suiteName?: string;
  suiteExternalId: string;
  checkExternalId: string;
  detailsUrl?: string;
  output?: CheckOutput;
  startedAt?: string;
  completedAt?: string;
  externalUpdatedAt?: string;
};

export type UpsertCheckRunResult = {
  checkSuite: { id: string; key: string };
  checkRun: { id: string; key: string; status: string; conclusion?: string };
};

export function buildCheckRunBody(input: UpsertCheckRunInput) {
  if (input.status === "completed" && !input.conclusion) {
    throw new Error("conclusion is required when status is completed");
  }
  const now = input.externalUpdatedAt ?? new Date().toISOString();
  return {
    headSha: input.headSha,
    checkSuite: {
      key: input.suiteKey ?? DEFAULT_SUITE_KEY,
      name: input.suiteName ?? DEFAULT_SUITE_NAME,
      ...(input.detailsUrl ? { detailsUrl: input.detailsUrl } : {}),
      externalId: input.suiteExternalId,
    },
    checkRun: {
      key: input.checkKey,
      name: input.checkName ?? input.checkKey,
      status: input.status,
      ...(input.conclusion ? { conclusion: input.conclusion } : {}),
      externalUpdatedAt: now,
      ...(input.startedAt ? { startedAt: input.startedAt } : {}),
      ...(input.completedAt ? { completedAt: input.completedAt } : {}),
      ...(input.detailsUrl ? { detailsUrl: input.detailsUrl } : {}),
      externalId: input.checkExternalId,
      ...(input.output ? { output: input.output } : {}),
    },
  };
}

export async function upsertCheckRun(
  input: UpsertCheckRunInput,
  clientOrOpts: OriginClient | OriginClientOptions,
): Promise<UpsertCheckRunResult> {
  const client = "request" in clientOrOpts ? clientOrOpts : createOriginClient(clientOrOpts);
  return client.post<UpsertCheckRunResult>(
    `${repoPath(input.owner, input.repo)}/check-runs`,
    buildCheckRunBody(input),
  );
}

export type ListedCheckRun = {
  id: string;
  key: string;
  name: string;
  status: string;
  conclusion?: string;
  sha: string;
};

export type ListCheckRunsResponse = {
  checkRuns: ListedCheckRun[];
  nextPageToken?: string;
};

export async function listCheckRunsForCommit(
  owner: string,
  repo: string,
  sha: string,
  clientOrOpts: OriginClient | OriginClientOptions,
): Promise<ListedCheckRun[]> {
  const client = "request" in clientOrOpts ? clientOrOpts : createOriginClient(clientOrOpts);
  const runs: ListedCheckRun[] = [];
  let pageToken = "";
  for (let i = 0; i < 20; i++) {
    const qs = new URLSearchParams({ pageSize: "100" });
    if (pageToken) qs.set("pageToken", pageToken);
    const page = await client.get<ListCheckRunsResponse>(
      `${repoPath(owner, repo)}/commits/${encodeURIComponent(sha)}/check-runs?${qs}`,
    );
    runs.push(...(page.checkRuns ?? []));
    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }
  return runs;
}
