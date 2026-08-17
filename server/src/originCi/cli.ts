#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { upsertStickyComment } from "./commentPr";
import { createOriginClient } from "./client";
import { attemptIds, readHeadSha, readOriginRepo, readOriginToken } from "./env";
import { evaluatePrGate, prGateConclusion } from "./prGate";
import { upsertCheckRun } from "./reportCheck";
import { parseOriginWebhookEvent, routeOriginWebhook, shouldPublishPreview } from "./verifyWebhook";
import {
  DEFAULT_SUITE_KEY,
  DEFAULT_SUITE_NAME,
  PR_GATE_CHECK_KEY,
  type CheckConclusion,
  type CheckStatus,
} from "./types";

function arg(flag: string, fallback = ""): string {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || !process.argv[idx + 1]) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function usage(): never {
  console.error(`Usage:
  bun server/src/originCi/cli.ts report-check --key <name> --status queued|in_progress|completed [--conclusion success|failure] [--title ...] [--summary ...]
  bun server/src/originCi/cli.ts pr-gate
  bun server/src/originCi/cli.ts sticky-comment --pr <n> --body-file <path|->
  bun server/src/originCi/cli.ts route-event --type <event.type>
`);
  process.exit(2);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!command || command === "--help" || command === "-h") usage();

  if (command === "route-event") {
    const type = arg("--type");
    if (!type) usage();
    const route = routeOriginWebhook(type);
    console.log(
      JSON.stringify({
        type,
        route,
        publishPreview: shouldPublishPreview(type),
      }),
    );
    return;
  }

  if (command === "parse-webhook") {
    const raw = readFileSync(0, "utf8");
    const parsed = parseOriginWebhookEvent(JSON.parse(raw) as unknown);
    if (!parsed) {
      console.error("invalid webhook envelope");
      process.exit(1);
    }
    console.log(
      JSON.stringify({
        deliveryId: parsed.deliveryId,
        type: parsed.event.type,
        route: routeOriginWebhook(parsed.event.type),
        publishPreview: shouldPublishPreview(parsed.event.type),
      }),
    );
    return;
  }

  const token = readOriginToken();
  const { owner, repo } = readOriginRepo();
  const client = createOriginClient({ token, baseUrl: process.env.ORIGIN_API_BASE });

  if (command === "report-check") {
    const key = arg("--key");
    const status = arg("--status") as CheckStatus;
    if (!key || !status) usage();
    const sha = readHeadSha();
    const ids = attemptIds(key, sha);
    const result = await upsertCheckRun(
      {
        owner,
        repo,
        headSha: sha,
        checkKey: key,
        checkName: arg("--name", key),
        status,
        conclusion: (arg("--conclusion") || undefined) as CheckConclusion | undefined,
        suiteKey: process.env.ORIGIN_SUITE_KEY ?? DEFAULT_SUITE_KEY,
        suiteName: process.env.ORIGIN_SUITE_NAME ?? DEFAULT_SUITE_NAME,
        suiteExternalId: process.env.ORIGIN_SUITE_EXTERNAL_ID ?? ids.suiteExternalId,
        checkExternalId: process.env.ORIGIN_CHECK_EXTERNAL_ID ?? ids.checkExternalId,
        detailsUrl: process.env.ORIGIN_DETAILS_URL || undefined,
        output:
          arg("--title") || arg("--summary")
            ? { title: arg("--title") || undefined, summary: arg("--summary") || undefined }
            : undefined,
      },
      client,
    );
    console.log(JSON.stringify(result));
    return;
  }

  if (command === "pr-gate") {
    const sha = readHeadSha();
    const state = await evaluatePrGate(owner, repo, sha, client);
    const conclusion = prGateConclusion(state);
    const ids = attemptIds(PR_GATE_CHECK_KEY, sha);
    const status = conclusion === "pending" ? "in_progress" : "completed";
    await upsertCheckRun(
      {
        owner,
        repo,
        headSha: sha,
        checkKey: PR_GATE_CHECK_KEY,
        status,
        conclusion: conclusion === "pending" ? undefined : conclusion,
        suiteKey: process.env.ORIGIN_SUITE_KEY ?? DEFAULT_SUITE_KEY,
        suiteName: process.env.ORIGIN_SUITE_NAME ?? DEFAULT_SUITE_NAME,
        suiteExternalId: process.env.ORIGIN_SUITE_EXTERNAL_ID ?? ids.suiteExternalId,
        checkExternalId: process.env.ORIGIN_CHECK_EXTERNAL_ID ?? ids.checkExternalId,
        detailsUrl: process.env.ORIGIN_DETAILS_URL || undefined,
        output: {
          title:
            conclusion === "success"
              ? "All PR checks passed"
              : conclusion === "failure"
                ? "One or more PR checks failed"
                : "PR checks running",
          summary: [
            state.passed.length ? `passed: ${state.passed.join(", ")}` : "",
            state.pending.length ? `pending: ${state.pending.join(", ")}` : "",
            state.failed.length ? `failed: ${state.failed.join(", ")}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      },
      client,
    );
    console.log(JSON.stringify({ conclusion, ...state }));
    if (conclusion === "failure") process.exit(1);
    if (conclusion === "pending" && hasFlag("--fail-pending")) process.exit(2);
    return;
  }

  if (command === "sticky-comment") {
    const pr = arg("--pr") || process.env.PR_NUMBER || "";
    if (!pr) usage();
    const bodyFile = arg("--body-file");
    const body = bodyFile === "-" || !bodyFile ? readFileSync(0, "utf8") : readFileSync(bodyFile, "utf8");
    const result = await upsertStickyComment(owner, repo, pr, body, client);
    console.log(JSON.stringify(result));
    return;
  }

  usage();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
