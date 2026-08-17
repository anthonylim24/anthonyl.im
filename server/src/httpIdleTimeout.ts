/** Bun.serve defaults `idleTimeout` to 10 seconds. Gemini Search + Maps
 *  grounding regularly pauses longer than that, which closes the SSE
 *  socket and makes the concierge look finished mid-sentence.
 *  255 is Bun's documented maximum (seconds). */
export const BUN_IDLE_TIMEOUT_SEC = 255
