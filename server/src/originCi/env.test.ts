import { describe, expect, test } from "bun:test";
import { attemptIds, readHeadSha, readOriginRepo, readOriginToken } from "./env";

describe("origin env", () => {
  test("prefers the installation token", () => {
    expect(readOriginToken({ ORIGIN_INSTALLATION_TOKEN: "oit_1", ORIGIN_TOKEN: "other" })).toBe("oit_1");
  });

  test("parses owner/repo slugs", () => {
    expect(readOriginRepo({ ORIGIN_OWNER: "acme", ORIGIN_REPO: "site" })).toEqual({
      owner: "acme",
      repo: "site",
    });
    expect(readOriginRepo({ ORIGIN_REPO_SLUG: "acme/site" })).toEqual({ owner: "acme", repo: "site" });
  });

  test("rejects a short SHA", () => {
    expect(() => readHeadSha({ ORIGIN_HEAD_SHA: "abc" })).toThrow(/SHA/);
    expect(readHeadSha({ ORIGIN_HEAD_SHA: "a".repeat(40) })).toHaveLength(40);
  });

  test("builds stable attempt ids", () => {
    const ids = attemptIds("pr-gate", "a".repeat(40), "run-9");
    expect(ids.checkExternalId).toBe(`pr-gate-${"a".repeat(40)}-run-9`);
  });
});
