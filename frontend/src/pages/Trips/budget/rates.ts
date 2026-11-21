import { Effect, Option, Schema } from "effect"
import { fetchExternal, parseJson, readErrorMessage, requireOk } from "@/effect/http"
import { HttpStatusError } from "@/effect/errors"
import { runPromise } from "@/effect/runtime"
import { isCurrencyCode } from "./budget"

// Exchange rates for the budget, from Frankfurter: keyless, published from
// the European Central Bank and others once a working day.
//
// `GET /v2/rates?base=EUR&quotes=JPY,USD` answers
// `[{ "date": "2026-11-20", "base": "EUR", "quote": "JPY", "rate": 174.35 }, …]`,
// `rate` being units of the quote per one unit of the base: exactly the
// `Rates` convention in budget.ts with the budget currency as the base.
//
// Not `api.frankfurter.app/latest`: that host answers 301 to frankfurter.dev
// with no CORS headers, so a browser fetch of it fails, and v1 (deprecated)
// knows only the ECB's ~30 currencies (no VND, TWD, AED). v2 rejects a whole
// request with 422 "invalid currency: XXX" when one code is unknown; that
// code is set aside for the session and the rest asked again. A code an
// answer leaves out is set aside too, so it isn't asked for on every render.

const ENDPOINT = "https://api.frankfurter.dev/v2/rates"
const DEADLINE = "8 seconds"

class RatesTimeout extends Schema.TaggedError<RatesTimeout>()("RatesTimeout", {
  message: Schema.String,
}) {}

/** Rates found so far, by base. Daily figures: a session's worth is fresh enough. */
const known = new Map<string, Record<string, number>>()
/** Codes Frankfurter rejected: never asked for again this session. */
const unknown = new Set<string>()
/** Requests in flight, so two panels asking at once share one fetch. */
const inflight = new Map<string, Promise<void>>()

function readRates(body: unknown, base: string): Record<string, number> {
  const rates: Record<string, number> = {}
  if (!Array.isArray(body)) return rates
  for (const entry of body as unknown[]) {
    if (typeof entry !== "object" || entry === null) continue
    const { base: from, quote, rate } = entry as { base?: unknown; quote?: unknown; rate?: unknown }
    if (from !== base || typeof quote !== "string" || !isCurrencyCode(quote)) continue
    if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) rates[quote] = rate
  }
  return rates
}

const fetchRates = Effect.fn("Rates.fetch")(function* (base: string, quotes: readonly string[]) {
  let ask = [...quotes]
  const rejected: string[] = []
  while (ask.length > 0) {
    const url = `${ENDPOINT}?base=${encodeURIComponent(base)}&quotes=${ask.map(encodeURIComponent).join(",")}`
    const res = yield* fetchExternal(url)
    if (res.status === 422) {
      const message = yield* readErrorMessage(res)
      const bad = /invalid currency:\s*([A-Z]{3})/i.exec(message)?.[1]?.toUpperCase()
      if (bad === base) return { rates: {}, rejected: [base] }
      if (!bad || !ask.includes(bad)) return yield* Effect.fail(new HttpStatusError({ status: 422, message }))
      rejected.push(bad)
      ask = ask.filter((code) => code !== bad)
      continue
    }
    yield* requireOk(res)
    const body = yield* parseJson<unknown>(res)
    const rates = readRates(body, base)
    // Asked for and not answered: the service has no usable rate for it.
    return { rates, rejected: [...rejected, ...ask.filter((code) => !(code in rates))] }
  }
  return { rates: {}, rejected }
})

const remember = Effect.fn("Rates.remember")(function* (base: string, quotes: readonly string[]) {
  const found = yield* fetchRates(base, quotes).pipe(
    Effect.timeoutFail({ duration: DEADLINE, onTimeout: () => new RatesTimeout({ message: "Exchange rates took too long" }) }),
    // Offline or the service is down: keep what we have; the next load asks again.
    Effect.option,
  )
  if (Option.isNone(found)) return
  known.set(base, { ...known.get(base), ...found.value.rates })
  for (const code of found.value.rejected) unknown.add(code)
})

/**
 * Rates from `base` to each of `symbols` (units of the symbol per one `base`).
 * Never rejects: a code the service doesn't know, or a failed lookup, is
 * simply missing from the answer, and the caller names what it couldn't convert.
 */
export async function loadRates(base: string, symbols: readonly string[]): Promise<Record<string, number>> {
  const from = base.toUpperCase()
  const wanted = [...new Set(symbols.map((code) => code.toUpperCase()))].filter((code) => code !== from && isCurrencyCode(code)).sort()
  const pick = () => {
    const have = known.get(from) ?? {}
    return Object.fromEntries(wanted.filter((code) => code in have).map((code) => [code, have[code]]))
  }
  if (!isCurrencyCode(from) || unknown.has(from)) return {}
  const have = known.get(from) ?? {}
  const missing = wanted.filter((code) => !(code in have) && !unknown.has(code))
  if (missing.length === 0) return pick()
  const key = `${from}>${missing.join(",")}`
  let request = inflight.get(key)
  if (!request) {
    request = runPromise(remember(from, missing)).finally(() => inflight.delete(key))
    inflight.set(key, request)
  }
  await request
  return pick()
}
