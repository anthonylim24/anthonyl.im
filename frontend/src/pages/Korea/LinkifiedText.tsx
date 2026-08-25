import { sx } from '@/styles/merge'
import type { StyleXStyles } from '@stylexjs/stylex'
import { linkifiedText } from './LinkifiedText.stylex'
import { linkStyles } from './korea.stylex'
import { Fragment, useMemo } from "react"
import { tokenize, type LinkifySegment, type LinkifyKind } from "./linkify"
import { Time } from "./Time"
import { useEntityIndex, type EntityMatch } from "./entityIndex"
import { SmartEntity } from "./SmartEntity"

interface LinkifiedTextProps {
  children: string
  style?: StyleXStyles
}

const linkStyle: Record<LinkifyKind, StyleXStyles | null> = {
  flight: linkStyles.chip,
  ktx: linkStyles.chip,
  map: linkStyles.chip,
  phone: linkStyles.rose,
  email: linkStyles.roseBreakAll,
  url: linkStyles.roseBreakAll,
  stationLine: linkStyles.stationDashed,
  hashtag: linkStyles.hashtag,
  time: null,
}

const linkPrefix: Partial<Record<LinkifyKind, string>> = {
  flight: "✈️",
  ktx: "🚄",
  map: "📍",
  phone: "☎️",
  email: "✉️",
}

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
  if (!matchRegex) {
    return tokenize(text).map<Segment>((seg) =>
      seg.kind === "text" ? { kind: "text", value: seg.value } : { kind: "link", segment: seg },
    )
  }

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
    return tokenize(text).map<Segment>((seg) =>
      seg.kind === "text" ? { kind: "text", value: seg.value } : { kind: "link", segment: seg },
    )
  }

  spans.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
  const kept: typeof spans = []
  let cursor = 0
  for (const s of spans) {
    if (s.start < cursor) continue
    kept.push(s)
    cursor = s.end
  }

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

export function LinkifiedText({ children, style }: LinkifiedTextProps) {
  const { matchRegex, resolve } = useEntityIndex()
  const segments = useMemo(
    () => segmentWithEntities(children, matchRegex, resolve),
    [children, matchRegex, resolve],
  )

  return (
    <span {...sx(style)}>
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
        const ls = linkStyle[link.type]
        return (
          <a
            key={i}
            href={link.href}
            target={link.type === "phone" || link.type === "email" ? undefined : "_blank"}
            rel={link.type === "phone" || link.type === "email" ? undefined : "noreferrer"}
            title={link.tip}
            {...sx(ls ?? undefined)}
          >
            {linkPrefix[link.type] && (
              <span aria-hidden {...sx(linkifiedText.s55426dfb)}>
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
