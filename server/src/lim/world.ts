/**
 * Lim's world, server side: one small model call that reads a visitor's
 * message and answers with ops for the mascot's toy world (drop an item,
 * change the place, do something, tidy up), inventing an item or place spec
 * when the catalog has nothing that fits. Specs are a few dozen numbers, so
 * the call is cheap and fast; answers are cached.
 *
 * The catalog ids and enums mirror `frontend/src/chat/world/spec.ts`
 * (`world.test.ts` checks they have not drifted). This side guards size and
 * types; the client clamps every value before using it.
 */
import Groq from "groq-sdk";
import { z } from "zod";
import { geminiText } from "../geminiText";

export const ITEM_IDS = [
  "bean", "gumball", "ball", "apple", "donut", "cupcake", "chili", "party hat", "crown", "sunglasses",
  "teddy", "pillow", "drum", "balloon", "duck", "cactus", "ghost", "ice cube", "star", "heart",
] as const;
export const PLACE_IDS = ["beach", "snow", "space", "meadow", "underwater", "volcano", "haunted", "disco"] as const;
export const SHAPES = ["ball", "box", "cylinder", "cone", "disc", "drop", "star", "heart", "bean", "ring"] as const;
export const TRAITS = [
  "edible", "bouncy", "heavy", "floaty", "hat", "glasses", "soft", "cozy", "musical", "scary", "hot", "cold", "glowing", "prickly",
] as const;
export const ACTIONS = ["look", "kick", "bounce", "eat", "wear", "hug", "nap", "dance", "remove"] as const;

export const SYSTEM = `You run the toy world of Lim, a small coral jelly mascot on a personal website. A visitor's message may ask to give Lim an item, change the place Lim is in, have Lim do something with an item, or tidy up. Answer with ONE JSON object and nothing else:
{"ops":[...],"reply":"...","chat":false}

ops: 0 to 3 entries, in order.
- {"op":"item","id":"<catalog item>"}  or  {"op":"item","spec":ITEM}. Optional "then":ACTION to do right after it lands.
- {"op":"place","id":"<catalog place>"}  or  {"op":"place","spec":PLACE}. "id":"studio" goes back to Lim's own room.
- {"op":"tweak","set":{"weather":"rain"}} changes the air without going anywhere. "set" may hold any of: "weather" (none|snow|rain|bubbles|leaves|petals|fireflies|embers), "weatherColor", "gravity" (0.25-1.4), "slippery", "dark". Use it for "make it rain", "low gravity", "make it night".
- {"op":"act","action":ACTION,"target":"<name of an item in the world>"}
- {"op":"clear","what":"items"|"place"|"all"}

Catalog items: ${ITEM_IDS.join(", ")}.
Catalog places: ${PLACE_IDS.join(", ")}, studio.
Use a catalog id when one fits what was asked. Otherwise invent a spec.
Do only what the message asks: no extra ops, and never a place op unless the message asks to go somewhere.

ITEM = {"name":"1-3 words","size":0.8-1.7,"traits":[...],"face":-1,"parts":[PART,...]}
PART = {"shape":S,"color":"#RRGGBB","at":[x,y,z],"scale":[x,y,z],"tilt":degrees}
- 1 to 6 parts. The first part is the body, at [0,0,0]. Other parts are placed relative to it in body radii: x right, y up, z toward the viewer. "scale" is each part's half-size in body radii (the body is about [1,1,1]). "tilt" leans a part left/right.
- S is one of: ${SHAPES.join(", ")}. cone points up; disc lies flat like a plate; ring faces the viewer like a donut; drop is a teardrop, point up.
- traits, any that apply (they decide what Lim can do with it): ${TRAITS.join(", ")}. "hat" sits on Lim's head, "glasses" on its face, "cozy" is for napping on. "floaty" is ONLY for things that hang in the air by themselves (balloon, cloud, bubble, ghost, kite); everything else rests on the floor.
- Parts may not hang below the body by much: put the biggest, lowest part first.
- "face": index of a part to give two cute eyes (animals, creatures), or -1.
- Look: chunky, simple, cute; soft candy colours (no pure black, no neon). Use 3 to 6 parts so the thing is recognisable from its silhouette: think toy blocks. Give animals and creatures a head part and set "face" to its index.

PLACE = {"name":"1-2 words","sky":["#top","#bottom"],"floor":"#hex","dots":"#hex","rug":"#hex","pattern":"dots|stripes|checks|waves|plain","horizon":"none|hills|dunes|waves|mountains|city|trees|wall","horizonColor":"#hex","orb":"none|sun|moon|planet","orbColor":"#hex","stars":false,"weather":"none|snow|rain|bubbles|leaves|petals|fireflies|embers","weatherColor":"#hex","gravity":1,"slippery":false,"dark":false,"mood":"calm|cozy|cold|hot|floaty|wet|spooky|party"}
- gravity 0.25 (floaty) to 1.4 (heavy). "dark": true for night scenes. "dots" is the floor pattern colour (different from "floor"), "rug" the mat Lim stands on.
- Make it feel like somewhere: pick a horizon ("wall" for indoor rooms, never "none" outdoors), a sky gradient with two different colours, weather when it suits, and a mood.

ACTION = ${ACTIONS.join(" | ")}

"reply": one short playful sentence said BY Lim (first person; Lim is a limbless jelly blob), 12 words at most. Always include it when there are ops.
"chat": true only when the message also asks a real question that still needs an answer. If the message is not about Lim's world at all, answer {"ops":[],"reply":"","chat":true}.
Keep it friendly for all ages: no realistic weapons, gore, or anything sexual or hateful. Offer a silly harmless version instead (a foam sword, a squirt toy), or no ops.

Examples.
Message "make it rain" ->
{"ops":[{"op":"tweak","set":{"weather":"rain","weatherColor":"#9CC7EE"}}],"reply":"Drip drop! I love puddles.","chat":false}
Message "take him to a candy land" ->
{"ops":[{"op":"place","spec":{"name":"candy land","sky":["#FFC7E3","#FFF3C4"],"floor":"#FFE1EC","dots":"#FF9FC5","rug":"#B9F0D8","pattern":"stripes","horizon":"hills","horizonColor":"#FFB0D0","orb":"sun","orbColor":"#FFE27A","stars":false,"weather":"petals","weatherColor":"#FFFFFF","gravity":0.9,"slippery":false,"dark":false,"mood":"party"}}],"reply":"Everything here looks delicious!","chat":false}
Message "give lim a snail" ->
{"ops":[{"op":"item","spec":{"name":"snail","size":1,"traits":["soft"],"face":2,"parts":[{"shape":"bean","color":"#B9E59B","at":[0,0,0],"scale":[1.3,0.5,0.6],"tilt":0},{"shape":"ring","color":"#F3A46B","at":[-0.2,0.75,0],"scale":[0.8,0.8,0.5],"tilt":0},{"shape":"ball","color":"#B9E59B","at":[1.05,0.5,0],"scale":[0.45,0.45,0.42],"tilt":0},{"shape":"cylinder","color":"#B9E59B","at":[1.2,1.05,0.15],"scale":[0.06,0.3,0.06],"tilt":-12}]}}],"reply":"Slow and steady, new buddy!","chat":false}`;

const short = z.string().max(48);
const num = z.number().finite();
const vec = z.array(num).max(3);
const partSchema = z.object({ shape: short, color: short, at: vec.optional(), scale: z.union([vec, num]).optional(), tilt: num.optional() }).passthrough();
const itemSchema = z.object({
  name: short.optional(),
  size: num.optional(),
  traits: z.array(short).max(8).optional(),
  face: num.optional(),
  parts: z.array(partSchema).min(1).max(8),
});
const placeSchema = z.record(z.string().max(24), z.union([short, num, z.boolean(), z.array(short).max(2)]));
const opSchema = z.object({
  op: z.enum(["item", "place", "tweak", "act", "clear"]),
  id: short.optional(),
  spec: z.unknown().optional(),
  then: short.optional(),
  action: short.optional(),
  target: short.optional(),
  what: short.optional(),
  set: z.record(z.string().max(24), z.union([short, num, z.boolean()])).optional(),
});

export type LimWorldAnswer = { ops: z.infer<typeof opSchema>[]; reply: string; chat: boolean };
export const NOTHING: LimWorldAnswer = { ops: [], reply: "", chat: true };

/** The first JSON object in a model answer (fences and chatter around it are ignored). */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Whatever the model said, as a bounded, well-typed answer. Never throws. */
export function readAnswer(text: string): LimWorldAnswer {
  if (text.length > 12_000) return NOTHING;
  const raw = extractJson(text);
  if (!raw || typeof raw !== "object") return NOTHING;
  const o = raw as Record<string, unknown>;
  const ops: LimWorldAnswer["ops"] = [];
  for (const entry of Array.isArray(o.ops) ? o.ops.slice(0, 3) : []) {
    const op = opSchema.safeParse(entry);
    if (!op.success) continue;
    if (op.data.spec !== undefined) {
      const spec = (op.data.op === "item" ? itemSchema : placeSchema).safeParse(op.data.spec);
      if (!spec.success) continue;
      op.data.spec = spec.data;
    }
    ops.push(op.data);
  }
  const reply = typeof o.reply === "string" ? o.reply.replace(/\s+/g, " ").trim().slice(0, 140) : "";
  return { ops, reply, chat: ops.length === 0 ? true : o.chat === true };
}

export type Complete = (system: string, user: string, signal: AbortSignal) => Promise<string>;

// Groq models, best first. The larger one is fast enough to feel instant and
// better at building things from parts; the smaller one takes over the moment
// the larger is rate-limited or down (each has its own quota). No SDK retries:
// a retry waits out the rate limit, and a toy is not worth a ten-second wait.
const GROQ_MODELS = (process.env.LIM_WORLD_MODELS || "openai/gpt-oss-120b,openai/gpt-oss-20b").split(",").map((m) => m.trim()).filter(Boolean);
const ATTEMPT_MS = 3_000;

/** Groq first (two models), then the app's Gemini model. Throws when none can answer. */
export const complete: Complete = async (system, user, signal) => {
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!groqKey && !geminiKey) throw new Error("no model configured");
  let last: unknown = new Error("no model answered");
  if (groqKey) {
    const groq = new Groq({ apiKey: groqKey, maxRetries: 0 });
    for (const model of GROQ_MODELS) {
      if (signal.aborted) break;
      try {
        const res = await groq.chat.completions.create(
          {
            model,
            messages: [{ role: "system", content: system }, { role: "user", content: user }],
            response_format: { type: "json_object" },
            temperature: 0.5,
            max_completion_tokens: 1100,
            reasoning_effort: "low",
          } as Parameters<typeof groq.chat.completions.create>[0],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(ATTEMPT_MS)]) },
        );
        const text = "choices" in res ? res.choices[0]?.message?.content : "";
        if (text) return text;
        last = new Error(`${model} returned an empty answer`);
      } catch (err) {
        last = err;
        console.warn(`[lim-world] ${model} failed:`, err instanceof Error ? err.message.slice(0, 160) : String(err));
      }
    }
  }
  if (geminiKey && !signal.aborted) {
    return geminiText({ apiKey: geminiKey, system, messages: [{ role: "user", content: user }], json: true, maxOutputTokens: 900, signal });
  }
  throw last;
};

const cache = new Map<string, LimWorldAnswer>();
const CACHE_MAX = 300;

export type WorldState = { items: string[]; place: string };

const norm = (message: string) => message.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * What a message means for the world. Cached on the message alone unless the
 * answer acts on something already there (then what is there matters too), so
 * "give him a kite" costs one call however the world looks.
 */
export async function askLimWorld(message: string, world: WorldState, run: Complete = complete, timeoutMs = 7_000, outer?: AbortSignal): Promise<LimWorldAnswer> {
  const plain = norm(message);
  const exact = JSON.stringify([plain, world.items, world.place]);
  for (const key of [plain, exact]) {
    const hit = cache.get(key);
    if (hit) {
      // Refresh its place in the queue.
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
  }
  const signal = outer ? AbortSignal.any([outer, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  const text = await run(SYSTEM, JSON.stringify({ message, world }), signal);
  const answer = readAnswer(text);
  // Only keep answers that did something; a miss may be a model hiccup.
  if (answer.ops.length) {
    const dependsOnWorld = answer.ops.some((op) => op.op === "act" || op.op === "clear");
    cache.set(dependsOnWorld ? exact : plain, answer);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  }
  return answer;
}

export const clearLimWorldCache = () => cache.clear();
