/**
 * Which Gemini model Lim's chat uses (`/api/invoke`; the same call writes the
 * toy-world orders): Gemini 4 Carbon through December 1, 2026, then
 * Gemini 4 Hydrogen (the app-wide model) from December 2 (UTC). Set
 * `LIM_GEMINI_MODEL` to pin one regardless of the date.
 */
export const LIM_MODEL_UNTIL_SWITCH = "gemini-4-carbon";
export const LIM_MODEL_AFTER_SWITCH = "gemini-4-hydrogen";
/** The first moment of December 2, 2026 (UTC): "after December 1". */
export const LIM_MODEL_SWITCH_AT = Date.UTC(2026, 11, 2);

export function limGeminiModel(now: number = Date.now()): string {
  return process.env.LIM_GEMINI_MODEL?.trim() || (now < LIM_MODEL_SWITCH_AT ? LIM_MODEL_UNTIL_SWITCH : LIM_MODEL_AFTER_SWITCH);
}
