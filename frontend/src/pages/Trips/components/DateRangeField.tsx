import { useEffect, useId, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"

// Custom dual-month range calendar — no external date library. Dates are ISO
// yyyy-mm-dd strings end to end (matching the trip model), so there's no
// timezone drift between what the user picks and what the server stores.

interface DateRangeFieldProps {
  startDate: string
  endDate: string
  onChange: (startDate: string, endDate: string) => void
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
  return `${fmt(startDate, !sameYear)} – ${fmt(endDate, true)} · ${nights + 1} day${nights ? "s" : ""}`
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

  return (
    <div className="w-[16.5rem]">
      <div className="px-1 text-center text-sm font-semibold text-stone-800 dark:text-stone-200">
        {monthLabel(year, month)}
      </div>
      <div className="mt-2 grid grid-cols-7 text-center" role="rowgroup" aria-hidden>
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="py-1 text-[11px] font-medium text-stone-400 dark:text-stone-500">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7" onMouseLeave={() => onHover(null)}>
        {cells.map((iso, i) => {
          if (!iso) return <span key={i} aria-hidden />
          const isStart = iso === start
          const isEnd = iso === (previewEnd || start)
          const isEdge = isStart || isEnd
          return (
            <button
              key={iso}
              type="button"
              tabIndex={-1}
              data-iso={iso}
              onClick={() => onPick(iso)}
              onMouseEnter={() => onHover(iso)}
              onFocus={() => onHover(iso)}
              aria-label={toUtc(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}
              aria-pressed={isEdge}
              className={[
                "relative mx-auto my-0.5 flex h-9 w-9 items-center justify-center text-[13px] tabular-nums outline-none transition-colors duration-150",
                isEdge
                  ? "rounded-full bg-amber-700 font-semibold text-white dark:bg-amber-500 dark:text-stone-950"
                  : inRange(iso)
                    ? "rounded-none bg-amber-100/80 text-amber-950 dark:bg-amber-500/15 dark:text-amber-200"
                    : "rounded-full text-stone-700 hover:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-800",
                iso === today && !isEdge ? "font-semibold text-amber-700 dark:text-amber-400" : "",
                "focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-1",
              ].join(" ")}
            >
              {Number(iso.slice(8, 10))}
              {iso === today && !isEdge && (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-amber-600" aria-hidden />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function DateRangeField({ startDate, endDate, onChange }: DateRangeFieldProps) {
  const reduce = useReducedMotion()
  const labelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  // selecting=true → start picked, waiting for the end date.
  const [selecting, setSelecting] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const anchor = startDate || todayIso()
  const [view, setView] = useState(() => ({
    year: Number(anchor.slice(0, 4)),
    month: Number(anchor.slice(5, 7)) - 1,
  }))

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
      // Roving arrow-key navigation across day buttons.
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter"].includes(e.key)) {
        const buttons = [...(gridRef.current?.querySelectorAll<HTMLButtonElement>("button[data-iso]") ?? [])]
        const active = document.activeElement as HTMLButtonElement | null
        const idx = buttons.findIndex((b) => b === active)
        if (idx < 0) return
        const delta = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" ? -7 : e.key === "ArrowDown" ? 7 : 0
        if (delta !== 0) {
          e.preventDefault()
          buttons[Math.max(0, Math.min(buttons.length - 1, idx + delta))]?.focus()
        }
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
  }, [open])

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
      }
    }
  }

  const next = new Date(Date.UTC(view.year, view.month + 1, 1))

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-labelledby={labelId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-left text-sm text-stone-900 transition hover:border-stone-400 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-600/25 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:border-stone-600"
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
        <span id={labelId} className={startDate ? "" : "text-stone-500 dark:text-stone-400"}>
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
            className="absolute left-0 top-[calc(100%+0.5rem)] z-40 rounded-2xl border border-stone-200 bg-white p-4 shadow-xl shadow-stone-950/10 dark:border-stone-700 dark:bg-stone-900 dark:shadow-black/40"
          >
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="rounded-full p-2 text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:hover:bg-stone-800 dark:hover:text-stone-200"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <p className="text-xs text-stone-500 dark:text-stone-400" aria-live="polite">
                {selecting ? "Now pick the last day" : "Pick the first day"}
              </p>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="rounded-full p-2 text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:hover:bg-stone-800 dark:hover:text-stone-200"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
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
