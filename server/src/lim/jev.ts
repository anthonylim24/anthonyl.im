/**
 * Jev, TypeSafe's System One model (https://docs.typesafe.ai), sits in front
 * of Lim's chat and picks the Gemini model for each message:
 *
 * - **anthony** (asking about Anthony, his work, this site, or anything else
 *   for the assistant) → Gemini 4 Hydrogen
 * - **jelly** (playing with Lim, the jelly mascot: toys, places, weather,
 *   actions) → Gemini 4 Carbon
 *
 * One Choice question, one fast call. The route only picks the model: both
 * models get the same system prompt (profile + toy-world rules), so a wrong
 * route still gets a correct answer, just from the other model. Jev is
 * skipped when the page has no live toy world (nothing to play with), when
 * `LIM_GEMINI_MODEL` pins a model, and when `TYPESAFE_API_KEY` is missing;
 * if Jev errors or is slow, the date-based default (`limGeminiModel`) answers.
 */
import { LIM_MODEL_AFTER_SWITCH, LIM_MODEL_UNTIL_SWITCH, limGeminiModel } from "./model";
import type { WorldState } from "./world";

export const JEV_URL = "https://api.typesafe.ai/v1/systemone";
export const JEV_MODEL = "jev-latest";
/** Jev answers in well under this; past it, the chat should not wait. */
export const JEV_TIMEOUT_MS = 2_000;

export const ANTHONY_MODEL = LIM_MODEL_AFTER_SWITCH; // gemini-4-hydrogen
export const JELLY_MODEL = LIM_MODEL_UNTIL_SWITCH; // gemini-4-carbon

export type LimRoute = {
  model: string;
  route: "anthony" | "jelly" | null;
  /** Why this model: Jev decided, or why Jev was not asked / did not answer. */
  via: "jev" | "pinned" | "no-world" | "no-key" | "jev-failed";
  /** Jev's probability for "jelly", when it answered. */
  pJelly?: number;
};

type Turn = { role: "user" | "assistant"; content: string };

/** The question Jev answers. Exported for tests and the eval. */
export const INTENT_QUESTION = {
  type: "choice",
  instructions:
    "What does the visitor want from their latest_message? Read previous_messages and lim_toy_world for context (\"kick it\" can refer to a toy in the world).",
  criteria: {
    anthony:
      "A question or request for the assistant: about Anthony Lim (his background, career, skills, projects, availability, contact), this website, or anything else (coding help, advice, explanations, small talk, feedback on an earlier answer such as 'make it shorter').",
    jelly:
      "Wants to play with Lim, the little jelly mascot on screen, or change Lim's toy world: give Lim an item or gift, take Lim somewhere, change the weather, light or gravity, have Lim do something with a toy (kick, eat, wear, hug), or tidy up.",
  },
} as const;

/** What Jev is shown: the latest message, a little recent context, and the world. */
export function jevState(prompt: string, messages: Turn[], world: WorldState) {
  return {
    latest_message: prompt,
    previous_messages: messages.slice(-4).map((m) => ({ role: m.role, content: m.content.slice(0, 300) })),
    lim_toy_world: { items: world.items, place: world.place, ...(world.weather ? { weather: world.weather } : {}) },
  };
}

export async function routeLimModel(opts: {
  prompt: string;
  messages?: Turn[];
  world?: WorldState;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<LimRoute> {
  const { prompt, messages = [], world, apiKey = process.env.TYPESAFE_API_KEY, fetchImpl = fetch } = opts;
  const pinned = process.env.LIM_GEMINI_MODEL?.trim();
  if (pinned) return { model: pinned, route: null, via: "pinned" };
  // No live toy world: there is no jelly to play with, so everything is a question.
  if (!world || world.unavailable) return { model: ANTHONY_MODEL, route: "anthony", via: "no-world" };
  if (!apiKey) return { model: limGeminiModel(), route: null, via: "no-key" };

  try {
    const signal = AbortSignal.any([AbortSignal.timeout(JEV_TIMEOUT_MS), ...(opts.signal ? [opts.signal] : [])]);
    const res = await fetchImpl(JEV_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: JEV_MODEL, state: jevState(prompt, messages, world), questions: { intent: INTENT_QUESTION } }),
      signal,
    });
    if (!res.ok) throw new Error(`jev ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { answers?: { intent?: { choice?: string; probabilities?: Record<string, number> } } };
    const answer = body.answers?.intent;
    const route = answer?.choice;
    if (route !== "anthony" && route !== "jelly") throw new Error(`jev returned no route: ${JSON.stringify(body).slice(0, 200)}`);
    return { model: route === "jelly" ? JELLY_MODEL : ANTHONY_MODEL, route, via: "jev", pJelly: answer?.probabilities?.jelly };
  } catch (err) {
    console.warn("[lim/jev] routing failed, using the default model:", err instanceof Error ? err.message : String(err));
    return { model: limGeminiModel(), route: null, via: "jev-failed" };
  }
}
