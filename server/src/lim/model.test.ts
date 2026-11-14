import { afterEach, describe, expect, test } from "bun:test";
import { geminiText } from "../geminiText";
import { GEMINI_MODEL, resetGeminiModelFallback } from "../igPlaces/gemini";
import { LIM_MODEL_SWITCH_AT, limGeminiModel } from "./model";

const answer = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));

describe("limGeminiModel", () => {
  afterEach(() => {
    delete process.env.LIM_GEMINI_MODEL;
  });

  test("Carbon through December 1, 2026, Hydrogen after", () => {
    expect(limGeminiModel(Date.UTC(2026, 10, 13))).toBe("gemini-4-carbon");
    expect(limGeminiModel(Date.UTC(2026, 11, 1, 23, 59, 59))).toBe("gemini-4-carbon");
    expect(limGeminiModel(LIM_MODEL_SWITCH_AT)).toBe("gemini-4-hydrogen");
    expect(limGeminiModel(Date.UTC(2027, 0, 1))).toBe("gemini-4-hydrogen");
  });

  test("LIM_GEMINI_MODEL pins a model whatever the date", () => {
    process.env.LIM_GEMINI_MODEL = "gemini-4-argon";
    expect(limGeminiModel(Date.UTC(2026, 10, 13))).toBe("gemini-4-argon");
    expect(limGeminiModel(Date.UTC(2027, 0, 1))).toBe("gemini-4-argon");
  });
});

describe("geminiText with a per-call model", () => {
  afterEach(resetGeminiModelFallback);

  test("asks the requested model", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => (urls.push(url), answer("ok"))) as unknown as typeof fetch;
    await geminiText({ apiKey: "K", model: "gemini-4-carbon", system: "s", messages: [{ role: "user", content: "x" }], fetchImpl });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/models/gemini-4-carbon:generateContent");
  });

  test("steps down to the app model when the key cannot use the requested one", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return url.includes("gemini-4-carbon") ? new Response("models/gemini-4-carbon is not found", { status: 404 }) : answer("ok");
    }) as unknown as typeof fetch;
    const out = await geminiText({ apiKey: "K", model: "gemini-4-carbon", system: "s", messages: [{ role: "user", content: "x" }], fetchImpl });
    expect(out).toBe("ok");
    expect(urls[1]).toContain(`/models/${GEMINI_MODEL}:generateContent`);
  });

  test("a quota error on the requested model is an error (the caller's backup takes over)", async () => {
    const fetchImpl = (async () => new Response("quota", { status: 429 })) as unknown as typeof fetch;
    await expect(geminiText({ apiKey: "K", model: "gemini-4-carbon", system: "s", messages: [{ role: "user", content: "x" }], fetchImpl })).rejects.toThrow(/429/);
  });
});
