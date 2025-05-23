import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import { OpenAI } from "openai";
import Groq from "groq-sdk";
import { config } from "../config";
import { InvokeRequest } from "../types";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { commonConfig, SYSTEM_PROMPT } from "./constants";

const invoke = new Hono();

const openai = new OpenAI({
  apiKey: config.deepseekApiKey,
  baseURL: config.deepseekApiBaseUrl,
});

const GROQ_MODEL = "meta-llama/llama-4-maverick-17b-128e-instruct";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const invokeSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  messages: z.array(messageSchema).optional(),
});

invoke.post("/", zValidator("json", invokeSchema), async (c) => {
  const { prompt, messages = [] } = await c.req.json();

  if (!prompt) {
    return c.json({ error: "Prompt is required" }, 400);
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  // Include previous messages in the chat context
  const completion = await groq.chat.completions.create({
    messages: [
      ...messages,
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    model: GROQ_MODEL,
    stream: true,
  });

  return streamSSE(c, async (stream) => {
    try {
      for await (const chunk of completion) {
        const content = chunk.choices[0]?.delta?.content || "";
        await stream.writeSSE({
          data: content,
        });
      }
      await stream.writeSSE({
        data: "[DONE]",
      });
    } catch (error) {
      console.error("Streaming error:", error);
      await stream.writeSSE({
        data: JSON.stringify({ error: "Streaming error occurred" }),
      });
    }
  });
});

export default invoke;
