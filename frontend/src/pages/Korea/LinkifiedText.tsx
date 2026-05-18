import { Fragment } from "react"
import { tokenize, type LinkifyKind } from "./linkify"
import { Time } from "./Time"

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

export function LinkifiedText({ children, className }: LinkifiedTextProps) {
  const segments = tokenize(children)
  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.kind === "text") return <Fragment key={i}>{seg.value}</Fragment>
        if (seg.type === "time") return <Time key={i} value={seg.value} />
        return (
          <a
            key={i}
            href={seg.href}
            target={seg.type === "phone" || seg.type === "email" ? undefined : "_blank"}
            rel={seg.type === "phone" || seg.type === "email" ? undefined : "noreferrer"}
            title={seg.tip}
            className={linkClass[seg.type]}
          >
            {linkPrefix[seg.type] && (
              <span aria-hidden className="text-[10px]">
                {linkPrefix[seg.type]}
              </span>
            )}
            {seg.value}
          </a>
        )
      })}
    </span>
  )
}
