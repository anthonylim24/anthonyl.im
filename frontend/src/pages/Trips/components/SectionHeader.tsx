import { motion, useReducedMotion } from "motion/react"
import { DISPLAY, EASE, REVEAL_DURATION, displaySectionClass, mutedInkClass, wrapAnywhereClass } from "../ui"

/**
 * Plain section title. No numerals, no hairline rule, no uppercase
 * tracking label: the heading is the label.
 */
export function SectionHeader({
  title,
  subtitle,
  animate = false,
}: {
  title: string
  subtitle?: string
  animate?: boolean
}) {
  const reduce = useReducedMotion()
  const reveal = animate && !reduce

  return (
    <motion.header
      initial={reveal ? { opacity: 0, y: 8 } : false}
      whileInView={reveal ? { opacity: 1, y: 0 } : undefined}
      viewport={{ once: true }}
      transition={{ duration: REVEAL_DURATION, ease: EASE }}
    >
      <h2 className={displaySectionClass} style={DISPLAY}>
        {title}
      </h2>
      {subtitle ? (
        <p className={`mt-2 max-w-[56ch] text-sm leading-relaxed ${mutedInkClass} ${wrapAnywhereClass}`}>
          {subtitle}
        </p>
      ) : null}
    </motion.header>
  )
}
