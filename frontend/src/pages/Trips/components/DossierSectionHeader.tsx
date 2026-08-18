import { motion, useReducedMotion } from "motion/react"
import { EASE, REVEAL_DURATION, mutedInkClass, wrapAnywhereClass } from "../ui"

type Scale = "page" | "section"

const TITLE_CLASS: Record<Scale, string> = {
  page: "text-lg font-semibold tracking-tight",
  section: "text-base font-semibold tracking-tight",
}

/**
 * Quiet section title for the living document. Numbered editorial rules
 * ("01 — Booked moments") were the Korea dossier voice and are gone.
 */
export function DossierSectionHeader({
  title,
  subtitle,
  scale = "section",
  animate = false,
}: {
  num?: string
  eyebrow?: string
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
      className={scale === "page" ? "pb-3" : "pb-2"}
    >
      <h2 className={`${TITLE_CLASS[scale]} text-stone-900 dark:text-stone-100`}>{title}</h2>
      {subtitle && (
        <p className={`mt-1 max-w-[56ch] text-sm leading-relaxed ${mutedInkClass} ${wrapAnywhereClass}`}>
          {subtitle}
        </p>
      )}
    </motion.header>
  )
}
