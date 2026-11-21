import { useEffect, useRef, useState, type CSSProperties } from "react"
import { createPortal, flushSync } from "react-dom"
import { Printer } from "lucide-react"
import { sx } from "@/styles/merge"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { a } from "../atlas.stylex"
import { TripCover } from "../components/TripCover"
import { canRenderMap } from "../map/AtlasMap"
import type { LngLat } from "../map/geo"
import { TO_SCHEDULE } from "../map/geo"
import { ACCENT_FILL, formatClock } from "../meta"
import type { ItineraryItem, Trip } from "../types"
import { p } from "./print.stylex"
import {
  inkOn,
  printDocument,
  PRINT_INK,
  PRINT_PAPER,
  stopFacts,
  TRIP_STILL,
  type PrintBooking,
  type PrintDay,
  type PrintDocument,
} from "./printModel"

// Print the trip: mount this, and it lays the itinerary out as paper (a
// cover, a page per day, a bookings list), draws map stills of the trip and
// each day, opens the print dialog, and calls `onDone` once the dialog is
// over. Unmount it to cancel. The page under it is never touched: the
// printout lives in its own portal, hidden on screen and from assistive tech,
// and the stylesheet that hides the app for printing exists only while it does.

/** A map still that has not arrived this long after the last one is skipped. */
export const STALL_MS = 8000
/** However the maps are going, the printout starts by then. */
const CEILING_MS = 30_000
/** Fonts and decoded pictures get this long before the dialog opens anyway. */
const SETTLE_MS = 2000
/** For browsers that never fire `afterprint`: the dialog is assumed over by then. */
export const AFTERPRINT_FALLBACK_MS = 60_000

/**
 * The print palette, pinned as inline custom properties so they beat the
 * app's dark theme (`html.dark .trips`): light atlas inks on white paper.
 */
function paperTokens(fill: string): CSSProperties {
  return {
    "--trips-canvas": PRINT_PAPER,
    "--trips-surface": PRINT_PAPER,
    "--trips-raised": PRINT_PAPER,
    "--trips-sunken": PRINT_PAPER,
    "--trips-ink": PRINT_INK,
    "--trips-ink-secondary": "#4d5259",
    "--trips-ink-tertiary": "#696e75",
    "--trips-ink-faint": "#9a9ea4",
    // A screen hairline all but vanishes on paper; these survive a laser printer.
    "--trips-line": "rgb(20 23 26 / 0.18)",
    "--trips-line-strong": "rgb(20 23 26 / 0.3)",
    "--ta": fill,
    "--ta-fill": fill,
    "--ta-on": inkOn(fill),
  } as CSSProperties
}

/** A CSS string literal, safe for any trip name. */
function cssString(text: string): string {
  return `"${text.replace(/[\\"]/g, "\\$&").replace(/[\r\n\f]+/g, " ")}"`
}

/**
 * Global rules for while the printout exists: hide the app, show the paper,
 * set the page. Margin boxes (running footer) are ignored where unsupported.
 */
function printCss(name: string): string {
  const foot = `font: 7.5pt Inter, system-ui, sans-serif; color: #696e75;`
  return `
@media screen { .trips-print-root { display: none !important; } }
@media print {
  @page {
    margin: 14mm 14mm 16mm;
    @bottom-left { content: ${cssString(name)}; ${foot} }
    @bottom-right { content: counter(page); ${foot} }
  }
  @page :first {
    @bottom-left { content: none; }
    @bottom-right { content: none; }
  }
  html, body {
    background: #ffffff !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
  }
  body > :not(.trips-print-root) { display: none !important; }
  .trips-print-root { display: block !important; }
}
.trips-print-root { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
`
}

function wait(ms: number): { done: Promise<void>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  const done = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms)
  })
  return { done, cancel: () => clearTimeout(timer) }
}

/** Fonts loaded and pictures decoded, or SETTLE_MS, whichever is first. */
async function settle(root: HTMLElement | null): Promise<void> {
  const pictures = root ? Array.from(root.querySelectorAll("img")) : []
  const ready = Promise.all([
    typeof document.fonts?.ready?.then === "function" ? document.fonts.ready : undefined,
    ...pictures.map((img) => (typeof img.decode === "function" ? img.decode().catch(() => undefined) : undefined)),
  ])
  const cap = wait(SETTLE_MS)
  await Promise.race([ready, cap.done])
  cap.cancel()
}

/**
 * Open the print dialog. `onClose` runs once, when the dialog is over:
 * on `afterprint`, else on the next key or pointer press back on the page,
 * else after AFTERPRINT_FALLBACK_MS. Returns a disposer that removes every
 * listener without calling `onClose`.
 */
function openPrintDialog(title: string, onClose: () => void): () => void {
  const previousTitle = document.title
  const { scrollX, scrollY } = window
  let open = true
  let fallback: ReturnType<typeof setTimeout> | undefined
  const teardown = (): boolean => {
    if (!open) return false
    open = false
    clearTimeout(fallback)
    window.removeEventListener("afterprint", close)
    window.removeEventListener("pointerdown", close, true)
    window.removeEventListener("keydown", close, true)
    if (document.title === title) document.title = previousTitle
    return true
  }
  function close() {
    if (!teardown()) return
    // Printing never costs anyone their place.
    if (window.scrollX !== scrollX || window.scrollY !== scrollY) window.scrollTo(scrollX, scrollY)
    onClose()
  }
  // "Save as PDF" names the file after the document title.
  document.title = title
  window.addEventListener("afterprint", close)
  window.print()
  if (open) {
    // print() returned with the dialog still up (or a browser that never says).
    window.addEventListener("pointerdown", close, true)
    window.addEventListener("keydown", close, true)
    fallback = setTimeout(close, AFTERPRINT_FALLBACK_MS)
  }
  return () => void teardown()
}

type Stage = "maps" | "ready" | "printed"

export function PrintItinerary({ trip, onDone }: { trip: Trip; onDone: () => void }) {
  // The trip as it was when printing was asked for: an autosave or a
  // collaborator's change mid-way must not redraw the maps or print twice.
  const [doc] = useState(() => printDocument(trip, Date.now()))
  const [wantMaps] = useState(() => doc.stills.length > 0 && canRenderMap())
  const [stills, setStills] = useState<Readonly<Record<string, string>>>({})
  const [stage, setStage] = useState<Stage>(wantMaps ? "maps" : "ready")
  const finish = useLatestCallback(onDone)
  const rootRef = useRef<HTMLDivElement>(null)
  /** Set once the dialog has been asked for: never twice for one mount. */
  const printedRef = useRef(false)

  // Map stills, one off-screen map drawing them in turn. A still that
  // stalls (no WebGL context, tiles that never come) is skipped.
  useEffect(() => {
    if (!wantMaps) return
    let dead = false
    let cancel = () => {}
    let got = 0
    const stop = () => {
      if (dead) return
      dead = true
      clearTimeout(stall)
      clearTimeout(ceiling)
      cancel()
      setStage("ready")
    }
    let stall = setTimeout(stop, STALL_MS)
    const ceiling = setTimeout(stop, CEILING_MS)
    import("../map/engine").then(
      ({ renderStills }) => {
        if (dead) return
        const color = ACCENT_FILL[doc.accent]
        cancel = renderStills(
          doc.stills.map((still) => ({
            ...still,
            color,
            labels: still.key === TRIP_STILL ? undefined : still.points.map((_, i) => String(i + 1)),
            labelColor: inkOn(color),
          })),
          false,
          (key, url) => {
            if (dead) return
            setStills((current) => ({ ...current, [key]: url }))
            got += 1
            clearTimeout(stall)
            if (got >= doc.stills.length) stop()
            else stall = setTimeout(stop, STALL_MS)
          },
        )
      },
      // The map chunk could not load: print without pictures.
      stop,
    )
    return () => {
      dead = true
      clearTimeout(stall)
      clearTimeout(ceiling)
      cancel()
    }
  }, [doc, wantMaps])

  // Then the dialog, once, after the pictures have been decoded.
  const disposeRef = useRef<() => void>(() => {})
  useEffect(() => {
    if (stage !== "ready" || printedRef.current) return
    let dead = false
    void settle(rootRef.current).then(() => {
      if (dead || printedRef.current) return
      printedRef.current = true
      // Take the status notice down first: a blocking dialog would freeze it on screen.
      flushSync(() => setStage("printed"))
      disposeRef.current = openPrintDialog(`${doc.name} itinerary`, finish)
    })
    return () => {
      dead = true
    }
  }, [stage, doc, finish])
  useEffect(() => () => disposeRef.current(), [])

  const tokens = paperTokens(ACCENT_FILL[doc.accent])
  const received = Object.keys(stills).length

  return (
    <>
      {createPortal(
        <div ref={rootRef} {...sx("trips", "trips-print-root", p.root)} style={tokens} aria-hidden="true" inert>
          <style>{printCss(doc.name)}</style>
          <Cover doc={doc} still={stills[TRIP_STILL]} />
          {doc.days.map((day, i) => (
            <DayPage
              key={day.id}
              day={day}
              // A run of empty days rides on one page with the day after it,
              // so no day is left alone on a sheet.
              startsPage={i === 0 || !doc.days[i - 1]!.plan.empty}
              still={day.stillKey ? stills[day.stillKey] : undefined}
              seed={`${doc.name}:${day.id}`}
            />
          ))}
          {doc.bookings.length > 0 && <Bookings bookings={doc.bookings} />}
        </div>,
        document.body,
      )}
      {stage !== "printed" &&
        createPortal(
          <div className="trips trips-portal">
            <div {...sx(p.status)} role="status">
              <Printer size={16} strokeWidth={1.75} aria-hidden />
              <span>Preparing the printout</span>
              {stage === "maps" && (
                <span {...sx(p.statusCount)} aria-hidden>
                  {`Maps ${received} of ${doc.stills.length}`}
                </span>
              )}
              <button type="button" {...sx(p.statusBtn)} onClick={finish}>
                Cancel
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

// ── Pages ────────────────────────────────────────────────────────────────

/** A real map still, or the chart of the same points, or nothing to draw. */
function MapPicture({ still, points, seed }: { still?: string; points: readonly LngLat[]; seed: string }) {
  if (still) return <img src={still} alt="" {...sx(p.still)} />
  if (points.length === 0) return null
  return <TripCover seed={seed} points={points} />
}

function Cover({ doc, still }: { doc: PrintDocument; still?: string }) {
  const hasMap = Boolean(still) || doc.points.length > 0
  return (
    <section {...sx(p.cover)}>
      <p {...sx(a.eyebrow)}>Itinerary</p>
      <h1 {...sx(a.display, p.coverTitle)}>{doc.name}</h1>
      <p {...sx(p.coverDates)}>{doc.dates}</p>
      {doc.destinations && <p {...sx(p.coverPlaces)}>{doc.destinations}</p>}
      {doc.description && <p {...sx(p.coverDescription)}>{doc.description}</p>}
      {hasMap && (
        <div {...sx(p.coverMap)}>
          <MapPicture still={still} points={doc.points} seed={doc.name} />
        </div>
      )}
      <div {...sx(p.coverFoot)}>
        <span>{doc.summary}</span>
        <span>{doc.printed}</span>
      </div>
    </section>
  )
}

function DayNotes({ day }: { day: PrintDay }) {
  return (
    <>
      {day.notes && <p {...sx(p.dayNotes)}>{day.notes}</p>}
      {day.callouts.length > 0 && (
        <ul {...sx(p.callouts)}>
          {day.callouts.map((callout, i) => (
            <li key={i} {...sx(p.callout)}>
              {callout}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function DayPage({ day, startsPage, still, seed }: { day: PrintDay; startsPage: boolean; still?: string; seed: string }) {
  const { plan } = day
  const place = startsPage ? p.newPage : p.joined
  // A day with nothing in it does not earn a sheet of paper: it is one line.
  if (plan.empty) {
    return (
      <section {...sx(p.dayEmpty, place)}>
        <div {...sx(p.dayLine)}>
          <p {...sx(a.eyebrow)}>{day.eyebrow}</p>
          <p {...sx(p.empty)}>{[day.weather, "Nothing planned yet"].filter(Boolean).join(" · ")}</p>
        </div>
        {day.title && <h2 {...sx(a.display, p.dayTitleSmall)}>{day.title}</h2>}
        <DayNotes day={day} />
      </section>
    )
  }
  return (
    <section {...sx(p.day, place)}>
      <p {...sx(a.eyebrow)}>{day.eyebrow}</p>
      <h2 {...sx(a.display, p.dayHeading)}>{day.title ?? day.date}</h2>
      <p {...sx(p.dayMeta)}>{[day.weather, day.summary].filter(Boolean).join(" · ")}</p>
      <DayNotes day={day} />
      {plan.route.length > 0 && (
        <div {...sx(p.dayMap)}>
          <MapPicture still={still} points={plan.route} seed={seed} />
        </div>
      )}
      <ol {...sx(p.list)}>
        {plan.rows.map((row) =>
          row.k === "section" ? (
            <li key={row.id} {...sx(p.section)}>
              <span {...sx(a.eyebrow, a.ink)}>{row.title}</span>
              {row.time && <span {...sx(a.eyebrow)}>{formatClock(row.time)}</span>}
            </li>
          ) : (
            <StopRow key={row.item.id} item={row.item} pin={row.pin} leg={row.leg} />
          ),
        )}
      </ol>
      {plan.parked.length > 0 && (
        <>
          <p {...sx(a.eyebrow, a.ink, p.section)}>{TO_SCHEDULE}</p>
          <ul {...sx(p.list, p.listParked)}>
            {plan.parked.map((item) => (
              <StopRow key={item.id} item={item} pin={null} leg={null} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function StopRow({ item, pin, leg }: { item: ItineraryItem; pin: number | null; leg: string | null }) {
  const facts = stopFacts(item)
  const note = item.kind === "note"
  const details = [facts.place, facts.category, facts.status].filter(Boolean).join(" · ")
  return (
    <li {...sx(p.stop)}>
      <span {...sx(p.time)}>
        {item.time ? (
          <>
            <span>{formatClock(item.time)}</span>
            {item.endTime && <span {...sx(p.timeEnd)}>{formatClock(item.endTime)}</span>}
          </>
        ) : null}
      </span>
      <span {...sx(p.marker)}>
        {pin !== null ? <span {...sx(p.pin)}>{pin}</span> : note ? <span {...sx(p.dash)}>–</span> : <span {...sx(p.ring)} />}
      </span>
      <div {...sx(p.body)}>
        <p {...sx(p.title, note && p.noteTitle)}>{facts.title}</p>
        {(details || facts.confirmation) && (
          <p {...sx(p.facts)}>
            {details}
            {facts.confirmation && (
              <>
                {details ? " · " : ""}
                Conf <span {...sx(p.conf)}>{facts.confirmation}</span>
              </>
            )}
          </p>
        )}
        {facts.address && <p {...sx(p.address)}>{facts.address}</p>}
        {facts.notes && <p {...sx(p.notes)}>{facts.notes}</p>}
        {leg && <p {...sx(p.leg)}>{`→ ${leg}`}</p>}
      </div>
    </li>
  )
}

function Bookings({ bookings }: { bookings: readonly PrintBooking[] }) {
  return (
    <section {...sx(p.bookings)}>
      <p {...sx(a.eyebrow)}>Appendix</p>
      <h2 {...sx(a.display, p.bookingsHeading)}>Bookings</h2>
      <ul {...sx(p.list)}>
        {bookings.map((booking) => (
          <li key={booking.id} {...sx(p.booking)}>
            <span {...sx(p.bookingWhen)}>
              <span>{`Day ${booking.dayNumber}`}</span>
              <span>{booking.date}</span>
              {booking.time && <span>{formatClock(booking.time)}</span>}
            </span>
            <div {...sx(p.body)}>
              <p {...sx(p.title)}>{booking.title}</p>
              {booking.kind && <p {...sx(p.facts)}>{booking.kind}</p>}
              {booking.address && <p {...sx(p.address)}>{booking.address}</p>}
              {booking.contact && <p {...sx(p.address)}>{booking.contact}</p>}
            </div>
            <span {...sx(p.bookingConf)}>{booking.confirmation ?? ""}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
