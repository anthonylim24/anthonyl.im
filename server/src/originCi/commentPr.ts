import { createOriginClient, repoPath, type OriginClient } from "./client";
import { PREVIEW_COMMENT_MARKER, type OriginClientOptions } from "./types";

export type OriginComment = {
  id: string;
  body: string;
  thread?: { id: string };
};

export type ListCommentsResponse = {
  comments: OriginComment[];
  nextPageToken?: string;
};

export async function listPullRequestComments(
  owner: string,
  repo: string,
  pullNumber: string,
  clientOrOpts: OriginClient | OriginClientOptions,
): Promise<OriginComment[]> {
  const client = "request" in clientOrOpts ? clientOrOpts : createOriginClient(clientOrOpts);
  const comments: OriginComment[] = [];
  let pageToken = "";
  for (let i = 0; i < 20; i++) {
    const qs = new URLSearchParams({ pageSize: "100" });
    if (pageToken) qs.set("pageToken", pageToken);
    const page = await client.get<ListCommentsResponse>(
      `${repoPath(owner, repo)}/pulls/${encodeURIComponent(pullNumber)}/comments?${qs}`,
    );
    comments.push(...(page.comments ?? []));
    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }
  return comments;
}

export function findStickyComment(
  comments: OriginComment[],
  marker = PREVIEW_COMMENT_MARKER,
): OriginComment | undefined {
  return comments.find((comment) => comment.body.includes(marker));
}

export async function upsertStickyComment(
  owner: string,
  repo: string,
  pullNumber: string,
  body: string,
  clientOrOpts: OriginClient | OriginClientOptions,
  marker = PREVIEW_COMMENT_MARKER,
): Promise<{ id: string; updated: boolean }> {
  const client = "request" in clientOrOpts ? clientOrOpts : createOriginClient(clientOrOpts);
  const existing = findStickyComment(
    await listPullRequestComments(owner, repo, pullNumber, client),
    marker,
  );
  if (existing) {
    await client.patch(`${repoPath(owner, repo)}/pulls/comments/${encodeURIComponent(existing.id)}`, {
      body,
    });
    return { id: existing.id, updated: true };
  }
  const created = await client.post<{ id: string }>(
    `${repoPath(owner, repo)}/pulls/${encodeURIComponent(pullNumber)}/comments`,
    { body },
  );
  return { id: created.id, updated: false };
}
