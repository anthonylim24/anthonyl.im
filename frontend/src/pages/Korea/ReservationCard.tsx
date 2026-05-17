import { motion, useReducedMotion } from "motion/react"
import type { Reservation } from "./types"
import { statusMeta, typeMeta, formatDate } from "./koreaTheme"

interface ReservationCardProps {
  reservation: Reservation
  index?: number
  compact?: boolean
}

export function ReservationCard({ reservation, index = 0, compact = false }: ReservationCardProps) {
  const reduce = useReducedMotion()
  const s = statusMeta[reservation.status]
  const t = typeMeta[reservation.type]

  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ type: "spring", stiffness: 380, damping: 28, delay: reduce ? 0 : index * 0.04 }}
      whileHover={reduce ? undefined : { y: -2, transition: { type: "spring", stiffness: 500, damping: 30 } }}
      className={
        "group relative overflow-hidden rounded-2xl border border-stone-200 bg-white/80 p-4 shadow-sm backdrop-blur transition dark:border-stone-800 dark:bg-stone-900/60 " +
        (compact ? "sm:p-3" : "")
      }
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-xl shadow-inner dark:bg-stone-800"
        >
          {t.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
              {reservation.title}
            </h3>
            <span
              className={"shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider " + s.chip}
            >
              {s.label}
            </span>
          </div>
          {(reservation.time || reservation.date) && (
            <p className="mt-1 font-mono text-xs text-stone-500 dark:text-stone-400">
              {formatDate(reservation.date)}
              {reservation.time ? ` · ${reservation.time}` : ""}
            </p>
          )}
          {reservation.subtitle && !compact && (
            <p className="mt-1.5 text-sm text-stone-700 dark:text-stone-300">{reservation.subtitle}</p>
          )}
          {reservation.address && !compact && (
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">📍 {reservation.address}</p>
          )}
          {reservation.contact && !compact && (
            <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">☎️ {reservation.contact}</p>
          )}
          {reservation.notes && !compact && (
            <p className="mt-2 rounded-md bg-stone-50 px-2.5 py-1.5 text-xs italic text-stone-600 dark:bg-stone-800/60 dark:text-stone-400">
              {reservation.notes}
            </p>
          )}
        </div>
      </div>
    </motion.article>
  )
}
