import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { sx } from "@/styles/merge"
import { addDays, dayCount, plural } from "../meta"
import { a } from "../atlas.stylex"
import { range as r } from "../index.stylex"
import { useClaimEscape } from "./escape"
import { useLeaving } from "./presence"

// One field for the whole date range. It opens a calendar in place: first
// click picks the first day, second click the last, and it closes itself.

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

const utc = (iso: string) => new Date(`${iso}T12:00:00Z`)
const monthOf = (iso: string) => iso.slice(0, 7)
const shiftMonth = (month: string, by: number) => {
  const date = new Date(`${month}-01T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + by)
  return date.toISOString().slice(0, 7)
}

function monthDays(month: string): Array<string | null> {
  const first = new Date(`${month}-01T12:00:00Z`)
  const lead = (first.getUTCDay() + 6) % 7
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ]
}

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  utc(iso).toLocaleDateString("en-US", { timeZone: "UTC", ...opts })

export function formatRangeLong(start: string, end: string): string {
  const day = (iso: string) => fmt(iso, { weekday: "short", month: "short", day: "numeric" })
  return start === end ? day(start) : `${day(start)} → ${day(end)}`
}

export function DateRange({
  start,
  end,
  onChange,
  disabled,
  invalid,
  label = "Dates",
}: {
  start: string
  end: string
  onChange: (start: string, end: string) => void
  disabled?: boolean
  invalid?: boolean
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const leave = useLeaving(open, panelRef)
  const [month, setMonth] = useState(() => monthOf(start))
  /** First click of a new range; the next click completes it. */
  const [anchor, setAnchor] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const panelId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const toggle = () => {
    if (!open) {
      // Opening re-centres on the current start; later edits must not.
      setMonth(monthOf(start))
      setAnchor(null)
      setHover(start)
    }
    setOpen(!open)
  }

  useEffect(() => {
    if (!open) return
    // Bring the whole calendar into view (a dialog's body, or the page, may
    // have it below the fold), then land on the first day so the arrow keys
    // work straight away.
    requestAnimationFrame(() => {
      gridRef.current?.parentElement?.scrollIntoView?.({ block: "nearest" })
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${start}"]`)?.focus({ preventScroll: true })
    })
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    return () => document.removeEventListener("pointerdown", onPointer)
    // Focus lands on the start the panel opened with; later edits must not move it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // `hover` doubles as the keyboard cursor; it only previews a range once the
  // first day has been picked.
  const lo = anchor ? (hover && hover < anchor ? hover : anchor) : start
  const hi = anchor ? (hover && hover > anchor ? hover : anchor) : end

  const pick = (iso: string) => {
    if (!anchor) {
      setAnchor(iso)
      setHover(iso)
      return
    }
    const [from, to] = iso < anchor ? [iso, anchor] : [anchor, iso]
    onChange(from, to)
    setAnchor(null)
    setOpen(false)
    wrapRef.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus()
  }

  const focusDay = (iso: string) => {
    if (monthOf(iso) !== month) setMonth(monthOf(iso))
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${iso}"]`)?.focus())
  }

  useClaimEscape(open, wrapRef)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && open) {
      event.stopPropagation()
      setOpen(false)
      wrapRef.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus()
      return
    }
    const day = (event.target as HTMLElement).dataset?.day
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key]
    if (!day || !step) return
    event.preventDefault()
    const next = addDays(day, step)
    setHover(next)
    focusDay(next)
  }

  // The calendar's single tab stop: the keyboard cursor if it is showing,
  // otherwise the first day of the month showing.
  const wanted = hover ?? start
  const cursor = monthOf(wanted) === month ? wanted : `${month}-01`
  const count = dayCount(start, end)
  return (
    <div ref={wrapRef} {...sx(r.wrap)} onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-invalid={invalid || undefined}
        aria-label={`${label}: ${formatRangeLong(start, end)}, ${plural(count, "day")}. Change dates`}
        disabled={disabled}
        {...sx(a.field, r.trigger, open ? r.triggerOpen : r.triggerHover)}
        onClick={toggle}
      >
        <CalendarDays size={16} strokeWidth={1.75} aria-hidden {...sx(a.noShrink, a.muted)} />
        <span {...sx(a.grow, a.truncate)}>{formatRangeLong(start, end)}</span>
        <span {...sx(a.small, a.noShrink)}>{plural(count, "day")}</span>
      </button>
      {leave.present && (
        <div
          id={panelId}
          role="dialog"
          aria-label={`Choose ${label.toLowerCase()}`}
          // `trips-pop`: the closing animation in index.css.
          {...sx(r.panel, "trips-pop", "trips-glass-sheet")}
          ref={panelRef}
          {...leave.bind}
        >
          <div {...sx(a.between)}>
            <button type="button" {...sx(a.iconBtn, a.iconBtnSm)} aria-label="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
              <ChevronLeft size={18} strokeWidth={1.75} aria-hidden />
            </button>
            <p {...sx(a.small)} role="status" aria-live="polite">
              {anchor ? "Now pick the last day" : "Pick the first day"}
            </p>
            <button type="button" {...sx(a.iconBtn, a.iconBtnSm)} aria-label="Next month" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
              <ChevronRight size={18} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
          <div ref={gridRef} {...sx(r.months)} onMouseLeave={() => setHover(anchor ?? start)}>
            <p {...sx(r.monthName)}>{fmt(`${month}-01`, { month: "long", year: "numeric" })}</p>
            <div {...sx(r.grid)} role="group" aria-label={fmt(`${month}-01`, { month: "long", year: "numeric" })}>
              {WEEKDAYS.map((d) => (
                <span key={d} {...sx(r.dow)} aria-hidden>
                  {d}
                </span>
              ))}
              {monthDays(month).map((iso, i) =>
                iso ? (
                  <button
                    key={iso}
                    type="button"
                    data-day={iso}
                    // One tab stop for the whole calendar; arrows move within it.
                    tabIndex={iso === cursor ? 0 : -1}
                    aria-label={fmt(iso, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                    aria-pressed={iso === lo || iso === hi}
                    {...sx(
                      r.day,
                      iso > lo && iso < hi && r.dayIn,
                      iso === lo && lo !== hi && r.dayStart,
                      iso === hi && lo !== hi && r.dayEnd,
                      (iso === lo || iso === hi) && r.dayEdge,
                    )}
                    onMouseEnter={() => anchor && setHover(iso)}
                    onFocus={() => setHover(iso)}
                    onClick={() => pick(iso)}
                  >
                    <span {...sx(r.dayNum, (iso === lo || iso === hi) && r.dayNumEdge)}>{Number(iso.slice(8))}</span>
                  </button>
                ) : (
                  <span key={`blank-${i}`} aria-hidden />
                ),
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
