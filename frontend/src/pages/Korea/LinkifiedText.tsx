import { Fragment, useMemo } from "react"
import { tokenize, type LinkifySegment, type LinkifyKind } from "./linkify"
import { Time } from "./Time"
import { useEntityIndex, type EntityMatch } from "./entityIndex"
import { SmartEntity } from "./SmartEntity"

interface LinkifiedTextProps {
  children: string
  className?: string
}

// Common: `max-w-full [overflow-wrap:anywhere]` lets long unbreakable strings
// (Korean addresses, station IDs) shrink instead of pushing their parent flex.
const baseChip = "max-w-full align-baseline [overflow-wrap:anywhere] [word-break:break-word]"

// Monochrome link family. Previously every link type had its own
// Tailwind hue (sky / purple / emerald / amber / rose / stone) — the
// most visible color-zoo on the route, because every reservation
// subtitle and neighborhood paragraph rendered it. Now all links read
// as the same ink-with-rose-decoration treatment; type is conveyed by
// the leading emoji + underline style, not hue.
const baseLink =
  "break-words underline decoration-rose-500/50 underline-offset-2 decoration-1 transition hover:decoration-rose-500 hover:text-rose-700 dark:hover:text-rose-300"
const baseChipLink =
  `inline-flex items-center gap-0.5 rounded bg-stone-100 px-1.5 py-0.5 font-medium text-stone-800 transition hover:bg-stone-200 hover:text-stone-900 dark:bg-stone-900/60 dark:text-stone-200 dark:hover:bg-stone-800 dark:hover:text-stone-50 ${baseChip}`

const linkClass: Record<LinkifyKind, string> = {
  // Inline reference links — flight / KTX / map render as small chips
  // so the prefix glyph stays legible. Stone chip, ink text. No hue
  // family per type.
  flight: baseChipLink,
  ktx: baseChipLink,
  map: baseChipLink,
  // Free-form links inherit the rose-underline inline treatment.
  phone: baseLink,
  email: `${baseLink} break-all`,
  url: `${baseLink} break-all`,
  // Subway station refs are quieter (dashed decoration) so they don't
  // compete with primary booking links in the same paragraph.
  stationLine:
    "break-words underline decoration-stone-400/60 decoration-dashed underline-offset-2 transition hover:text-stone-900 dark:hover:text-stone-100",
  hashtag: "text-stone-600 dark:text-stone-400",
  time: "",
}

const linkPrefix: Partial<Record<LinkifyKind, string>> = {
  flight: "✈️",
  ktx: "🚄",
  map: "📍",
  phone: "☎️",
  email: "✉️",
}

// ── Segmentation ──────────────────────────────────────────────────────
//
// The route runs THREE detection passes over each piece of free-form
// text, in priority order:
//
//   1. Entity dictionary (longest match wins). Catches multi-word
//      proper nouns like "Gentle Monster Haus Dosan" before the
//      linkifier sees them, so a substring like "24:00" buried in a
//      hypothetical hotel name doesn't get wrapped as a time.
//   2. Pattern linkify (tokenize from linkify.ts) on the non-entity
//      slices. Catches flight numbers, KTX trains, URLs, phones,
//      emails, addresses, station refs, times.
//   3. Whatever falls out the bottom renders as plain text.
//
// Output: a flat React node list ready to drop inside a <span>.

type Segment =
  | { kind: "text"; value: string }
  | { kind: "entity"; value: string; match: EntityMatch }
  | { kind: "link"; segment: Exclude<LinkifySegment, { kind: "text" }> }

function segmentWithEntities(
  text: string,
  matchRegex: RegExp | null,
  resolve: (s: string) => EntityMatch | null,
): Segment[] {
  if (!text) return []
  // No entities loaded → fall straight through to linkify.
  if (!matchRegex) {
    return tokenize(text).map<Segment>((seg) =>
      seg.kind === "text" ? { kind: "text", value: seg.value } : { kind: "link", segment: seg },
    )
  }

  // Find all entity spans first. Resetting lastIndex because the regex
  // is module-shared and might have been used by a sibling render.
  matchRegex.lastIndex = 0
  const spans: { start: number; end: number; match: EntityMatch; value: string }[] = []
  let m: RegExpExecArray | null
  while ((m = matchRegex.exec(text)) !== null) {
    const value = m[0]
    const resolved = resolve(value)
    if (!resolved) continue
    spans.push({ start: m.index, end: m.index + value.length, match: resolved, value })
  }

  if (spans.length === 0) {
    // No entity hits — pass straight through to linkify.
    return tokenize(text).map<Segment>((seg) =>
      seg.kind === "text" ? { kind: "text", value: seg.value } : { kind: "link", segment: seg },
    )
  }

  // Resolve overlapping spans, preferring the earlier-starting + longer
  // match (mirrors linkify.ts's overlap resolution).
  spans.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
  const kept: typeof spans = []
  let cursor = 0
  for (const s of spans) {
    if (s.start < cursor) continue
    kept.push(s)
    cursor = s.end
  }

  // Interleave: linkify the non-entity slices, drop in entity matches
  // at their original positions.
  const out: Segment[] = []
  let pos = 0
  for (const s of kept) {
    if (s.start > pos) {
      const sub = text.slice(pos, s.start)
      for (const seg of tokenize(sub)) {
        if (seg.kind === "text") out.push({ kind: "text", value: seg.value })
        else out.push({ kind: "link", segment: seg })
      }
    }
    out.push({ kind: "entity", value: s.value, match: s.match })
    pos = s.end
  }
  if (pos < text.length) {
    const sub = text.slice(pos)
    for (const seg of tokenize(sub)) {
      if (seg.kind === "text") out.push({ kind: "text", value: seg.value })
      else out.push({ kind: "link", segment: seg })
    }
  }
  return out
}

export function LinkifiedText({ children, className }: LinkifiedTextProps) {
  const { matchRegex, resolve } = useEntityIndex()
  const segments = useMemo(
    () => segmentWithEntities(children, matchRegex, resolve),
    [children, matchRegex, resolve],
  )

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.kind === "text") return <Fragment key={i}>{seg.value}</Fragment>
        if (seg.kind === "entity") {
          return (
            <SmartEntity
              key={i}
              name={seg.match.name}
              type={seg.match.type}
              city={seg.match.city}
              label={seg.value}
              compact
            />
          )
        }
        const link = seg.segment
        if (link.type === "time") return <Time key={i} value={link.value} />
        return (
          <a
            key={i}
            href={link.href}
            target={link.type === "phone" || link.type === "email" ? undefined : "_blank"}
            rel={link.type === "phone" || link.type === "email" ? undefined : "noreferrer"}
            title={link.tip}
            className={linkClass[link.type]}
          >
            {linkPrefix[link.type] && (
              <span aria-hidden className="text-[10px]">
                {linkPrefix[link.type]}
              </span>
            )}
            {link.value}
          </a>
        )
      })}
    </span>
  )
}
