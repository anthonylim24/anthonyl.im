import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import Groq from "groq-sdk";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { SYSTEM_PROMPT } from "./constants";
import type { Bindings } from "../types";

const invoke = new Hono<{ Bindings: Bindings }>();

const GROQ_MODEL = "moonshotai/kimi-k2-instruct-0905";

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

  const groq = new Groq({ apiKey: c.env.GROQ_API_KEY });

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
        if (content) {
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
