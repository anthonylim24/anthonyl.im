import { Fragment } from "react"
import { tokenize, type LinkifyKind } from "./linkify"

interface LinkifiedTextProps {
  children: string
  className?: string
}

// Common: `max-w-full [overflow-wrap:anywhere]` lets long unbreakable strings
// (Korean addresses, station IDs) shrink instead of pushing their parent flex.
const baseChip = "max-w-full align-baseline [overflow-wrap:anywhere] [word-break:break-word]"

const linkClass: Record<LinkifyKind, string> = {
  flight:
    `inline-flex items-center gap-0.5 rounded bg-sky-100 px-1.5 py-0.5 font-medium text-sky-900 underline decoration-sky-500/40 underline-offset-2 transition hover:bg-sky-200 dark:bg-sky-950/50 dark:text-sky-100 dark:hover:bg-sky-900/60 ${baseChip}`,
  ktx:
    `inline-flex items-center gap-0.5 rounded bg-purple-100 px-1.5 py-0.5 font-medium text-purple-900 underline decoration-purple-500/40 underline-offset-2 transition hover:bg-purple-200 dark:bg-purple-950/50 dark:text-purple-100 dark:hover:bg-purple-900/60 ${baseChip}`,
  phone:
    "break-words underline decoration-emerald-500/50 underline-offset-2 transition hover:text-emerald-700 dark:hover:text-emerald-300",
  email:
    "break-all underline decoration-amber-500/50 underline-offset-2 transition hover:text-amber-700 dark:hover:text-amber-300",
  url:
    "break-all underline decoration-rose-500/50 underline-offset-2 transition hover:text-rose-700 dark:hover:text-rose-300",
  map:
    `inline-flex items-center gap-0.5 rounded bg-rose-100 px-1.5 py-0.5 font-medium text-rose-900 transition hover:bg-rose-200 dark:bg-rose-950/40 dark:text-rose-100 dark:hover:bg-rose-900/60 ${baseChip}`,
  stationLine:
    "break-words underline decoration-stone-400/60 underline-offset-2 transition hover:text-stone-900 dark:hover:text-stone-100",
  hashtag: "text-stone-600 dark:text-stone-400",
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
      {segments.map((seg, i) =>
        seg.kind === "text" ? (
          <Fragment key={i}>{seg.value}</Fragment>
        ) : (
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
        ),
      )}
    </span>
  )
}
