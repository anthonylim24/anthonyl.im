import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import Groq from "groq-sdk";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { CHAT_COMPLETION_OPTIONS, SYSTEM_PROMPT } from "./constants";

const invoke = new Hono();

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8_000),
});

const invokeSchema = z.object({
  prompt: z.string().min(1, "Prompt is required").max(8_000),
  messages: z.array(messageSchema).max(40).optional(),
});

invoke.post("/", zValidator("json", invokeSchema), async (c) => {
  const { prompt, messages = [] } = await c.req.json();

  if (!prompt) {
    return c.json({ error: "Prompt is required" }, 400);
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  // System first so provider policy + persona bind before history.
  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      ...messages,
      {
        role: "user",
        content: prompt,
      },
    ],
    ...CHAT_COMPLETION_OPTIONS,
    stream: true,
  });

  return streamSSE(c, async (stream) => {
    try {
      for await (const chunk of completion) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          // JSON encode to preserve newlines and special characters
          await stream.writeSSE({
            data: JSON.stringify(content),
          });
        }
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
