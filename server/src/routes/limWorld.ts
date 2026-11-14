import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { askLimWorld, type Complete } from "../lim/world";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(240),
  world: z
    .object({
      items: z.array(z.string().max(32)).max(8).default([]),
      place: z.string().max(32).default("studio"),
    })
    .default({ items: [], place: "studio" }),
});

/** POST /api/lim/world: what a chat message means for the mascot's toy world. */
export function createLimWorldRouter(deps: { complete?: Complete } = {}) {
  const router = new Hono();
  router.post("/world", zValidator("json", bodySchema), async (c) => {
    const { message, world } = c.req.valid("json");
    try {
      // A visitor who navigates away or hits Stop cancels the model call too.
      return c.json(await askLimWorld(message, world, deps.complete, undefined, c.req.raw.signal));
    } catch (err) {
      // The world is a nicety: the page falls back to the catalog and the chat.
      console.warn("[lim-world] unavailable:", err instanceof Error ? err.message : String(err));
      return c.json({ error: "unavailable" }, 503);
    }
  });
  return router;
}

export default createLimWorldRouter();
