import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ACTIONS, ITEM_IDS, PLACE_IDS, SHAPES, TRAITS, WORLD_MARK, worldPrompt } from "./world";

describe("worldPrompt", () => {
  const prompt = worldPrompt({ items: ["apple", 'a "quoted" thing'], place: "beach", weather: "rain" });

  test("tells the model how to answer an order, and when not to", () => {
    expect(prompt).toContain(`${WORLD_MARK} {"ops":[...],"reply":"..."}`);
    expect(prompt).toContain("When unsure, answer normally.");
    expect(prompt).toContain("give him a break");
    for (const id of [...ITEM_IDS, ...PLACE_IDS, ...SHAPES, ...TRAITS, ...ACTIONS]) expect(prompt).toContain(id);
  });

  test("carries the world as data", () => {
    expect(prompt).toContain('In the world right now: {"items":["apple","a \\"quoted\\" thing"],"place":"beach","weather":"rain"}');
  });

  test("every example answer is valid JSON behind the marker", () => {
    const lines = prompt.split("\n").filter((line) => line.startsWith(`${WORLD_MARK} {"ops":[{`));
    expect(lines.length).toBeGreaterThanOrEqual(4);
    for (const line of lines) {
      const parsed = JSON.parse(line.slice(WORLD_MARK.length));
      expect(Array.isArray(parsed.ops)).toBe(true);
      expect(typeof parsed.reply).toBe("string");
    }
  });
});

describe("catalog parity with the frontend", () => {
  const spec = readFileSync(join(import.meta.dir, "../../../frontend/src/chat/world/spec.ts"), "utf8");
  const list = (name: string) => {
    const m = new RegExp(`export const ${name} = \\[([^\\]]*)\\]`, "s").exec(spec);
    return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
  };
  const keys = (block: string) => {
    const start = spec.indexOf(`export const ${block}:`);
    const body = spec.slice(start, spec.indexOf("\n}\n", start));
    return [...body.matchAll(/^  (?:'([^']+)'|([a-z]+)): \{/gm)].map((x) => x[1] ?? x[2]);
  };

  test("enums match", () => {
    expect(list("SHAPES")).toEqual([...SHAPES]);
    expect(list("TRAITS")).toEqual([...TRAITS]);
    expect(list("ACTIONS")).toEqual([...ACTIONS]);
  });

  test("catalog ids match", () => {
    expect(keys("ITEMS")).toEqual([...ITEM_IDS]);
    expect(keys("PLACES")).toEqual([...PLACE_IDS]);
  });

  test("the marker matches", () => {
    expect(spec).toContain(`export const WORLD_MARK = '${WORLD_MARK}'`);
  });
});
