import { motion, useReducedMotion } from "motion/react"
import { ACCENT } from "../theme"
import { EASE, REVEAL_DURATION, SERIF, mutedInkClass, wrapAnywhereClass } from "../ui"

type Scale = "page" | "section"

const TITLE_CLASS: Record<Scale, string> = {
  page: "mt-3 font-display text-[clamp(1.75rem,4vw,2.5rem)] font-medium leading-[1.08] tracking-[-0.02em]",
  section: "mt-2 font-display text-2xl font-medium leading-tight tracking-[-0.01em] sm:text-3xl",
}

/**
 * The numbered editorial rule that opens every dossier section ("01 — Booked
 * moments"). Shared by the trip overview and day pages so the two read as one
 * document.
 */
export function DossierSectionHeader({
  num,
  eyebrow,
  title,
  subtitle,
  scale = "section",
  animate = false,
}: {
  num: string
  eyebrow: string
  title: string
  subtitle?: string
  scale?: Scale
  animate?: boolean
}) {
  const reduce = useReducedMotion()
  const reveal = animate && !reduce

  return (
    <motion.header
      initial={reveal ? { opacity: 0, y: 6 } : false}
      whileInView={reveal ? { opacity: 1, y: 0 } : undefined}
      viewport={{ once: true }}
      transition={{ duration: REVEAL_DURATION, ease: EASE }}
      className={`border-b border-stone-200/80 dark:border-stone-800/80 ${scale === "page" ? "pb-5" : "pb-4"}`}
    >
      <p className={`flex items-center gap-3 font-mono-trips text-[11px] uppercase tracking-[0.24em] ${mutedInkClass}`}>
        <span className={`tabular-nums ${ACCENT.text}`}>{num}</span>
        <span aria-hidden className={`h-px w-8 ${ACCENT.hairline}`} />
        <span>{eyebrow}</span>
      </p>
      <h2 className={`${TITLE_CLASS[scale]} text-stone-900 dark:text-stone-100`} style={SERIF}>
        {title}
      </h2>
      {subtitle && (
        <p className={`mt-2 max-w-[56ch] text-sm leading-relaxed ${mutedInkClass} ${wrapAnywhereClass}`}>
          {subtitle}
        </p>
      )}
    </motion.header>
  )
}
