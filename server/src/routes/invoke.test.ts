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

// We mock groq-sdk before importing invoke so the module picks up the mock.
mock.module("groq-sdk", () => {
  return {
    default: class MockGroq {
      chat = {
        completions: {
          create: async () => fakeGroqStream(["Hello", " world"]),
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
});
