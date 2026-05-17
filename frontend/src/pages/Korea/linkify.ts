// Heuristic auto-link engine. Scans a string and returns a list of plain-text
// or link segments. Used by <LinkifiedText> to render section bullets, notes,
// and free-form copy with smart links to United, Korail, Google Maps, etc.

export type LinkifySegment =
  | { kind: "text"; value: string }
  | { kind: "link"; value: string; href: string; type: LinkifyKind; tip?: string }

export type LinkifyKind =
  | "flight"
  | "ktx"
  | "phone"
  | "email"
  | "url"
  | "map"
  | "stationLine"
  | "hashtag"
  | "time"

// ---- Patterns ----
// Order matters: longer / more specific matches first so we don't double-tag.
// All patterns must use the `g` flag and not be /m to keep .exec stateful.

interface PatternDef {
  kind: LinkifyKind
  // Regex must be /g
  rx: RegExp
  // Build href + optional tip from the match
  build: (match: RegExpExecArray) => { value: string; href: string; tip?: string }
}

// Airline lookup — map IATA code → flight tracker URL builder
const airlineTrackers: Record<string, { name: string; tracker: (n: string) => string }> = {
  UA: { name: "United", tracker: (n) => `https://www.united.com/en/us/flightstatus/details/${n}` },
  KE: { name: "Korean Air", tracker: (n) => `https://www.koreanair.com/booking/checkin/checkin-bp?flightNumber=${n}` },
  OZ: { name: "Asiana", tracker: (n) => `https://flyasiana.com/C/US/EN/customer/flightinfo/flightschedule?flightNumber=${n}` },
  AA: { name: "American", tracker: (n) => `https://www.aa.com/travelInformation/flights/status?flightNumber=${n}` },
  DL: { name: "Delta", tracker: (n) => `https://www.delta.com/flightstatus/search?flightNumber=${n}` },
  AS: { name: "Alaska", tracker: (n) => `https://www.alaskaair.com/status/${n}` },
  BA: { name: "British Airways", tracker: (n) => `https://www.britishairways.com/travel/flightinfo/public/en_us?eId=110009&flightNumber=${n}` },
  JL: { name: "JAL", tracker: (n) => `https://www.jal.co.jp/en/inter/flight_info/?flightNo=${n}` },
  NH: { name: "ANA", tracker: (n) => `https://www.ana.co.jp/en/us/flights/flight-status/?flightNo=${n}` },
}

const PATTERNS: PatternDef[] = [
  // KTX 007 / KTX 026 — Korail
  {
    kind: "ktx",
    rx: /\bKTX[  ]?(\d{2,4})\b/g,
    build: (m) => ({
      value: m[0],
      href: `https://www.letskorail.com/ebizprd/EbizPrdTicketpr11100W_pr11150.do?txtPsgFlg_1=1&txtTrnNo=${m[1]}`,
      tip: `Korail ${m[0]} timetable`,
    }),
  },

  // Flight numbers: 2-letter airline + 1-4 digit number (excludes things like
  // "L5", "L7" subway lines by requiring 3+ chars in the number portion or by
  // limiting to known carrier codes)
  {
    kind: "flight",
    rx: /\b(UA|KE|OZ|AA|DL|AS|BA|JL|NH)[  ]?(\d{2,5})\b/g,
    build: (m) => {
      const code = m[1] as keyof typeof airlineTrackers
      const num = m[2]
      const carrier = airlineTrackers[code]
      const compact = `${code} ${num}`
      return {
        value: m[0],
        href: carrier ? carrier.tracker(num) : `https://www.google.com/search?q=${encodeURIComponent(compact + " flight status")}`,
        tip: carrier ? `Track ${carrier.name} ${num}` : `Search ${compact}`,
      }
    },
  },

  // Korean phone: +82 2-2294-5005 or +82 2 794 1614 — link to tel:
  {
    kind: "phone",
    rx: /\+82[\s-]?\d{1,2}[\s-]?\d{3,4}[\s-]?\d{4}\b/g,
    build: (m) => ({
      value: m[0],
      href: `tel:${m[0].replace(/[\s-]/g, "")}`,
      tip: "Call (Korea)",
    }),
  },

  // Generic full URL — http(s):// optional, but capture www.something.tld
  {
    kind: "url",
    rx: /\b(?:https?:\/\/|www\.)[^\s)\]]+/g,
    build: (m) => {
      const raw = m[0]
      const cleaned = raw.replace(/[.,;:!?)\]]$/, "")
      const href = cleaned.startsWith("http") ? cleaned : `https://${cleaned}`
      return { value: cleaned, href, tip: "Open site" }
    },
  },

  // Email
  {
    kind: "email",
    rx: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    build: (m) => ({ value: m[0], href: `mailto:${m[0]}`, tip: "Email" }),
  },

  // Korean address fragment: "<word>-ro <num>-gil" or "<word>-daero <num>-gil"
  // e.g. "1 Noksapyeong-daero 40na-gil" or "26 Dosan-daero 55-gil"
  // Match the road portion conservatively to avoid catching unrelated -gil words.
  {
    kind: "map",
    rx: /\b\d{0,4}\s*[A-Za-z][A-Za-z'-]+-(?:daero|ro)\s+\d{1,4}(?:na|ga|nan|bun|beon)?-gil\b/g,
    build: (m) => ({
      value: m[0],
      href: `https://www.google.com/maps/search/${encodeURIComponent(m[0] + ", Seoul, South Korea")}`,
      tip: "Open in Google Maps",
    }),
  },

  // Subway: "Line 5 Exit 3" or "L5 Exit 3" — turns into a hint badge (no link
  // by default, but we tag it so we could style or popover later).
  {
    kind: "stationLine",
    rx: /\bLine\s?\d{1,2}\s?Exit\s?\d{1,2}\b/g,
    build: (m) => ({
      value: m[0],
      href: `https://www.google.com/search?q=${encodeURIComponent(m[0] + " Seoul Metro")}`,
      tip: "Seoul Metro",
    }),
  },

  // 24-hour times like 06:33 or 18:00 — the renderer surfaces an AM/PM tooltip
  // via the <Time> component, no link. Negative lookahead skips matches that
  // are already labeled with AM/PM in the surrounding text.
  {
    kind: "time",
    rx: /\b([01]?\d|2[0-3]):[0-5]\d\b(?!\s*[AaPp]\.?[Mm]\.?)/g,
    build: (m) => ({ value: m[0], href: "", tip: "Show AM/PM" }),
  },
]

export function tokenize(text: string): LinkifySegment[] {
  if (!text) return [{ kind: "text", value: text }]

  // Collect all match spans across all patterns.
  type Span = { start: number; end: number; seg: LinkifySegment }
  const spans: Span[] = []

  for (const p of PATTERNS) {
    p.rx.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = p.rx.exec(text)) !== null) {
      const start = m.index
      const end = start + m[0].length
      const { value, href, tip } = p.build(m)
      spans.push({
        start,
        end,
        seg: { kind: "link", value, href, type: p.kind, tip },
      })
    }
  }

  if (spans.length === 0) return [{ kind: "text", value: text }]

  // Sort by start ascending. Resolve overlaps by preferring the earlier-start,
  // longer-match. (Patterns with the highest precedence — e.g., flights — are
  // listed first in PATTERNS but here we just dedupe by overlap.)
  spans.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
  const kept: Span[] = []
  let cursor = 0
  for (const s of spans) {
    if (s.start < cursor) continue
    kept.push(s)
    cursor = s.end
  }

  // Walk text, emitting text + link segments.
  const out: LinkifySegment[] = []
  let pos = 0
  for (const s of kept) {
    if (s.start > pos) out.push({ kind: "text", value: text.slice(pos, s.start) })
    out.push(s.seg)
    pos = s.end
  }
  if (pos < text.length) out.push({ kind: "text", value: text.slice(pos) })
  return out
}

// Build a Google Maps search URL for any free-form query (hotel name, restaurant)
export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}`
}

// Specifically scope hotel/restaurant search to "Seoul" or "Busan" if a city is
// hinted in the query. Falls back to Korea otherwise.
export function smartPlaceUrl(query: string, hint?: string): string {
  const tail = hint
    ? `, ${hint}, South Korea`
    : /busan|haeundae|gwangalli|cheongsapo|mipo|songjeong/i.test(query)
      ? ", Busan, South Korea"
      : /yangju|jangheung/i.test(query)
        ? ", Yangju, Gyeonggi-do, South Korea"
        : ", Seoul, South Korea"
  return `https://www.google.com/maps/search/${encodeURIComponent(query + tail)}`
}
