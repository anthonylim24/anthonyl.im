import { describe, expect, it } from "vitest";
import { stripThink, stripTrailingPartialTag } from "../stripThink";

describe("stripTrailingPartialTag", () => {
  it("strips a trailing partial open tag", () => {
    expect(stripTrailingPartialTag("Hi\n<th")).toBe("Hi\n");
  });

  it("leaves complete tags alone", () => {
    expect(stripTrailingPartialTag("<think>x</think>y")).toBe("<think>x</think>y");
  });
});

describe("stripThink", () => {
  it("passes through content with no think tags", () => {
    expect(stripThink("Hello", false)).toEqual({
      think: null,
      main: "Hello",
      thinking: false,
    });
  });

  it("splits a complete think block", () => {
    const result = stripThink("<think>plan</think>\n\nAnswer", false);
    expect(result.think).toBe("plan");
    expect(result.main).toBe("Answer");
    expect(result.thinking).toBe(false);
  });

  it("hides incomplete think while streaming without leaking tags", () => {
    const result = stripThink("<think>still going", true);
    expect(result.thinking).toBe(true);
    expect(result.main).toBe("");
    expect(result.think).toBe("still going");
    expect(`${result.main}${result.think ?? ""}`).not.toMatch(/<\/?think/);
  });

  it("strips trailing partial open tag while streaming", () => {
    const result = stripThink("Hi\n<th", true);
    expect(result.main).toBe("Hi\n");
    expect(result.thinking).toBe(false);
  });

  it("strips trailing partial close tag inside an open think", () => {
    const result = stripThink("<think>x</thi", true);
    expect(result.thinking).toBe(true);
    expect(result.think).toBe("x");
  });

  it("does not leak tags when the stream ends without a close", () => {
    const result = stripThink("<think>orphan", false);
    expect(result.main).not.toContain("<think>");
    expect(result.think).toBe("orphan");
    expect(result.thinking).toBe(true);
  });
});
