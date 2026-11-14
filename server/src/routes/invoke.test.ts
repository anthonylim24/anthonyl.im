import { test, expect, describe, mock, afterEach } from "bun:test";
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

// We mock groq-sdk before importing invoke so the module picks up the mock.
mock.module("groq-sdk", () => {
  return {
    default: class MockGroq {
      chat = {
        completions: {
          create: async (args: { messages: { role: string; content: string }[] }) => {
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
});
