import { describe, expect, test } from "bun:test";
import { findStickyComment, upsertStickyComment } from "./commentPr";
import { createOriginClient } from "./client";
import { PREVIEW_COMMENT_MARKER } from "./types";

describe("findStickyComment", () => {
  test("matches the preview marker", () => {
    const hit = findStickyComment([
      { id: "1", body: "hello" },
      { id: "2", body: `${PREVIEW_COMMENT_MARKER}\n## Preview\n` },
    ]);
    expect(hit?.id).toBe("2");
  });
});

describe("upsertStickyComment", () => {
  test("patches an existing sticky comment", async () => {
    const methods: string[] = [];
    const client = createOriginClient({
      token: "oit_test",
      fetch: async (input, init) => {
        methods.push(`${init?.method ?? "GET"} ${String(input)}`);
        if (String(input).endsWith("/comments?pageSize=100")) {
          return Response.json({
            comments: [{ id: "cmt_1", body: `${PREVIEW_COMMENT_MARKER}\nold` }],
          });
        }
        return Response.json({ id: "cmt_1" });
      },
    });
    const result = await upsertStickyComment("acme", "site", "12", `${PREVIEW_COMMENT_MARKER}\nnew`, client);
    expect(result).toEqual({ id: "cmt_1", updated: true });
    expect(methods.some((line) => line.startsWith("PATCH "))).toBe(true);
  });

  test("creates a comment when none exists", async () => {
    const client = createOriginClient({
      token: "oit_test",
      fetch: async (_input, init) => {
        if ((init?.method ?? "GET") === "GET") {
          return Response.json({ comments: [] });
        }
        return Response.json({ id: "cmt_new" });
      },
    });
    const result = await upsertStickyComment("acme", "site", "12", `${PREVIEW_COMMENT_MARKER}\nnew`, client);
    expect(result).toEqual({ id: "cmt_new", updated: false });
  });
});
