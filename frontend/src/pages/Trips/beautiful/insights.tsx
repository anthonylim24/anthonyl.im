import type { ReactNode } from "react"
import { mutedInkClass, softPanelClass, wrapAnywhereClass } from "../ui"
import type { InsightCard } from "./types"

export function InsightCards({ cards }: { cards: InsightCard[] }) {
  if (cards.length === 0) return null
  return (
    <section aria-label="Trip insights" className="grid gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <article key={card.id} className={`p-4 ${softPanelClass}`}>
          <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">{card.title}</h3>
          <p className={`mt-1.5 text-sm leading-relaxed ${mutedInkClass} ${wrapAnywhereClass}`}>{card.body}</p>
          {card.meta && (
            <p className={`mt-2 font-mono-trips text-[11px] tabular-nums ${mutedInkClass}`}>{card.meta}</p>
          )}
        </article>
      ))}
    </section>
  )
}

export function FineTuneCard({
  title,
  open,
  onToggle,
  swatch,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  swatch?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={softPanelClass}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl px-5 py-3.5 text-left"
      >
        <span className="flex items-center gap-2.5 text-sm font-semibold text-stone-900 dark:text-stone-100">
          {swatch}
          {title}
        </span>
        <span className={`text-xs ${mutedInkClass}`}>{open ? "Hide" : "Adjust"}</span>
      </button>
      {open && <div className="space-y-4 border-t border-stone-100 px-5 py-4 dark:border-stone-800">{children}</div>}
    </section>
  )
}
