// /api/entity/about — dossier-voice description for a place / person /
// thing the traveler will encounter on the Korea trip.
//
// Two-tier cache to keep inference cost low (free Groq tier):
//
//   L1 — in-process Map<key, response>. Survives until the server
//        restarts. Sub-millisecond hits.
//
//   L2 — Supabase `korea_entity_about` table. Survives restarts and
//        is shared across all server replicas (when we eventually
//        scale beyond one). Read on L1 miss; write whenever Groq
//        produces a fresh description.
//
// LLM call only happens on a true cache miss. We use Groq's
// `llama-3.1-8b-instant` (10× cheaper than gpt-oss-120b at this prompt
// size), with strict JSON-mode output and a hard token cap.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import Groq from "groq-sdk";

const entity = new Hono();

const ENTITY_TYPES = [
  "flight",
  "hotel",
  "restaurant",
  "cafe",
  "bar",
  "city",
  "neighborhood",
  "palace",
  "museum",
  "shrine",
  "market",
  "shopping",
  "park",
  "viewpoint",
  "experience",
  "venue",
  "station",
  "transit",
  "airport",
  "place",
  "person",
] as const;

const entityAboutSchema = z.object({
  name: z.string().min(1, "name is required").max(120),
  type: z.enum(ENTITY_TYPES),
  city: z.string().max(60).optional(),
  context: z.string().max(280).optional(),
});

type EntityAboutRequest = z.infer<typeof entityAboutSchema>;

interface EntityAboutResponse {
  description: string | null;
  cached?: "memory" | "db" | "fresh";
}

// L1 cache — in-process. Fastest tier; lives until the process restarts.
const memoryCache = new Map<string, string | null>();

function cacheKey(req: EntityAboutRequest): string {
  return `${req.type}|${req.name.toLowerCase().trim()}|${(req.city ?? "").toLowerCase().trim()}`;
}

// ── L2: Supabase REST API ─────────────────────────────────────────────
// Uses fetch directly rather than pulling in @supabase/supabase-js — the
// surface we need is tiny (one read, one upsert) and avoiding a runtime
// dep keeps the server lean. Service-role key required (bypasses RLS so
// the server can write).

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function supabaseAvailable(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

async function dbRead(key: string): Promise<string | null | undefined> {
  if (!supabaseAvailable()) return undefined; // distinct from null = "we know there's no description"
  try {
    const url = `${SUPABASE_URL}/rest/v1/korea_entity_about?key=eq.${encodeURIComponent(key)}&select=description`;
    const r = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY!,
        Authorization: `Bearer ${SUPABASE_KEY!}`,
        Accept: "application/json",
      },
    });
    if (!r.ok) return undefined;
    const rows = (await r.json()) as Array<{ description: string | null }>;
    if (!rows.length) return undefined;
    return rows[0].description ?? null;
  } catch (err) {
    console.warn("[entity/about] supabase read error:", err);
    return undefined;
  }
}

async function dbWrite(key: string, description: string | null): Promise<void> {
  if (!supabaseAvailable()) return;
  try {
    const url = `${SUPABASE_URL}/rest/v1/korea_entity_about?on_conflict=key`;
    await fetch(url, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY!,
        Authorization: `Bearer ${SUPABASE_KEY!}`,
        "Content-Type": "application/json",
        // Upsert: replace existing row on key conflict instead of erroring.
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ key, description }),
    });
  } catch (err) {
    console.warn("[entity/about] supabase write error:", err);
  }
}

// ── L3: LLM ───────────────────────────────────────────────────────────
//
// Prompt pinned to dossier voice. JSON-mode output, 200-char cap, anti-
// slop directives. Llama 3.1 8B is the cheapest viable Groq model that
// still produces decent prose at this scale.

const SYSTEM_PROMPT = `You are an editor for a private travel dossier covering a Seoul + Busan trip in 2026.

Your job: write a single, concise, FACTUAL description of a place, person, or thing the traveler will encounter. Tone: refined, slightly literary, like Monocle's travel guide. Not marketing-y, not boring.

OUTPUT: JSON only. Shape: {"description": "..."}.

CONSTRAINTS:
- Maximum 200 characters in the description.
- 1 to 2 sentences total.
- No superlatives ("amazing", "best", "must-see", "world-class", "iconic"). Plain facts.
- No exclamation points. No travel-blog clichés.
- No em dashes. Use commas, semicolons, colons, or periods.
- If you do not know specific details, do NOT invent them. Write only what you confidently know.
- If you know nothing useful about the input, respond with {"description": null}.
- Do not include URLs, addresses, or phone numbers in the description.
- Do not greet, do not apologize, do not preface ("Here is...", "This is...").

GOOD EXAMPLES:
Input: type="hotel", name="Park Hyatt Seoul", city="Seoul"
Output: {"description": "Glass-and-stone tower in Gangnam's commercial district. Quiet rooms, a top-floor pool, and a long-standing Italian restaurant on the 24th floor."}

Input: type="cafe", name="Anthracite Coffee", city="Seoul"
Output: {"description": "Specialty roaster occupying a converted shoe factory in Hapjeong. House-roasted single origins; the original Hannam-dong branch helped seed Seoul's third-wave coffee scene."}

Input: type="palace", name="Gyeongbokgung", city="Seoul"
Output: {"description": "The largest of Seoul's five Joseon-era palaces. Changing of the guard ceremony daily at Gwanghwamun; hanbok wearers enter without paying admission."}

Input: type="neighborhood", name="Seongsu", city="Seoul"
Output: {"description": "Former industrial district east of Hannam now full of converted warehouses housing roasters, ateliers, and the Korean fashion brands that haven't picked Gangnam yet."}

Input: type="flight", name="UA 893"
Output: {"description": "United's daily nonstop SFO to Incheon on a 777-300ER. Roughly 13 hours westbound, 11 hours back."}`;

const GROQ_MODEL = "llama-3.1-8b-instant";

async function generateDescription(req: EntityAboutRequest): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn("[entity/about] GROQ_API_KEY missing; skipping LLM");
    return null;
  }
  const groq = new Groq({ apiKey });

  const userParts: string[] = [`type="${req.type}"`, `name="${req.name}"`];
  if (req.city) userParts.push(`city="${req.city}"`);
  if (req.context) userParts.push(`context="${req.context}"`);
  const userPrompt = userParts.join(", ");

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 160,
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { description?: string | null };
    let desc = parsed.description?.trim() ?? null;
    if (!desc) return null;
    // Defensive cleanup. Strip stray em dashes, collapse whitespace,
    // cap at 220 chars on a sentence boundary if possible.
    desc = desc.replace(/—/g, ",").replace(/\s+/g, " ").trim();
    if (desc.length > 220) {
      const cut = desc.slice(0, 220);
      const lastStop = Math.max(cut.lastIndexOf("."), cut.lastIndexOf(";"));
      desc = (lastStop > 80 ? cut.slice(0, lastStop + 1) : cut).trim();
    }
    return desc;
  } catch (err) {
    console.warn("[entity/about] groq error:", err);
    return null;
  }
}

entity.post("/about", zValidator("json", entityAboutSchema), async (c) => {
  const body = (await c.req.json()) as EntityAboutRequest;
  const key = cacheKey(body);

  // L1
  if (memoryCache.has(key)) {
    return c.json<EntityAboutResponse>({ description: memoryCache.get(key) ?? null, cached: "memory" });
  }

  // L2
  const fromDb = await dbRead(key);
  if (fromDb !== undefined) {
    memoryCache.set(key, fromDb);
    return c.json<EntityAboutResponse>({ description: fromDb, cached: "db" });
  }

  // L3 — fresh generation
  const description = await generateDescription(body);
  memoryCache.set(key, description);
  // Fire-and-forget write to DB so the next visitor (or process restart)
  // picks up the same result without re-paying Groq.
  void dbWrite(key, description);

  return c.json<EntityAboutResponse>({ description, cached: "fresh" });
});

entity.get("/about/_stats", (c) =>
  c.json({
    memoryCacheSize: memoryCache.size,
    supabaseAvailable: supabaseAvailable(),
    model: GROQ_MODEL,
  }),
);

export default entity;
