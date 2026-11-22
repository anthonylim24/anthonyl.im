import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";

// Build a fake async-iterable of Groq chunks
function fakeGroqStream(contents: string[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const text of contents) {
        yield { choices: [{ delta: { content: text } }] };
      }
    },
  };
}

let lastGroqMessages: { role: string; content: string }[] = [];
let groqCalls = 0;
let groqFails = false;
let lastGroqSignal: AbortSignal | undefined;

// We mock groq-sdk before importing invoke so the module picks up the mock.
mock.module("groq-sdk", () => {
  return {
    default: class MockGroq {
      chat = {
        completions: {
          create: async (args: { messages: { role: string; content: string }[] }, opts?: { signal?: AbortSignal }) => {
            groqCalls++;
            lastGroqSignal = opts?.signal;
            if (groqFails) throw new Error("groq 503");
            lastGroqMessages = args.messages;
            return fakeGroqStream(["Hello", " world"]);
          },
        },
      };
    },
  };
});

// Import invoke AFTER mock is set up
const { default: invoke } = await import("./invoke");

function makeApp() {
  return new Hono().route("/api/invoke", invoke);
}

// These tests mean "Gemini and Jev are not configured, so the mocked Groq
// answers". The route reads both keys from process.env per request, and Bun
// fills that from the repo's .env, so on a machine with GEMINI_API_KEY the
// route would ask the real Gemini (and, with a world, the real Jev) instead.
// Clear them for each test, and fail any test that still reaches the network:
// the Groq fallback would otherwise swallow a stray call and stay green.
const MODEL_KEYS = ["GEMINI_API_KEY", "JEV_API_KEY"] as const;
const savedKeys = MODEL_KEYS.map((key) => [key, process.env[key]] as const);
const realFetch = globalThis.fetch;
let outbound: string[] = [];

beforeEach(() => {
  for (const key of MODEL_KEYS) delete process.env[key];
  outbound = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    outbound.push(url);
    throw new TypeError(`unexpected network call in invoke.test.ts: ${url}`);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const [key, value] of savedKeys) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  expect(outbound).toEqual([]);
});

describe("POST /api/invoke", () => {
  test("missing prompt returns 400", async () => {
    const res = await makeApp().request("/api/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    expect(res.status).toBe(400);
  });

  test("oversize messages array (41 entries) returns 400", async () => {
    const messages = Array.from({ length: 41 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "hi",
    }));
    const res = await makeApp().request("/api/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hello", messages }),
    });
    expect(res.status).toBe(400);
  });

  test("happy path streams data: chunks ending with [DONE]", async () => {
    const res = await makeApp().request("/api/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "say hi" }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain(`data: ${JSON.stringify("Hello")}`);
    expect(text).toContain(`data: ${JSON.stringify(" world")}`);
    expect(text).toContain("data: [DONE]");
  });

  const systemFor = async (body: unknown) => {
    const res = await makeApp().request("/api/invoke", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await res.text();
    return { status: res.status, system: lastGroqMessages.find((m) => m.role === "system")?.content ?? "" };
  };

  test("the toy world rides along only when the page sends it", async () => {
    const plain = await systemFor({ prompt: "who is he?" });
    expect(plain.system).not.toContain("@@world");
    const withWorld = await systemFor({ prompt: "give him a kite", world: { items: ["ball"], place: "beach", weather: "rain" } });
    expect(withWorld.status).toBe(200);
    expect(withWorld.system.startsWith(plain.system)).toBe(true);
    expect(withWorld.system).toContain("@@world");
    expect(withWorld.system).toContain('{"items":["ball"],"place":"beach","weather":"rain"}');
    const noScene = await systemFor({ prompt: "give him a kite", world: { unavailable: true } });
    expect(noScene.system).not.toContain('"ops"');
    expect(noScene.system).toContain("isn't up right now");
  });

  test("bounds the world it is sent", async () => {
    expect((await systemFor({ prompt: "x", world: { items: Array(9).fill("a"), place: "studio" } })).status).toBe(400);
    expect((await systemFor({ prompt: "x", world: { items: ["a".repeat(33)], place: "studio" } })).status).toBe(400);
    expect((await systemFor({ prompt: "x", world: { items: [], place: "p".repeat(33) } })).status).toBe(400);
  });

  test("a Groq open failure is an SSE error event, not a JSON 500", async () => {
    groqFails = true;
    try {
      const res = await makeApp().request("/api/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "say hi" }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      const text = await res.text();
      expect(text).toContain('data: {"error":');
      expect(text).not.toContain("[DONE]");
    } finally {
      groqFails = false;
    }
  });

  test("passes the request's abort signal to Groq", async () => {
    await (await makeApp().request("/api/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "say hi" }),
    })).text();
    expect(lastGroqSignal).toBeInstanceOf(AbortSignal);
  });

  test("does not fall back to Groq when the visitor already left", async () => {
    const before = groqCalls;
    const res = await makeApp().request("/api/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "say hi" }),
      signal: AbortSignal.abort(),
    });
    await res.text().catch(() => "");
    expect(groqCalls).toBe(before);
  });
});
