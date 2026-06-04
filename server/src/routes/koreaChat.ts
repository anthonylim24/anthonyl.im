import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"

import { koreaSnapshot, type Snapshot, type Day, type Reservation } from "../data/koreaSnapshot"
import { koreaPlaces, type PlaceDef } from "../data/koreaPlaces"
import { GEMINI_BASE, GEMINI_MODEL } from "../igPlaces/gemini"

const koreaChat = new Hono()

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
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
    `1. Answer ONLY from the itinerary data below. If something isn't in the data, say you don't have it rather than inventing details. Never fabricate reservation times, addresses, or confirmation numbers.`,
    `2. Be concise and mobile-friendly: short paragraphs, bullet points, bold the key thing. This is read on a phone, often one-handed.`,
    `3. When recommending a place, prefer ones in the CURATED PLACES list and mention why (cuisine, neighborhood, what makes it good). Surface walking-distance / same-neighborhood picks first when a focused day is set.`,
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
// Gemini's streamGenerateContent?alt=sse emits `data: {GenerateContentResponse}`
// events. We parse each, pull the text delta, and re-emit it in the exact
// shape the frontend already parses for /api/invoke: `data: <json-string>`
// with a trailing `data: [DONE]`. Roles map user→user, assistant→model.

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
      maxOutputTokens: 1024,
      // No reasoning budget — this is conversational Q&A over a context we
      // already assembled, so latency matters more than deep planning.
      thinkingConfig: { thinkingBudget: 0 },
    },
  }

  // Abort the upstream Gemini stream when EITHER the 60s budget elapses OR
  // the client disconnects (panel closed / navigated away). Without the
  // client-disconnect link, an orphaned Gemini stream would run — and bill —
  // to completion with no listener; on a 1 GB droplet that adds up fast.
  const upstreamSignal = AbortSignal.any([
    AbortSignal.timeout(60_000),
    c.req.raw.signal,
  ])

  return streamSSE(c, async (stream) => {
    let sawText = false
    let finishReason: string | undefined
    let blockReason: string | undefined

    try {
      const res = await fetch(
        `${GEMINI_BASE}/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(body),
          signal: upstreamSignal,
        },
      )

      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "")
        console.error(`[korea-chat] gemini ${res.status}: ${detail.slice(0, 300)}`)
        await stream.writeSSE({ data: JSON.stringify({ error: "The assistant is unavailable right now. Please try again." }) })
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
          // Ignore partial/keepalive lines — Gemini occasionally emits
          // non-JSON whitespace between events.
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

      // Truncated mid-thought — tell the user so a cut-off sentence isn't mistaken for the full answer.
      if (sawText && finishReason === "MAX_TOKENS") {
        await stream.writeSSE({ data: JSON.stringify("\n\n*…trimmed for length — ask me to continue.*") })
      }

      // 200 with no text at all (safety block, empty candidate). Surface a
      // real reply instead of leaving the UI on a perpetual typing indicator.
      if (!sawText) {
        const reason = blockReason
          ? "That one's outside what I can help with for this trip."
          : "I couldn't find an answer for that. Try rephrasing, or ask about a specific day, restaurant, or reservation."
        await stream.writeSSE({ data: JSON.stringify(reason) })
      }

      await stream.writeSSE({ data: "[DONE]" })
    } catch (error) {
      // Client disconnects abort the upstream fetch — that's expected, not an error to log loudly.
      if ((error as Error).name === "AbortError" && c.req.raw.signal.aborted) return
      console.error("[korea-chat] streaming error:", error)
      await stream.writeSSE({ data: JSON.stringify({ error: "Streaming error occurred" }) })
      await stream.writeSSE({ data: "[DONE]" })
    }
  })
})

export default koreaChat
