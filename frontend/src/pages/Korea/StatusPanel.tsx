import { sx } from '@/styles/merge'
import { statusPanel } from './StatusPanel.stylex'
import { markerStyles, statusStyles } from './korea.stylex'
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

  // Ink + rose + emerald only. Weather and corrections are stone (neutral
  // dispatch); book-now is the one urgent moment (rose); adds keeps
  // emerald because "new locked-in items" parallels confirmed status.
  const groups = (
    [
      { id: "weather", label: "Weather", tone: "stone", items: status.weather },
      { id: "book", label: "Book now", tone: "rose", items: status.bookActions.map((a) => a.label) },
      { id: "adds", label: "Adds", tone: "emerald", items: status.adds },
      { id: "corrections", label: "Corrections", tone: "stone", items: status.corrections },
    ] as const
  ).filter((g) => g.items.length > 0)

  if (groups.length === 0) return null

  return (
    <section {...sx(statusPanel.sf10e06ed)}>
      <motion.header
        initial={reduce ? false : { opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        {...sx(statusPanel.sfeda29b9)}
      >
        <p {...sx(statusPanel.s6ebd97a0)}>
          <span {...sx(statusPanel.s1ed0b4fd)}>T−{status.tMinus}</span>
          <span aria-hidden {...sx(statusPanel.sd1fcfbe6)} />
          <span>Dispatch · as of {status.asOf}</span>
        </p>
        <h2
          {...sx(statusPanel.s5187ae33)}
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          Trip status
        </h2>
      </motion.header>

      <div {...sx(statusPanel.sa9fe7956)}>
        {groups.map((g) => (
          <StatusGroup key={g.id} label={g.label} items={g.items} tone={g.tone} />
        ))}
      </div>
    </section>
  )
}

type Tone = "stone" | "rose" | "emerald"

function StatusGroup({ label, items, tone }: { label: string; items: string[]; tone: Tone }) {
  const reduce = useReducedMotion()
  const markerDot = {
    stone: statusStyles.dotStone,
    rose: statusStyles.dotRose,
    emerald: statusStyles.dotEmerald,
  }[tone]

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      {...sx(statusPanel.s3f58665f)}
    >
      <p {...sx(statusPanel.se186a33a)}>
        <span aria-hidden {...sx(markerStyles.dot, markerDot)} />
        {label}
        <span aria-hidden {...sx(statusPanel.s1bd416de)}>
          {String(items.length).padStart(2, "0")}
        </span>
      </p>
      <ul {...sx(statusPanel.s5cd7e8ad)}>
        {items.map((item, i) => (
          <motion.li
            key={i}
            initial={reduce ? false : { opacity: 0, y: 4 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: reduce ? 0 : Math.min(i, 6) * 0.03 }}
            {...sx(statusPanel.s13588c5b)}
          >
            {item}
          </motion.li>
        ))}
      </ul>
    </motion.div>
  )
}
