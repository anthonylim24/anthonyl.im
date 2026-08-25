import { sx } from '@/styles/merge'
import { dayCard } from './DayCard.stylex'
import { Link } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { useFineHover } from "@/hooks/useFineHover"
import type { Day } from "./types"
import { cityMeta, formatDate } from "./koreaTheme"
import { isPastDate } from "./koreaUtils"
import { useScrollReveal, REVEAL_CLASSES } from "./_motion/scrollReveal"

interface DayCardProps {
  day: Day
  index: number
  reservationsCount: number
  isToday?: boolean
}

export function DayCard({ day, index: _index, reservationsCount, isToday = false }: DayCardProps) {
  const reduce = useReducedMotion()
  const fineHover = useFineHover()
  const cityTag = cityMeta[day.city]?.tag ?? day.city.slice(0, 2).toUpperCase()
  const isPast = !isToday && isPastDate(day.date)
  // Scroll-driven reveal — each card eases into place individually as it
  // crosses ~30% of the viewport. Replaces the prior whileInView stagger,
  // which all fired at once for the cards that were already on-screen.
  const reveal = useScrollReveal<HTMLDivElement>()

  return (
    <div
      ref={reveal}
      {...sx(dayCard.revealWrap, REVEAL_CLASSES)}
      data-reveal-card
    >
      <motion.div
        whileHover={reduce || !fineHover ? undefined : { y: -2, transition: { duration: 0.18 } }}
        whileTap={reduce ? undefined : { scale: 0.99 }}
        {...sx(dayCard.sb42244d4)}
      >
        <Link
          to={`/korea/day/${day.slug}`}
          aria-current={isToday ? "date" : undefined}
          {...sx(
            dayCard.cardLink,
            isToday ? dayCard.cardLinkToday : dayCard.cardLinkDefault,
            isPast ? dayCard.cardLinkPast : undefined,
            'group',
          )}
        >
          {isToday && (
            <span {...sx(dayCard.s7982aa2a)}>
              <span aria-hidden {...sx(dayCard.s421599fa)} />
              Today
            </span>
          )}

          <div {...sx(dayCard.s324c199f)}>
            <div {...sx(dayCard.s8d053440)}>
              <div {...sx(dayCard.s2c12ad9b)}>
                <span
                  aria-label={day.city}
                  title={day.city}
                  {...sx(dayCard.s631d90a6)}
                >
                  {cityTag}
                </span>
                <span aria-hidden {...sx(dayCard.s146516be)}>·</span>
                <span {...sx(dayCard.se3a36da5)}>
                  Day {String(day.n).padStart(2, "0")}
                </span>
              </div>
              {!isToday && (
                <span aria-hidden {...sx(dayCard.s379c9d20)}>
                  {day.emoji}
                </span>
              )}
            </div>

            <h3
              {...sx(dayCard.s6bf5d960)}
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              {day.title}
            </h3>

            <p {...sx(dayCard.s5590cb5c)}>{day.theme}</p>

            {day.neighborhoods.length > 0 && (
              <p {...sx(dayCard.scdfd3463)}>
                {day.neighborhoods.slice(0, 3).join("  ·  ")}
              </p>
            )}

            <div {...sx(dayCard.sb69e2350)}>
              <span {...sx(dayCard.s31c70300)}>
                {formatDate(day.date, { month: "short", day: "numeric", weekday: "short" })}
              </span>
              <span {...sx(dayCard.s86ff3e5)}>
                {reservationsCount > 0 && (
                  <span {...sx(dayCard.s9dd51fa2)}>
                    <span aria-hidden {...sx(dayCard.s36eebe6c)} />
                    {reservationsCount} booked
                  </span>
                )}
                {day.weather && (
                  <span {...sx(dayCard.sc6aa20e2)}>
                    {day.weather.highC}° / {day.weather.lowC}°
                  </span>
                )}
              </span>
            </div>
          </div>
        </Link>
      </motion.div>
    </div>
  )
}
