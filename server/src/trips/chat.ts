import { streamSSE } from "hono/streaming"
import type { Context } from "hono"
import { GEMINI_BASE, GEMINI_MODEL, geminiThinking } from "../igPlaces/gemini"
import type { ItineraryItem, Trip, TripDay } from "./types"

const MAX_NOTE = 400
const MAX_TITLE = 80
const MAX_ITEMS_PER_OVERVIEW_DAY = 8

export interface TripChatTurn {
  role: "user" | "assistant"
  content: string
}

function clip(value: string, max: number): string {
  const trimmed = value.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function fmtItem(item: ItineraryItem): string {
  const title = clip(item.title, MAX_TITLE) || "(untitled)"
  const bits = [item.time ? item.time : null, `[${item.kind}]`, title].filter(Boolean)
  const extra: string[] = []
  if (item.location?.name && item.location.name !== item.title) extra.push(`@ ${item.location.name}`)
  if (item.location?.address) extra.push(item.location.address)
  if (item.location?.category) extra.push(item.location.category)
  if (item.reservation) {
    extra.push(`${item.reservation.type}${item.reservation.status ? ` ${item.reservation.status}` : ""}`)
    if (item.reservation.confirmation) extra.push(`conf ${item.reservation.confirmation}`)
  }
  if (item.status && item.status !== "none") extra.push(`status ${item.status}`)
  if (item.notes) extra.push(clip(item.notes, MAX_NOTE))
  return `    - ${bits.join(" ")}${extra.length ? ` (${extra.join("; ")})` : ""}`
}

function dayLabel(day: TripDay, index: number): string {
  const n = index + 1
  return (
    `Day ${n} · ${day.date}` +
    (day.city ? ` · ${day.city}` : "") +
    (day.title ? ` — ${day.title}` : "")
  )
}

function fmtDayOverview(day: TripDay, index: number): string {
  const booked = day.items.filter((i) => i.kind === "reservation" || i.status === "booked").length
  const titles = day.items
    .filter((i) => i.kind !== "section")
    .slice(0, MAX_ITEMS_PER_OVERVIEW_DAY)
    .map((i) => clip(i.title, 40) || "(untitled)")
  const more = day.items.filter((i) => i.kind !== "section").length - titles.length
  const tail = titles.length
    ? ` — ${titles.join("; ")}${more > 0 ? `; +${more} more` : ""}`
    : " — no stops yet"
  return `  ${dayLabel(day, index)} (${booked} booked)${tail}`
}

function fmtDayDetail(day: TripDay, index: number): string {
  const lines: string[] = [dayLabel(day, index)]
  if (day.neighborhoods?.length) lines.push(`  Neighborhoods: ${day.neighborhoods.join(", ")}`)
  if (day.weather) {
    lines.push(`  Weather: ${day.weather.condition}, ${day.weather.lowC}–${day.weather.highC}°C`)
  }
  if (day.notes) lines.push(`  Theme: ${clip(day.notes, MAX_NOTE)}`)
  if (day.callouts?.length) {
    for (const c of day.callouts) lines.push(`  [${c.tone}] ${clip(c.body, MAX_NOTE)}`)
  }
  if (day.items.length === 0) {
    lines.push("  (no items yet)")
    return lines.join("\n")
  }
  lines.push("  Items:")
  for (const item of day.items) lines.push(fmtItem(item))
  return lines.join("\n")
}

/** Compact itinerary digest for the concierge. Focused day is expanded;
 *  every other day is a one-line overview so cross-day questions still work. */
export function buildTripChatContext(trip: Trip, dayId?: string): string {
  const focusedIndex = dayId ? trip.days.findIndex((d) => d.id === dayId) : -1
  const focused = focusedIndex >= 0 ? trip.days[focusedIndex] : undefined

  const sections: string[] = []
  sections.push(
    `TRIP: ${trip.name}\n` +
      `Dates: ${trip.startDate} → ${trip.endDate}\n` +
      `Time zone: ${trip.timezone}\n` +
      `Destinations: ${trip.destinations.join(", ") || "(none)"}\n` +
      `Status: ${trip.status}` +
      (trip.description ? `\nDescription: ${clip(trip.description, 600)}` : "") +
      (trip.appearance?.headline ? `\nHeadline: ${clip(trip.appearance.headline, 400)}` : ""),
  )

  if (trip.days.length === 0) {
    sections.push("ALL DAYS: (none yet)")
  } else {
    sections.push(`ALL DAYS (overview):\n${trip.days.map((d, i) => fmtDayOverview(d, i)).join("\n")}`)
  }

  if (focused) {
    sections.push(`FOCUSED DAY (the user is currently viewing this day):\n${fmtDayDetail(focused, focusedIndex)}`)
  }

  return sections.join("\n\n")
}

export function buildTripChatSystemInstruction(trip: Trip, dayId?: string): string {
  const nowLocal = new Date().toLocaleString("en-US", {
    timeZone: trip.timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
  const dest = trip.destinations.join(" + ") || "this trip"

  return [
    `You are the trip concierge for a private itinerary: ${trip.name} (${dest}, ${trip.startDate} to ${trip.endDate}). ` +
      `You help during planning and in-trip lookups: restaurants and where to eat, the day's plan, ` +
      `reservations and timings, neighborhoods, transit, and general logistics.`,
    `Today's date in the trip time zone (${trip.timezone}) is ${nowLocal}.`,
    `RULES:`,
    `1. Answer ONLY from the itinerary data below. If something isn't in the data, say you don't have it rather than inventing details. Never fabricate reservation times, addresses, or confirmation numbers.`,
    `2. Be concise and mobile-friendly: short paragraphs, bullet points, bold the key thing. This is read on a phone, often one-handed.`,
    `3. When recommending a place, prefer ones already on the itinerary and mention why. Surface same-neighborhood / same-city picks first when a focused day is set.`,
    `4. For reservations, lead with the time and status. Flag anything pending, tentative, or needs_review.`,
    `5. Use a warm, confident concierge tone: like a well-briefed travel host, not a search engine.`,
    `6. Use Markdown for structure (bold, bullets). Keep it tight.`,
    ``,
    `=== ITINERARY DATA ===`,
    buildTripChatContext(trip, dayId),
  ].join("\n")
}

interface GeminiStreamChunk {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    finishReason?: string
  }>
  promptFeedback?: { blockReason?: string }
}

function extractDelta(chunk: GeminiStreamChunk): string {
  return chunk.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("") ?? ""
}

const TRANSIENT_GEMINI = new Set([500, 502, 503, 504])

async function fetchGeminiStream(url: string, init: RequestInit): Promise<Response> {
  const first = await fetch(url, init)
  if (!TRANSIENT_GEMINI.has(first.status)) return first
  await first.text().catch(() => {})
  await new Promise((r) => setTimeout(r, 800))
  return fetch(url, init)
}

/** Relay Gemini SSE into the frontend's `data: <json-string>` + `[DONE]` shape. */
export async function streamTripChat(
  c: Context,
  args: { trip: Trip; prompt: string; dayId?: string; messages: TripChatTurn[] },
): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return c.json(
      { error: "gemini_not_configured", message: "GEMINI_API_KEY is not set on the server." },
      503,
    )
  }

  const systemInstruction = buildTripChatSystemInstruction(args.trip, args.dayId)
  const history = args.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }))
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [...history, { role: "user", parts: [{ text: args.prompt }] }],
    generationConfig: {
      temperature: 0.45,
      maxOutputTokens: 1024,
      // 3.7 Flash rejects `minimal` (400). `low` is the snappy chat tier.
      thinkingConfig: geminiThinking("low"),
    },
  }

  const upstreamSignal = AbortSignal.any([AbortSignal.timeout(60_000), c.req.raw.signal])

  return streamSSE(c, async (stream) => {
    let sawText = false
    let finishReason: string | undefined
    let blockReason: string | undefined

    try {
      // Start Gemini immediately, then write a ping so a reverse proxy does
      // not 502 while the model thinks. The client ignores empty payloads.
      const pending = fetchGeminiStream(
        `${GEMINI_BASE}/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(body),
          signal: upstreamSignal,
        },
      )
      await stream.writeSSE({ event: "ping", data: "" })
      const res = await pending

      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "")
        console.error(`[trips-chat] gemini ${res.status}: ${detail.slice(0, 300)}`)
        await stream.writeSSE({
          data: JSON.stringify({ error: "The assistant is unavailable right now. Please try again." }),
        })
        await stream.writeSSE({ data: "[DONE]" })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      const flushLine = async (line: string) => {
        const trimmed = line.trim()
        if (!trimmed.startsWith("data:")) return
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === "[DONE]") return
        try {
          const json = JSON.parse(payload) as GeminiStreamChunk
          if (json.promptFeedback?.blockReason) blockReason = json.promptFeedback.blockReason
          const fr = json.candidates?.[0]?.finishReason
          if (fr) finishReason = fr
          const delta = extractDelta(json)
          if (delta) {
            sawText = true
            await stream.writeSSE({ data: JSON.stringify(delta) })
          }
        } catch {
          /* Gemini keepalive / partial lines */
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) await flushLine(line)
      }
      if (buffer) await flushLine(buffer)

      if (sawText && finishReason === "MAX_TOKENS") {
        await stream.writeSSE({ data: JSON.stringify("\n\n*…trimmed for length. Ask me to continue.*") })
      }

      if (!sawText) {
        const reason = blockReason
          ? "That one's outside what I can help with for this trip."
          : "I couldn't find an answer for that. Try rephrasing, or ask about a specific day, restaurant, or reservation."
        await stream.writeSSE({ data: JSON.stringify(reason) })
      }

      await stream.writeSSE({ data: "[DONE]" })
    } catch (error) {
      if ((error as Error).name === "AbortError" && c.req.raw.signal.aborted) return
      console.error("[trips-chat] streaming error:", error)
      await stream.writeSSE({ data: JSON.stringify({ error: "Streaming error occurred" }) })
      await stream.writeSSE({ data: "[DONE]" })
    }
  })
}
