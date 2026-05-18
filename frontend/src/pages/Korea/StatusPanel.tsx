import { motion, useReducedMotion } from "motion/react"
import type { Snapshot } from "./types"

interface StatusPanelProps {
  status: Snapshot["status"]
}

/**
 * Trip status panel — written like a dispatch from the trip planner.
 *
 * Editorial chapter shell (eyebrow + Cormorant title + hairline rule) so
 * it sits in rhythm with the rest of the index. Four tonal columns hold
 * weather / book-now / adds / corrections; the tone is conveyed by a
 * small colored marker, not a full-panel glass backdrop. Empty groups
 * collapse out of the layout so the page never reads as half-filled.
 */
export function StatusPanel({ status }: StatusPanelProps) {
  const reduce = useReducedMotion()

  const groups = (
    [
      { id: "weather", label: "Weather", tone: "amber", items: status.weather },
      { id: "book", label: "Book now", tone: "rose", items: status.bookActions.map((a) => a.label) },
      { id: "adds", label: "Adds", tone: "emerald", items: status.adds },
      { id: "corrections", label: "Corrections", tone: "sky", items: status.corrections },
    ] as const
  ).filter((g) => g.items.length > 0)

  if (groups.length === 0) return null

  return (
    <section className="mx-auto mt-16 max-w-6xl px-4 sm:mt-20 sm:px-6">
      <motion.header
        initial={reduce ? false : { opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="border-b border-stone-200/80 pb-5 dark:border-stone-800/80"
      >
        <p className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.28em] text-stone-500 dark:text-stone-500">
          <span className="tabular-nums text-rose-600/90 dark:text-rose-400/90">T−{status.tMinus}</span>
          <span aria-hidden className="h-px w-10 bg-stone-300 dark:bg-stone-700" />
          <span>Dispatch · as of {status.asOf}</span>
        </p>
        <h2
          className="mt-3 font-serif text-[clamp(2rem,5.4vw,3.25rem)] font-medium leading-[1.05] tracking-[-0.02em] text-stone-900 dark:text-stone-100"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          Trip status
        </h2>
      </motion.header>

      <div className="mt-8 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {groups.map((g) => (
          <StatusGroup key={g.id} label={g.label} items={g.items} tone={g.tone} />
        ))}
      </div>
    </section>
  )
}

type Tone = "amber" | "rose" | "emerald" | "sky"

function StatusGroup({ label, items, tone }: { label: string; items: string[]; tone: Tone }) {
  const reduce = useReducedMotion()
  const markerCls = {
    amber: "bg-amber-500 dark:bg-amber-400",
    rose: "bg-rose-500 dark:bg-rose-400",
    emerald: "bg-emerald-500 dark:bg-emerald-400",
    sky: "bg-sky-500 dark:bg-sky-400",
  }[tone]

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="min-w-0"
    >
      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-stone-600 dark:text-stone-400">
        <span aria-hidden className={"inline-block h-1.5 w-1.5 rounded-full " + markerCls} />
        {label}
        <span aria-hidden className="ml-auto tabular-nums text-stone-400 dark:text-stone-600">
          {String(items.length).padStart(2, "0")}
        </span>
      </p>
      <ul className="mt-3 space-y-2.5 text-[13px] leading-snug text-stone-700 dark:text-stone-300">
        {items.map((item, i) => (
          <motion.li
            key={i}
            initial={reduce ? false : { opacity: 0, y: 4 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: reduce ? 0 : Math.min(i, 6) * 0.03 }}
            className="break-words"
          >
            {item}
          </motion.li>
        ))}
      </ul>
    </motion.div>
  )
}
