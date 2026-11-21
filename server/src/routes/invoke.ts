import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import Groq from "groq-sdk";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { SYSTEM_PROMPT } from "./constants";
import { geminiTextStream, type GeminiTurn } from "../geminiText";
import { GEMINI_MODEL } from "../igPlaces/gemini";
import { worldPrompt } from "../lim/world";

const invoke = new Hono();

const GROQ_MODEL = "openai/gpt-oss-120b";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8_000),
});

const invokeSchema = z.object({
  prompt: z.string().min(1, "Prompt is required").max(8_000),
  messages: z.array(messageSchema).max(40).optional(),
  /** Lim's toy world as the page has it. When present, the model may answer an order for it (lim/world.ts). */
  world: z
    .object({
      items: z.array(z.string().max(32)).max(8).default([]),
      place: z.string().max(32).default("studio"),
      weather: z.string().max(16).optional(),
      /** The page has no live 3D scene. */
      unavailable: z.boolean().optional(),
    })
    .optional(),
});

invoke.post("/", zValidator("json", invokeSchema), async (c) => {
  const { prompt, messages = [], world } = c.req.valid("json");
  const system = world ? SYSTEM_PROMPT + worldPrompt(world) : SYSTEM_PROMPT;
  const signal = c.req.raw.signal;

  return streamSSE(c, async (stream) => {
    try {
      const chunks = await openLimStream({ prompt, messages, system, signal });
      for await (const content of chunks) {
        // JSON encode to preserve newlines and special characters
        await stream.writeSSE({ data: JSON.stringify(content) });
      }
      await stream.writeSSE({ data: "[DONE]" });
    } catch (error) {
      // The visitor left: nobody is listening, and nothing failed.
      if (signal.aborted) return;
      console.error("[invoke] stream failed:", error instanceof Error ? error.message : String(error));
      await stream.writeSSE({
        data: JSON.stringify({ error: "Lim can't answer right now. Please try again in a moment." }),
      });
    }
  });
});

type LimRequest = {
  prompt: string;
  messages: GeminiTurn[];
  system: string;
  signal: AbortSignal;
};

/**
 * Lim answers on the app's Gemini model. If the Gemini stream cannot be
 * opened (no key, quota, outage), the previous model on Groq answers instead,
 * unless the visitor already left, when opening a second paid stream would
 * only bill for nobody.
 */
async function openLimStream({ prompt, messages, system, signal }: LimRequest): Promise<AsyncIterable<string>> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY missing");
    console.info(`[invoke] ${GEMINI_MODEL}`);
    return await geminiTextStream({
      apiKey,
      system,
      messages: [...messages, { role: "user", content: prompt }],
      signal: AbortSignal.any([AbortSignal.timeout(120_000), signal]),
    });
  } catch (err) {
    if (signal.aborted) throw err;
    console.warn("[invoke] gemini unavailable, using groq:", err instanceof Error ? err.message : String(err));
    return groqStream(prompt, messages, system, signal);
  }
}

async function groqStream(
  prompt: string,
  messages: GeminiTurn[],
  system: string,
  signal: AbortSignal,
): Promise<AsyncIterable<string>> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const completion = await groq.chat.completions.create(
    {
      messages: [{ role: "system", content: system }, ...messages, { role: "user", content: prompt }],
      max_completion_tokens: 2500,
      model: GROQ_MODEL,
      stream: true,
    },
    { signal: AbortSignal.any([AbortSignal.timeout(120_000), signal]) },
  );
  return (async function* () {
    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) yield content;
    }
  })();
}

export default invoke;
