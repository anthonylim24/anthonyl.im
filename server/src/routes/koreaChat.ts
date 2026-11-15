import { Hono } from "hono"
import { streamSSE, type SSEStreamingApi } from "hono/streaming"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"

import { koreaSnapshot, type Snapshot, type Day, type Reservation } from "../data/koreaSnapshot"
import { koreaPlaces, type PlaceDef } from "../data/koreaPlaces"
import { sourcesFromGrounding, type ConciergeSource } from "../geminiGrounding"
import { relayGeminiChatBody } from "../geminiStream"
import { fetchGeminiStreamWithToolFallback, mapsRetrievalConfig } from "../geminiTools"
import { geminiThinking } from "../igPlaces/gemini"
import { withSsePings } from "../ssePing"

const koreaChat = new Hono()

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8000),
})

const chatSchema = z.object({
  prompt: z.string().min(1, "Prompt is required").max(2000),
  // The day the user is currently looking at, e.g. "day-3-seoul". Optional —
  // when absent the assistant gets trip-wide context only.
  slug: z.string().max(120).optional(),
  // Prior turns for multi-turn context. Capped server-side to keep the
  // prompt bounded regardless of what the client sends.
  messages: z.array(messageSchema).max(40).optional(),
})

// ─── Context assembly ──────────────────────────────────────────────────
//
// The assistant only knows what we put in front of it. We assemble a
// compact, structured digest of the trip: a header (dates, hotels,
// flights, the wedding anchor), a one-line-per-day overview so cross-day
// questions work, the focused day in full detail (sections, reservations,
// weather), and the curated places relevant to that day's city so
// "where should we eat?" has real options to draw from.

function fmtReservation(r: Reservation): string {
  const bits = [r.time ? r.time : null, r.title].filter(Boolean).join(" · ")
  const extra: string[] = []
  if (r.subtitle) extra.push(r.subtitle)
  if (r.address) extra.push(`@ ${r.address}`)
  if (r.status && r.status !== "confirmed") extra.push(`(${r.status})`)
  if (r.notes) extra.push(`— ${r.notes}`)
  return `    - [${r.type}] ${bits}${extra.length ? " " + extra.join(" ") : ""}`
}

function fmtDayHeader(d: Day): string {
  return `Day ${d.n} · ${d.dayOfWeek} ${d.date} · ${d.city} — ${d.title}` +
    (d.theme ? ` (${d.theme})` : "")
}

function fmtDayDetail(d: Day): string {
  const lines: string[] = []
  lines.push(fmtDayHeader(d))
  if (d.neighborhoods.length) lines.push(`  Neighborhoods: ${d.neighborhoods.join(", ")}`)
  if (d.hotel) lines.push(`  Hotel tonight: ${d.hotel}`)
  if (d.weather) lines.push(`  Weather: ${d.weather.condition}, ${d.weather.lowC}–${d.weather.highC}°C`)
  if (d.reservations.length) {
    lines.push(`  Reservations:`)
    for (const r of d.reservations) lines.push(fmtReservation(r))
  }
  for (const s of d.sections) {
    const head = s.time ? `${s.time} — ${s.heading}` : s.heading
    lines.push(`  ${head}`)
    for (const b of s.bullets) lines.push(`    • ${b}`)
  }
  if (d.callouts?.length) {
    for (const c of d.callouts) lines.push(`  [${c.tone}] ${c.body}`)
  }
  return lines.join("\n")
}

function fmtPlace(p: PlaceDef): string {
  const extra: string[] = []
  if (p.address) extra.push(p.address)
  if (p.openingHours) extra.push(`hours: ${p.openingHours}`)
  if (p.notice) extra.push(p.notice)
  const tail = extra.length ? ` — ${extra.join(" · ")}` : ""
  return `  - ${p.name} [${p.category}, ${p.city}] — ${p.description}${tail}`
}

function buildContext(snapshot: Snapshot, slug?: string): string {
  const focused = slug
    ? snapshot.days.find((d) => d.slug === slug || String(d.n) === slug)
    : undefined

  const sections: string[] = []

  // Trip header
  const t = snapshot.trip
  sections.push(
    `TRIP: ${t.title}\n` +
    `Dates: ${t.startDate} → ${t.endDate}\n` +
    `Flights: out ${t.flights.out}; back ${t.flights.back} (conf ${t.flights.confirmation})\n` +
    `Hotels: ${t.hotels.map((h) => `${h.name} (${h.nights})`).join("; ")}\n` +
    `Anchor: ${t.anchor}\n` +
    (t.holidays.length ? `Holidays: ${t.holidays.join("; ")}\n` : "") +
    `Status: ${snapshot.status.headline}`,
  )

  // One line per day so cross-day questions resolve.
  sections.push(
    `ALL DAYS (overview):\n` +
    snapshot.days.map((d) => `  ${fmtDayHeader(d)}`).join("\n"),
  )

  // Focused day in full detail.
  if (focused) {
    sections.push(`FOCUSED DAY (the user is currently viewing this day):\n${fmtDayDetail(focused)}`)
  }

  // Curated places. Prefer the focused day's city; otherwise include all.
  // Cap to keep the prompt bounded.
  const city = focused?.city
  const ranked = city
    ? [...koreaPlaces.filter((p) => p.city === city), ...koreaPlaces.filter((p) => p.city !== city)]
    : koreaPlaces
  const places = ranked.slice(0, 60)
  sections.push(
    `CURATED PLACES${city ? ` (prioritised for ${city})` : ""} — restaurants, cafés, bars, landmarks, etc. you can recommend:\n` +
    places.map(fmtPlace).join("\n"),
  )

  // Neighborhood picks.
  if (snapshot.neighborhoods.length) {
    sections.push(
      `NEIGHBORHOOD PICKS:\n` +
      snapshot.neighborhoods.map((n) => `  - ${n.name} (${n.days}): ${n.picks}`).join("\n"),
    )
  }

  return sections.join("\n\n")
}

function buildSystemInstruction(snapshot: Snapshot, slug?: string): string {
  // KST "today" for relative answers ("what's the plan today?").
  const nowKst = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return [
    `You are the trip concierge for Anthony's private Korea itinerary (Seoul + Busan, late May–early June 2026). ` +
    `You help Anthony and his partner during planning and in-trip lookups: restaurants and where to eat, the day's plan, ` +
    `reservations and timings, neighborhoods, transit, and general logistics.`,
    `Today's date in Korea (KST) is ${nowKst}.`,
    `RULES:`,
    `1. Reservations, times, confirmation numbers, and flight details come ONLY from the itinerary data below — never invent those. For restaurants, hours, reviews, transit, weather, events, and neighborhood questions, use Google Search and Google Maps grounding when those tools are available so answers stay current. Say when a detail is from Maps or the live web; if a tool is missing, do not claim the answer is Maps-verified or from the live web.`,
    `2. Be concise and mobile-friendly: short paragraphs, bullet points, bold the key thing. This is read on a phone, often one-handed.`,
    `3. When recommending a place, prefer ones in the CURATED PLACES list and mention why (cuisine, neighborhood, what makes it good). Surface walking-distance / same-neighborhood picks first when a focused day is set. You may recommend additional Maps-verified venues when the traveler asks.`,
    `4. For reservations, lead with the time and status. Flag anything pending or unconfirmed.`,
    `5. Use a warm, confident concierge tone — like a well-briefed travel host, not a search engine.`,
    `6. Use Markdown for structure (bold, bullets). Keep it tight.`,
    ``,
    `=== ITINERARY DATA ===`,
    buildContext(snapshot, slug),
  ].join("\n")
}

// ─── Gemini SSE relay ──────────────────────────────────────────────────
//
// Gemini may emit SSE `data: {GenerateContentResponse}`, NDJSON (no
// `data:` prefix), or a single JSON body. parseGeminiStreamLine accepts
// all three; thought parts are dropped. We re-emit `data: <json-string>`
// plus `data: [DONE]` for the frontend. Roles map user→user, assistant→model.

function koreaLatLngHint(slug?: string): { latitude: number; longitude: number } | null {
  const focused = slug
    ? koreaSnapshot.days.find((d) => d.slug === slug || String(d.n) === slug)
    : undefined
  if (focused?.city === "Busan") return { latitude: 35.1796, longitude: 129.0756 }
  if (focused?.city === "Seoul") return { latitude: 37.5665, longitude: 126.978 }
  return { latitude: 37.5665, longitude: 126.978 }
}

koreaChat.post("/", zValidator("json", chatSchema), async (c) => {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return c.json(
      { error: "gemini_not_configured", message: "GEMINI_API_KEY is not set on the server." },
      503,
    )
  }

  const { prompt, slug, messages = [] } = c.req.valid("json")

  const systemInstruction = buildSystemInstruction(koreaSnapshot, slug)

  const history = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }))

  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [...history, { role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.45,
      maxOutputTokens: 2048,
      // Conversational Q&A over a pre-assembled context. `low` is the
      // snappy tier — `minimal` 400s on Gemini.
      thinkingConfig: geminiThinking("low"),
    },
  }


  // Abort the upstream Gemini stream when EITHER the 120s budget elapses OR
  // the client disconnects (panel closed / navigated away). Search + Maps
  // grounding can sit quiet before the first token; 60s was cutting that off.
  // Without the client-disconnect link, an orphaned Gemini stream would run
  // — and bill — to completion with no listener; on a 1 GB droplet that adds up.
  const clientSignal = c.req.raw.signal
  const upstreamSignal = AbortSignal.any([AbortSignal.timeout(120_000), clientSignal])

  return streamSSE(c, async (stream) => {
    await withSsePings(
      () => stream.writeSSE({ event: "ping", data: "" }),
      (async () => {
        const outcome = await relayKoreaChat({ stream, apiKey, body, slug, upstreamSignal, clientSignal })
        await finishRelay(stream, outcome)
      })(),
    )
  })
})

/** How one concierge reply ended. Each case gets exactly one closing message. */
type RelayOutcome =
  | { kind: "answered"; sources: ConciergeSource[] }
  /** Cut off at maxOutputTokens after some text was relayed. */
  | { kind: "truncated"; sources: ConciergeSource[] }
  /** No text: Gemini refused (safety / prompt block). */
  | { kind: "blocked" }
  /** No text and no reason given. */
  | { kind: "empty" }
  | { kind: "upstream_error" }
  /** Our 120 s budget ran out. */
  | { kind: "timeout" }
  /** The traveller closed the panel; nobody is listening. */
  | { kind: "client_gone" }

async function relayKoreaChat(opts: {
  stream: SSEStreamingApi
  apiKey: string
  body: Record<string, unknown>
  slug: string | undefined
  upstreamSignal: AbortSignal
  clientSignal: AbortSignal
}): Promise<RelayOutcome> {
  const { stream, upstreamSignal, clientSignal } = opts
  try {
    const res = await fetchGeminiStreamWithToolFallback({
      apiKey: opts.apiKey,
      baseBody: opts.body,
      toolConfig: mapsRetrievalConfig(koreaLatLngHint(opts.slug)),
      signal: upstreamSignal,
      logLabel: "korea-chat",
    })
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "")
      console.error(`[korea-chat] gemini ${res.status}: ${detail.slice(0, 300)}`)
      return { kind: "upstream_error" }
    }

    const relayed = await relayGeminiChatBody(res.body, async (delta) => {
      await stream.writeSSE({ data: JSON.stringify(delta) })
    })
    if (!relayed.sawText) return relayed.blockReason ? { kind: "blocked" } : { kind: "empty" }
    const sources = sourcesFromGrounding(relayed.grounding)
    return relayed.finishReason === "MAX_TOKENS" ? { kind: "truncated", sources } : { kind: "answered", sources }
  } catch (error) {
    // Client disconnects abort the upstream fetch — expected, not an error to log loudly.
    if (clientSignal.aborted) return { kind: "client_gone" }
    if (upstreamSignal.aborted) return { kind: "timeout" }
    console.error("[korea-chat] streaming error:", error)
    return { kind: "upstream_error" }
  }
}

const sendText = (stream: SSEStreamingApi, text: string) => stream.writeSSE({ data: JSON.stringify(text) })
const sendError = (stream: SSEStreamingApi, error: string) => stream.writeSSE({ data: JSON.stringify({ error }) })

async function finishRelay(stream: SSEStreamingApi, outcome: RelayOutcome): Promise<void> {
  switch (outcome.kind) {
    case "client_gone":
      return
    case "answered":
    case "truncated":
      // So a cut-off sentence isn't mistaken for the full answer.
      if (outcome.kind === "truncated") await sendText(stream, "\n\n*…trimmed for length — ask me to continue.*")
      if (outcome.sources.length) await stream.writeSSE({ data: JSON.stringify({ sources: outcome.sources }) })
      break
    // 200 with no text at all: a real reply instead of a perpetual typing indicator.
    case "blocked":
      await sendText(stream, "That one's outside what I can help with for this trip.")
      break
    case "empty":
      await sendText(
        stream,
        "I couldn't find an answer for that. Try rephrasing, or ask about a specific day, restaurant, or reservation.",
      )
      break
    case "upstream_error":
      await sendError(stream, "The assistant is unavailable right now. Please try again.")
      break
    case "timeout":
      await sendError(stream, "That took too long. Please try again.")
      break
    default: {
      const unreachable: never = outcome
      return unreachable
    }
  }
  await stream.writeSSE({ data: "[DONE]" })
}

export default koreaChat
