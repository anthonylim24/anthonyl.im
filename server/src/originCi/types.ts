export const ORIGIN_API_BASE = "https://api.cursor.com/v1/origin";

export const REQUIRED_PR_CHECK_KEYS = [
  "pr-server-tests",
  "pr-frontend-typecheck",
  "pr-frontend-build",
  "pr-frontend-tests",
  "pr-cloud-setup",
] as const;

export const PR_GATE_CHECK_KEY = "pr-gate";
export const PREVIEW_CHECK_KEY = "preview";
export const DEPLOY_CHECK_KEY = "deploy";

export const DEFAULT_SUITE_KEY = "anthonyl-im-ci";
export const DEFAULT_SUITE_NAME = "anthonyl.im CI";

export const PREVIEW_COMMENT_MARKER = "<!-- pr-preview -->";

export type CheckStatus = "queued" | "in_progress" | "completed";

export type CheckConclusion =
  | "success"
  | "failure"
  | "neutral"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | "stale";

export type CheckOutput = {
  title?: string;
  summary?: string;
  text?: string;
};

export type OriginRepoRef = {
  owner: string;
  repo: string;
};

export type OriginClientOptions = {
  token: string;
  baseUrl?: string;
  fetch?: typeof fetch;
};
