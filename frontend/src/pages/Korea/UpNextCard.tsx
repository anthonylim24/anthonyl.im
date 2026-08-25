import { sx } from '@/styles/merge'
import { upNextCard } from './UpNextCard.stylex'
import { markerStyles } from './korea.stylex'
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowUpRight } from "lucide-react"
import type { Snapshot } from "./types"
import { countdownTo, formatCountdown, makeKstDate, upcomingReservations } from "./koreaUtils"
import { statusMeta, typeMeta, formatDate } from "./koreaTheme"

interface UpNextCardProps {
  snapshot: Snapshot
}

/**
 * Up-next row — what was a filled rose card now reads as a hairline
 * editorial line, paired with the countdown. The rose moment in the
 * route is the hero numeral; this is the supporting line, not a
 * second rose card competing for attention.
 */
export function UpNextCard({ snapshot }: UpNextCardProps) {
  const reduce = useReducedMotion()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const upcoming = upcomingReservations(snapshot, 1)
  const next = upcoming[0]
  if (!next) return null

  const target = makeKstDate(next.date, next.time ?? "12:00")
  const cd = countdownTo(target, now)
  const s = statusMeta[next.status]
  const t = typeMeta[next.type]
  const dayLink = next.dayNumber ? snapshot.days.find((d) => d.n === next.dayNumber)?.slug : undefined

  const detailLine = [
    formatDate(next.date, { weekday: "short", month: "short", day: "numeric" }),
    next.time,
    next.address,
  ]
    .filter(Boolean)
    .join("  ·  ")

  const Wrapper: React.ElementType = dayLink ? Link : "div"
  const wrapperProps: Record<string, unknown> = dayLink ? { to: `/korea/day/${dayLink}` } : {}

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
      {...sx(upNextCard.sce8d595f)}
    >
      <Wrapper
        {...wrapperProps}
        {...sx(upNextCard.wrapper, dayLink ? upNextCard.wrapperLink : undefined)}
      >
        <div {...sx(upNextCard.sc4049d37)}>
          {/* Eyebrow with rose dot + countdown */}
          <p {...sx(upNextCard.sda4d7977)}>
            <span aria-hidden {...sx(upNextCard.s421599fa)} />
            Up next
            <span aria-hidden {...sx(upNextCard.s146516be)}>·</span>
            <span {...sx(upNextCard.sd1fc735d)}>{formatCountdown(cd)}</span>
          </p>

          {/* Status label as a typographic mark, not a colored pill */}
          <p {...sx(upNextCard.sa8fa1afe)}>
            <span aria-hidden {...sx(markerStyles.dot, markerStyles.dotMargin, s.dot)} />
            {s.label}
          </p>
        </div>

        <div {...sx(upNextCard.sbf4a3002)}>
          <span aria-hidden {...sx(upNextCard.s8b2f6784)} title={t.label}>
            {t.icon}
          </span>
          <p
            {...sx(upNextCard.s4cddd6f0)}
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            {next.title}
          </p>
          {dayLink && (
            <ArrowUpRight
              aria-hidden
              {...sx(upNextCard.se0ae9f9e)}
            />
          )}
        </div>

        {detailLine && (
          <p {...sx(upNextCard.sb5d06877)}>
            {detailLine}
          </p>
        )}
      </Wrapper>
    </motion.section>
  )
}
