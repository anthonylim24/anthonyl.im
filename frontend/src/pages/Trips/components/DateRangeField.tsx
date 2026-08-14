import { useEffect, useId, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import {
  ENTER_SPRING,
  EXIT_FADE,
  accentIconClass,
  fieldShellClass,
  focusRingClass,
  iconBtnClass,
  mutedInkClass,
  popoverClass,
} from "../ui"

// Custom dual-month range calendar. No external date library. Dates are ISO
// yyyy-mm-dd strings end to end (matching the trip model), so there is no
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

/** 6x7 matrix of ISO dates for a month (Sunday-first), null = out of month. */
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
  return `${fmt(startDate, !sameYear)} - ${fmt(endDate, true)}, ${nights + 1} day${nights ? "s" : ""}`
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
  // While picking the end date, preview the span to the hovered day.
  const previewEnd = selecting && hovered && hovered >= start ? hovered : end
  const inRange = (iso: string) => start && previewEnd && iso > start && iso < previewEnd
  // The tint runs edge to edge behind the day cells, so a multi-day range
  // reads as one band rather than a row of separate swatches.
  const last = previewEnd || start
  const banded = (iso: string | null | undefined) =>
    !!iso && !!start && last > start && iso >= start && iso <= last

  return (
    // Day cells fill their column so the range band is continuous. The month
    // is wider below `sm`, where only one shows, to hold a 44px touch target.
    <div className="w-[19.25rem] sm:w-[16.5rem]">
      <div className="px-1 text-center text-sm font-semibold">{monthLabel(year, month)}</div>
      <div className={`mt-2 grid grid-cols-7 text-center ${mutedInkClass}`} aria-hidden>
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="py-1 text-[11px] font-medium">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7" onMouseLeave={() => onHover(null)}>
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
              // Selection is spoken in the name rather than through
              // `aria-pressed`: these days are dates in a range, not toggles.
              aria-label={dayLabel(iso, { isStart, isEnd, inRange: !!inRange(iso) })}
              aria-current={iso === today ? "date" : undefined}
              className={[
                "relative flex h-11 w-full items-center justify-center rounded-[var(--tr-r-control)] text-[13px] tabular-nums outline-none transition-colors duration-150 sm:h-10",
                isEdge || inBand ? "" : `hover:bg-[var(--tr-overlay)]`,
                iso === today && !isEdge ? `font-semibold ${accentIconClass}` : "",
                `${focusRingClass} focus-visible:ring-inset`,
              ].join(" ")}
            >
              {inBand && (
                <span
                  aria-hidden
                  className={[
                    "absolute inset-y-0 bg-[color:var(--ta-soft)]",
                    isStart ? "left-1/2" : banded(cells[i - 1]) && i % 7 !== 0 ? "left-0" : "left-0 rounded-l-[var(--tr-r-control)]",
                    isEnd ? "right-1/2" : banded(cells[i + 1]) && i % 7 !== 6 ? "right-0" : "right-0 rounded-r-[var(--tr-r-control)]",
                  ].join(" ")}
                />
              )}
              {isEdge && (
                <span aria-hidden className="absolute inset-0 rounded-[var(--tr-r-control)] bg-[color:var(--ta)]" />
              )}
              <span
                className={
                  isEdge
                    ? "relative font-semibold text-[color:var(--ta-ink)]"
                    : inBand
                      ? "relative"
                      : "relative"
                }
              >
                {Number(iso.slice(8, 10))}
              </span>
              {iso === today && !isEdge && (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[color:var(--ta)]" aria-hidden />
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
  // selecting=true means start picked, waiting for the end date.
  const [selecting, setSelecting] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const anchor = startDate || todayIso()
  const [view, setView] = useState(() => ({
    year: Number(anchor.slice(0, 4)),
    month: Number(anchor.slice(5, 7)) - 1,
  }))

  useEffect(() => {
    if (!open) return
    // Focus first selectable day (or the current start) so arrow keys work.
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
        // Focus was inside the grid that is about to unmount, so it goes back
        // to the control that opened it.
        setOpen(false)
        triggerRef.current?.focus()
        return
      }
      // Roving arrow-key navigation across day buttons.
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
        onChange(iso, iso) // restart from the earlier day
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
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-labelledby={labelId}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onClick={() => setOpen((o) => !o)}
        className={`min-h-11 w-full text-left ${fieldShellClass} ${
          invalid ? "border-[color:var(--tr-danger)]" : ""
        }`}
      >
        <CalendarDays className={`h-4 w-4 shrink-0 ${accentIconClass}`} strokeWidth={1.5} aria-hidden />
        <span id={labelId} className={`min-w-0 truncate text-sm ${startDate ? "" : mutedInkClass}`}>
          {startDate && endDate ? formatRangeLabel(startDate, endDate) : "Select trip dates"}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Choose trip dates"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: reduce ? { duration: 0 } : EXIT_FADE }}
            transition={reduce ? { duration: 0 } : ENTER_SPRING}
            className={`absolute left-0 top-[calc(100%+0.5rem)] z-40 p-4 ${popoverClass}`}
          >
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className={iconBtnClass}
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              </button>
              <p className={`text-xs ${mutedInkClass}`} aria-live="polite">
                {selecting ? "Now pick the last day" : "Pick the first day"}
              </p>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className={iconBtnClass}
              >
                <ChevronRight className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              </button>
            </div>
            <div ref={gridRef} className="mt-2 flex gap-6">
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
              <div className="hidden sm:block">
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
