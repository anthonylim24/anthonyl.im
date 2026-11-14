import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import { OpenAI } from "openai";
import Groq from "groq-sdk";
import { config } from "../config";
import { InvokeRequest } from "../types";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { commonConfig, SYSTEM_PROMPT } from "./constants";
import { geminiTextStream, type GeminiTurn } from "../geminiText";
import { limGeminiModel } from "../lim/model";
import { worldPrompt } from "../lim/world";

const invoke = new Hono();

const openai = new OpenAI({
  apiKey: config.deepseekApiKey,
  baseURL: config.deepseekApiBaseUrl,
});

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
    })
    .optional(),
});

invoke.post("/", zValidator("json", invokeSchema), async (c) => {
  const { prompt, messages = [], world } = c.req.valid("json");
  const system = world ? SYSTEM_PROMPT + worldPrompt(world) : SYSTEM_PROMPT;

  if (!prompt) {
    return c.json({ error: "Prompt is required" }, 400);
  }

  // Gemini leads (Carbon until the December switch, then Hydrogen: see
  // lim/model.ts). If its stream cannot be opened (no key, quota, outage),
  // the previous model on Groq answers instead.
  let chunks: AsyncIterable<string>;
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY missing");
    chunks = await geminiTextStream({
      apiKey,
      model: limGeminiModel(),
      system,
      messages: [...messages, { role: "user", content: prompt }],
      signal: AbortSignal.any([AbortSignal.timeout(120_000), c.req.raw.signal]),
    });
  } catch (err) {
    console.warn("[invoke] gemini unavailable, using groq:", err instanceof Error ? err.message : String(err));
    chunks = await groqStream(prompt, messages, system);
  }

  return streamSSE(c, async (stream) => {
    try {
      for await (const content of chunks) {
        // JSON encode to preserve newlines and special characters
        await stream.writeSSE({ data: JSON.stringify(content) });
      }
      await stream.writeSSE({ data: "[DONE]" });
    } catch (error) {
      if (c.req.raw.signal.aborted) return;
      console.error("Streaming error:", error);
      await stream.writeSSE({
        data: JSON.stringify({ error: "Streaming error occurred" }),
      });
    }
  });
});

async function groqStream(prompt: string, messages: GeminiTurn[], system: string): Promise<AsyncIterable<string>> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    messages: [...messages, { role: "system", content: system }, { role: "user", content: prompt }],
    model: GROQ_MODEL,
    stream: true,
  });
  return (async function* () {
    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) yield content;
    }
  })();
}

export default invoke;
