import { afterEach, describe, expect, test } from "bun:test";
import { ANTHONY_MODEL, JELLY_MODEL, JEV_MODEL, JEV_URL, routeLimModel } from "./jev";
import { limGeminiModel } from "./model";

const world = { items: ["ball"], place: "studio" };
const jevSays = (choice: string, jelly = choice === "jelly" ? 0.9 : 0.1) =>
  new Response(JSON.stringify({ model: "jev-1.13.0", answers: { intent: { type: "choice", choice, confidence: 0.9, probabilities: { anthony: 1 - jelly, jelly } } } }));

describe("routeLimModel (Jev)", () => {
  afterEach(() => {
    delete process.env.LIM_GEMINI_MODEL;
  });

  test("questions about Anthony go to Hydrogen, playing with the jelly to Carbon", async () => {
    const anthony = await routeLimModel({ prompt: "Where has he worked?", world, apiKey: "K", fetchImpl: (async () => jevSays("anthony")) as unknown as typeof fetch });
    expect(anthony).toMatchObject({ model: ANTHONY_MODEL, route: "anthony", via: "jev" });
    expect(ANTHONY_MODEL).toBe("gemini-4-hydrogen");
    const jelly = await routeLimModel({ prompt: "kick the ball", world, apiKey: "K", fetchImpl: (async () => jevSays("jelly")) as unknown as typeof fetch });
    expect(jelly).toMatchObject({ model: JELLY_MODEL, route: "jelly", via: "jev", pJelly: 0.9 });
    expect(JELLY_MODEL).toBe("gemini-4-carbon");
  });

  test("sends one Choice question with the message, recent turns and the world", async () => {
    let call: { url: string; init: RequestInit } | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => ((call = { url, init }), jevSays("jelly"))) as unknown as typeof fetch;
    const messages = Array.from({ length: 6 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `m${i}` }));
    await routeLimModel({ prompt: "kick it", messages, world: { ...world, weather: "rain" }, apiKey: "K", fetchImpl });
    expect(call?.url).toBe(JEV_URL);
    expect((call?.init.headers as Record<string, string>).Authorization).toBe("Bearer K");
    const body = JSON.parse(String(call?.init.body));
    expect(body.model).toBe(JEV_MODEL);
    expect(Object.keys(body.questions)).toEqual(["intent"]);
    expect(body.questions.intent.type).toBe("choice");
    expect(Object.keys(body.questions.intent.criteria)).toEqual(["anthony", "jelly"]);
    expect(body.state.latest_message).toBe("kick it");
    expect(body.state.previous_messages.map((m: { content: string }) => m.content)).toEqual(["m2", "m3", "m4", "m5"]);
    expect(body.state.lim_toy_world).toEqual({ items: ["ball"], place: "studio", weather: "rain" });
  });

  test("no live toy world: Hydrogen, without asking Jev", async () => {
    let calls = 0;
    const fetchImpl = (async () => (calls++, jevSays("jelly"))) as unknown as typeof fetch;
    expect(await routeLimModel({ prompt: "give him a kite", apiKey: "K", fetchImpl })).toMatchObject({ model: ANTHONY_MODEL, via: "no-world" });
    expect(await routeLimModel({ prompt: "give him a kite", world: { ...world, unavailable: true }, apiKey: "K", fetchImpl })).toMatchObject({ model: ANTHONY_MODEL, via: "no-world" });
    expect(calls).toBe(0);
  });

  test("LIM_GEMINI_MODEL pins a model and skips Jev", async () => {
    process.env.LIM_GEMINI_MODEL = "gemini-4-argon";
    let calls = 0;
    const fetchImpl = (async () => (calls++, jevSays("jelly"))) as unknown as typeof fetch;
    expect(await routeLimModel({ prompt: "kick it", world, apiKey: "K", fetchImpl })).toMatchObject({ model: "gemini-4-argon", via: "pinned" });
    expect(calls).toBe(0);
  });

  test("no key, an error, a bad answer or a timeout falls back to the date default", async () => {
    expect(await routeLimModel({ prompt: "x", world, apiKey: "" })).toMatchObject({ model: limGeminiModel(), via: "no-key" });
    const status = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    expect(await routeLimModel({ prompt: "x", world, apiKey: "K", fetchImpl: status })).toMatchObject({ model: limGeminiModel(), via: "jev-failed" });
    const odd = (async () => jevSays("banana")) as unknown as typeof fetch;
    expect(await routeLimModel({ prompt: "x", world, apiKey: "K", fetchImpl: odd })).toMatchObject({ via: "jev-failed" });
    const hang = ((_: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)))) as unknown as typeof fetch;
    const aborted = new AbortController();
    setTimeout(() => aborted.abort(), 20);
    expect(await routeLimModel({ prompt: "x", world, apiKey: "K", fetchImpl: hang, signal: aborted.signal })).toMatchObject({ via: "jev-failed" });
  });
});
