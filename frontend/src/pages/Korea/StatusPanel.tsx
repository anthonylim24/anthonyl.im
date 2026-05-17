import { motion, useReducedMotion } from "motion/react"
import type { Snapshot } from "./types"

interface StatusPanelProps {
  status: Snapshot["status"]
}

export function StatusPanel({ status }: StatusPanelProps) {
  const reduce = useReducedMotion()

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <motion.h2
        initial={reduce ? false : { opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className="font-serif text-2xl text-stone-900 sm:text-3xl dark:text-stone-100"
        style={{ fontFamily: "'Cormorant Garamond', serif" }}
      >
        T-{status.tMinus} status
      </motion.h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">As of {status.asOf}</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Group title="🌡️ Weather" items={status.weather} tone="amber" />
        <Group title="🔴 Book now" items={status.bookActions.map((a) => a.label)} tone="rose" />
        <Group title="✨ Adds" items={status.adds} tone="emerald" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Group title="🔧 Corrections vs T-15" items={status.corrections} tone="sky" />
      </div>
    </section>
  )
}

function Group({ title, items, tone }: { title: string; items: string[]; tone: "amber" | "rose" | "emerald" | "sky" }) {
  const toneClass = {
    amber: "border-amber-200/70 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20",
    rose: "border-rose-200/70 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/20",
    emerald: "border-emerald-200/70 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20",
    sky: "border-sky-200/70 bg-sky-50/50 dark:border-sky-900/40 dark:bg-sky-950/20",
  }[tone]
  const reduce = useReducedMotion()

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className={"rounded-2xl border p-5 backdrop-blur " + toneClass}
    >
      <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-stone-700 dark:text-stone-300">
        {items.map((item, i) => (
          <motion.li
            key={i}
            initial={reduce ? false : { opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: reduce ? 0 : i * 0.04, type: "spring", stiffness: 380, damping: 28 }}
            className="flex gap-2 leading-snug"
          >
            <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-current opacity-50" />
            <span>{item}</span>
          </motion.li>
        ))}
      </ul>
    </motion.div>
  )
}
