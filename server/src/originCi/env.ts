import type { OriginRepoRef } from "./types";

export function readOriginToken(env: NodeJS.ProcessEnv = process.env): string {
  const token = env.ORIGIN_INSTALLATION_TOKEN || env.ORIGIN_TOKEN || env.CURSOR_AUTH_TOKEN;
  if (!token) {
    throw new Error("Set ORIGIN_INSTALLATION_TOKEN (or ORIGIN_TOKEN) to report Origin checks.");
  }
  return token;
}

export function readOriginRepo(env: NodeJS.ProcessEnv = process.env): OriginRepoRef {
  if (env.ORIGIN_OWNER && env.ORIGIN_REPO) {
    return { owner: env.ORIGIN_OWNER, repo: env.ORIGIN_REPO };
  }
  const slug = env.ORIGIN_REPO_SLUG || env.ORIGIN_REPO_FULL || "";
  const slash = slug.indexOf("/");
  if (slash > 0) {
    return { owner: slug.slice(0, slash), repo: slug.slice(slash + 1) };
  }
  throw new Error("Set ORIGIN_OWNER and ORIGIN_REPO (or ORIGIN_REPO_SLUG=owner/repo).");
}

export function readHeadSha(env: NodeJS.ProcessEnv = process.env): string {
  const sha = env.ORIGIN_HEAD_SHA || env.PR_SHA || env.GITHUB_SHA || "";
  if (!/^[0-9a-f]{40,64}$/i.test(sha)) {
    throw new Error("Set ORIGIN_HEAD_SHA to the 40- or 64-char commit SHA.");
  }
  return sha;
}

export function attemptIds(checkKey: string, sha: string, runId = process.env.ORIGIN_RUN_ID ?? "local") {
  return {
    suiteExternalId: `suite-${sha}-${runId}`,
    checkExternalId: `${checkKey}-${sha}-${runId}`,
  };
}
