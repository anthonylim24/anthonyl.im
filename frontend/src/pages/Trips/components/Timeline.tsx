import type { ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { EASE, REVEAL_DURATION, revealDelay, rowPerfClass, timeCellClass } from "../ui"

/**
 * Continuous hairline gutter with mono time marks. Children are
 * `TimelineItem` entries; untimed items keep the column so the rail stays
 * straight.
 */
export function Timeline({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="relative mt-10">
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-2 top-2 left-[3.35rem] w-px bg-[color:var(--tr-line)]"
      />
      <ol aria-label={label}>{children}</ol>
    </div>
  )
}

export function TimelineItem({
  time,
  endTime,
  index = 0,
  children,
}: {
  time?: string
  endTime?: string
  index?: number
  children: ReactNode
}) {
  const reduce = useReducedMotion()

  return (
    <motion.li
      className={`relative grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-4 py-2.5 ${rowPerfClass}`}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: REVEAL_DURATION, ease: EASE, delay: revealDelay(index) }}
    >
      <div className={`pt-1 text-right ${timeCellClass}`}>
        {time ? <time dateTime={time}>{time}</time> : <span className="sr-only">No time set</span>}
        {endTime ? <span className="mt-0.5 block">{endTime}</span> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </motion.li>
  )
}
