import { useEffect, useId, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import {
  accentIconClass,
  focusRingInsetClass,
  iconBtnClass,
  inputClass,
  mutedInkClass,
  popoverClass,
} from "../ui"
import { sx } from '@/lib/utils'
import {
  dateBandState,
  dateDayBtnState,
  dateDayNumState,
  styles,
} from '../trips.stylex'

// Custom dual-month range calendar — no external date library. Dates are ISO
// yyyy-mm-dd strings end to end (matching the trip model), so there's no
// timezone drift between what the user picks and what the server stores.

interface DateRangeFieldProps {
  startDate: string
  endDate: string
  onChange: (startDate: string, endDate: string) => void
  invalid?: boolean
  describedBy?: string
}

const DAY_MS = 86_400_000
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"]

const toUtc = (iso: string) => new Date(`${iso}T00:00:00Z`)
const toIso = (d: Date) => d.toISOString().slice(0, 10)
const todayIso = () => toIso(new Date(Date.now() - new Date().getTimezoneOffset() * 60_000))

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

/** 6×7 matrix of ISO dates for a month (Sunday-first), null = out of month. */
function monthMatrix(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1))
  const startOffset = first.getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(toIso(new Date(Date.UTC(year, month, d))))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

/** Spoken name for a day cell: the date, then how it sits in the range. */
function dayLabel(iso: string, state: { isStart: boolean; isEnd: boolean; inRange: boolean }): string {
  const date = toUtc(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
  if (state.isStart && state.isEnd) return `${date}, selected as the only day`
  if (state.isStart) return `${date}, selected as the first day`
  if (state.isEnd) return `${date}, selected as the last day`
  if (state.inRange) return `${date}, within the selected range`
  return date
}

export function formatRangeLabel(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return ""
  const fmt = (iso: string, withYear: boolean) =>
    toUtc(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    })
  const sameYear = startDate.slice(0, 4) === endDate.slice(0, 4)
  const nights = Math.round((toUtc(endDate).getTime() - toUtc(startDate).getTime()) / DAY_MS)
  return `${fmt(startDate, !sameYear)} to ${fmt(endDate, true)} · ${nights + 1} day${nights ? "s" : ""}`
}

function Month({
  year,
  month,
  start,
  end,
  hovered,
  selecting,
  onPick,
  onHover,
}: {
  year: number
  month: number
  start: string
  end: string
  hovered: string | null
  selecting: boolean
  onPick: (iso: string) => void
  onHover: (iso: string | null) => void
}) {
  const cells = useMemo(() => monthMatrix(year, month), [year, month])
  const today = todayIso()
  const previewEnd = selecting && hovered && hovered >= start ? hovered : end
  const inRange = (iso: string) => start && previewEnd && iso > start && iso < previewEnd
  const last = previewEnd || start
  const banded = (iso: string | null | undefined) =>
    !!iso && !!start && last > start && iso >= start && iso <= last

  return (
    <div {...sx(styles.dateMonthWrap)}>
      <div {...sx(styles.dateMonthTitle)}>
        {monthLabel(year, month)}
      </div>
      <div {...sx(styles.dateWeekdayRow, mutedInkClass)} aria-hidden>
        {WEEKDAYS.map((w, i) => (
          <span key={i} {...sx(styles.py1, styles.text11, styles.fontMedium)}>
            {w}
          </span>
        ))}
      </div>
      <div {...sx(styles.dateDayGrid)} onMouseLeave={() => onHover(null)}>
        {cells.map((iso, i) => {
          if (!iso) return <span key={i} aria-hidden />
          const isStart = iso === start
          const isEnd = iso === last
          const isEdge = isStart || isEnd
          const inBand = banded(iso)
          return (
            <button
              key={iso}
              type="button"
              tabIndex={0}
              data-iso={iso}
              onClick={() => onPick(iso)}
              onMouseEnter={() => onHover(iso)}
              onFocus={() => onHover(iso)}
              aria-label={dayLabel(iso, { isStart, isEnd, inRange: !!inRange(iso) })}
              aria-current={iso === today ? "date" : undefined}
              {...sx(
                ...dateDayBtnState(isEdge, inBand, iso === today),
                focusRingInsetClass,
              )}
            >
              {inBand && (
                <span
                  aria-hidden
                  {...sx(
                    ...dateBandState(
                      isStart,
                      isEnd,
                      banded(cells[i - 1]),
                      i,
                      banded(cells[i + 1]),
                    ),
                  )}
                />
              )}
              {isEdge && (
                <span aria-hidden {...sx(styles.dateDayEdge)} />
              )}
              <span {...sx(dateDayNumState(isEdge, inBand))}>
                {Number(iso.slice(8, 10))}
              </span>
              {iso === today && !isEdge && (
                <span {...sx(styles.dateTodayDot)} aria-hidden />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function DateRangeField({ startDate, endDate, onChange, invalid, describedBy }: DateRangeFieldProps) {
  const reduce = useReducedMotion()
  const labelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const anchor = startDate || todayIso()
  const [view, setView] = useState(() => ({
    year: Number(anchor.slice(0, 4)),
    month: Number(anchor.slice(5, 7)) - 1,
  }))

  useEffect(() => {
    if (!open) return
    const focusTarget =
      gridRef.current?.querySelector<HTMLButtonElement>(
        startDate ? `button[data-iso="${startDate}"]` : "button[data-iso]",
      ) ?? gridRef.current?.querySelector<HTMLButtonElement>("button[data-iso]")
    focusTarget?.focus()

    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        triggerRef.current?.focus()
        return
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        const buttons = [...(gridRef.current?.querySelectorAll<HTMLButtonElement>("button[data-iso]") ?? [])]
        const active = document.activeElement as HTMLButtonElement | null
        let idx = buttons.findIndex((b) => b === active)
        if (idx < 0) idx = 0
        const delta = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" ? -7 : 7
        e.preventDefault()
        buttons[Math.max(0, Math.min(buttons.length - 1, idx + delta))]?.focus()
      }
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("touchstart", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("touchstart", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, startDate])

  const shiftMonth = (delta: number) => {
    setView(({ year, month }) => {
      const d = new Date(Date.UTC(year, month + delta, 1))
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() }
    })
  }

  const pick = (iso: string) => {
    if (!selecting) {
      onChange(iso, iso)
      setSelecting(true)
    } else {
      if (iso < startDate) {
        onChange(iso, iso)
      } else {
        onChange(startDate, iso)
        setSelecting(false)
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
  }

  const next = new Date(Date.UTC(view.year, view.month + 1, 1))

  return (
    <div ref={rootRef} {...sx(styles.relative)}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-labelledby={labelId}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onClick={() => setOpen((o) => !o)}
        {...sx(styles.dateTriggerRow, inputClass, invalid ? styles.borderRedInvalid : null)}
      >
        <CalendarDays {...sx(styles.iconSm, styles.shrink0, accentIconClass)} strokeWidth={1.5} aria-hidden />
        <span id={labelId} {...sx(startDate ? null : mutedInkClass)}>
          {startDate && endDate ? formatRangeLabel(startDate, endDate) : "Select trip dates"}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Choose trip dates"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            {...sx(styles.datePopoverAnchored, popoverClass)}
          >
            <div {...sx(styles.dateNavRow)}>
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                {...sx(iconBtnClass)}
              >
                <ChevronLeft {...sx(styles.iconSm)} strokeWidth={1.5} aria-hidden />
              </button>
              <p {...sx(styles.textXs, mutedInkClass)} aria-live="polite">
                {selecting ? "Now pick the last day" : "Pick the first day"}
              </p>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                {...sx(iconBtnClass)}
              >
                <ChevronRight {...sx(styles.iconSm)} strokeWidth={1.5} aria-hidden />
              </button>
            </div>
            <div ref={gridRef} {...sx(styles.dateGridRow)}>
              <Month
                year={view.year}
                month={view.month}
                start={startDate}
                end={endDate}
                hovered={hovered}
                selecting={selecting}
                onPick={pick}
                onHover={setHovered}
              />
              <div {...sx(styles.dateSecondMonth)}>
                <Month
                  year={next.getUTCFullYear()}
                  month={next.getUTCMonth()}
                  start={startDate}
                  end={endDate}
                  hovered={hovered}
                  selecting={selecting}
                  onPick={pick}
                  onHover={setHovered}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
