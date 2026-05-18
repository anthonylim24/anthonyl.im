// /api/entity/about — generates a concise dossier-voice description for
// a place / person / thing the traveler will encounter on the Korea trip.
//
// Wired into the frontend's <SmartEntity> popover. Returns 1-2 sentences
// (≤200 chars) of factual, on-brand prose. Server-side cache keyed by
// (type, name, city) so repeat lookups are free.
//
// Failure mode: returns { description: null } so the popover still
// works (links resolve client-side via templates).

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import Groq from "groq-sdk";

const entity = new Hono();

const ENTITY_TYPES = [
  "flight",
  "hotel",
  "restaurant",
  "city",
  "neighborhood",
  "palace",
  "museum",
  "place",
  "transit",
  "airport",
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
  cached?: boolean;
}

const cache = new Map<string, EntityAboutResponse>();
function cacheKey(req: EntityAboutRequest): string {
  return `${req.type}|${req.name.toLowerCase().trim()}|${(req.city ?? "").toLowerCase().trim()}`;
}

// Prompt design notes:
// - Pinned to dossier voice (refined, factual, no marketing). Matches the
//   editorial register the Korea route uses everywhere else.
// - Hard character cap so popover doesn't overflow.
// - JSON-mode output via response_format so we don't have to parse prose.
// - Explicit anti-slop directives: no superlatives, no exclamation, no
//   travel-blog clichés, no em dashes.
const SYSTEM_PROMPT = `You are an editor for a private travel dossier covering a Seoul + Busan trip in 2026.

Your job: write a single, concise, FACTUAL description of a place, person, or thing the traveler will encounter. Tone: refined, slightly literary, like Monocle's travel guide. Not marketing-y, not boring.

OUTPUT: JSON only. Shape: {"description": "..."}.

CONSTRAINTS:
- Maximum 200 characters in the description.
- 1 to 2 sentences total.
- No superlatives ("amazing", "best", "must-see", "world-class", "iconic"). Plain facts.
- No exclamation points. No travel-blog clichés.
- No em dashes (—). Use commas, semicolons, colons, or periods.
- If you do not know specific details, do NOT invent them. Write only what you confidently know.
- If you know nothing useful about the input, respond with {"description": null}.
- Do not include URLs, addresses, or phone numbers in the description (the dossier renders those separately).
- Do not greet, do not apologize, do not preface ("Here is...", "This is...").

GOOD EXAMPLES:
Input: type="hotel", name="Park Hyatt Seoul", city="Seoul"
Output: {"description": "Glass-and-stone tower in Gangnam's commercial district. Quiet rooms, a top-floor pool, and a long-standing Italian restaurant on the 24th floor."}

Input: type="palace", name="Gyeongbokgung", city="Seoul"
Output: {"description": "The largest of Seoul's five Joseon-era palaces. Changing of the guard ceremony daily at Gwanghwamun; hanbok wearers enter without paying admission."}

Input: type="neighborhood", name="Seongsu", city="Seoul"
Output: {"description": "Former industrial district east of Hannam now full of converted warehouses housing roasters, ateliers, and the Korean fashion brands that don't have a Gangnam outpost yet."}

Input: type="flight", name="UA 893"
Output: {"description": "United's daily nonstop SFO to Incheon on a 777-300ER. Roughly 13 hours westbound, 11 hours back."}`;

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
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 200,
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { description?: string | null };
    let desc = parsed.description?.trim() ?? null;
    if (!desc) return null;
    // Defensive: strip stray em dashes / quote chars / multiple spaces.
    desc = desc.replace(/—/g, ",").replace(/\s+/g, " ").trim();
    // Cap at 220 chars even if the model overran. Keep a sentence boundary
    // if possible.
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

  const hit = cache.get(key);
  if (hit) {
    return c.json({ ...hit, cached: true });
  }

  const description = await generateDescription(body);
  const response: EntityAboutResponse = { description };
  cache.set(key, response);
  return c.json(response);
});

// Tiny diagnostic — never expose cache contents (could be promotional in
// theory if someone reused this endpoint); just expose size so we can
// confirm it's working in prod logs.
entity.get("/about/_stats", (c) => c.json({ cacheSize: cache.size }));

export default entity;
