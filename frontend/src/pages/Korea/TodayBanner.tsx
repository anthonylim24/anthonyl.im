import { sx } from '@/styles/merge'
import { todayBanner } from './TodayBanner.stylex'
import { Link } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import type { Day } from "./types"
import { formatDate } from "./koreaTheme"

interface TodayBannerProps {
  today: Day
}

/**
 * Today banner — the loudest single state in the app. It used to be an
 * emerald pill competing with rose for brand identity. Now it IS the
 * rose moment: a single editorial line with a filled rose dot, ink
 * Cormorant title, hairline rule beneath. No emoji wiggle, no green.
 */
export function TodayBanner({ today }: TodayBannerProps) {
  const reduce = useReducedMotion()
  return (
    <motion.aside
      initial={reduce ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      {...sx(todayBanner.sc373acf4)}
    >
      <Link
        to={`/korea/day/${today.slug}`}
        aria-label={`Today: Day ${today.n}, ${today.title}`}
        {...sx(todayBanner.s11873b0c, 'group')}
      >
        <div {...sx(todayBanner.s9f5bd48a)}>
          <p {...sx(todayBanner.sda4d7977)}>
            <span aria-hidden {...sx(todayBanner.s421599fa)} />
            Today
            <span aria-hidden {...sx(todayBanner.s146516be)}>·</span>
            <span {...sx(todayBanner.sa8c841be)}>
              {formatDate(today.date, { weekday: "long", month: "short", day: "numeric" })}
            </span>
          </p>
          {/* Title + amber marginalia underline. The route is otherwise
              ink-and-rose; this is the ONE amber moment, reserved for
              the most active state in the app. Reads like a yellow
              highlighter mark on a printed itinerary. */}
          <p
            {...sx(todayBanner.sc6d4a1bc)}
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            <span aria-hidden {...sx(todayBanner.sf13f147e)}>
              {today.emoji}
            </span>
            <span {...sx(todayBanner.s7d17252d)}>
              Day {today.n}, {today.title}
              <svg
                aria-hidden
                {...sx(todayBanner.s6a950eb0)}
                viewBox="0 0 200 8"
                preserveAspectRatio="none"
              >
                {/* Hand-drawn squiggle. Two near-overlapping strokes
                    with slight imperfection so it reads as ink on
                    paper, not a CSS underline. */}
                <path
                  d="M 2,5 Q 25,1 60,4 T 130,3 T 198,5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </p>
          <span aria-hidden {...sx(todayBanner.saeafdce5)}>
            Open →
          </span>
        </div>
      </Link>
    </motion.aside>
  )
}
