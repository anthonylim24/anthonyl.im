import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Printer, Share2 } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { formatMoney } from "../budget/budget"
import { useRates } from "../budget/useRates"
import { Modal } from "../components/kit"
import { TripCover } from "../components/TripCover"
import { canRenderMap, useIsDark } from "../map/AtlasMap"
import type { LngLat } from "../map/geo"
import { ACCENT_FILL, formatRange, formatTripDate, resolveAccent } from "../meta"
import type { Trip } from "../types"
import { recapLine, tripRecap, type Recap } from "./recapModel"
import { r } from "./recap.stylex"
import { recapCardLines, shareRecapCard, type ShareOutcome } from "./shareCard"

// The trip, looked back on: where it went (a map still, or the chart of the
// same places), its figures, the places loved, the journal, what was spent.
// Share it as a picture, or print it. A sheet over the workspace (kit
// `Modal`), so everything in it runs only while it is open; the map engine
// is fetched only when WebGL can draw it.

export interface TripRecapProps {
  trip: Trip
  open: boolean
  onClose: () => void
  /** Pins the moment the recap is taken at (tests). Otherwise, when it opens. */
  now?: Date
}

export function TripRecap({ trip, open, onClose, now }: TripRecapProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={trip.name.trim() || "Untitled trip"}
      description={`Recap · ${formatRange(trip.startDate, trip.endDate)}`}
      accent={resolveAccent(trip.appearance?.accent)}
      wide
    >
      <RecapSheet trip={trip} now={now} />
    </Modal>
  )
}

const SAID: Record<ShareOutcome, string> = {
  shared: "Shared.",
  saved: "Saved the picture to your downloads.",
  cancelled: "",
  failed: "Couldn’t make the picture. Try again.",
}

function RecapSheet({ trip, now }: { trip: Trip; now?: Date }) {
  const { rates } = useRates(trip)
  const [at] = useState(() => now?.getTime() ?? Date.now())
  const recap = useMemo(() => tripRecap(trip, rates, at), [trip, rates, at])
  const dark = useIsDark()
  const still = useMapStill(recap.points, trip.center, recap.accent, dark)
  const [sharing, setSharing] = useState(false)
  const [status, setStatus] = useState("")
  const printing = usePrintTitle(`${recap.name} recap`)

  const share = async () => {
    setSharing(true)
    setStatus("")
    const outcome = await shareRecapCard(recap)
    setSharing(false)
    setStatus(SAID[outcome])
  }

  const actions = (
    <div {...sx(r.actions)}>
      <button type="button" disabled={sharing} {...sx(a.btn, a.btnPrimary)} onClick={() => void share()}>
        <Share2 size={16} strokeWidth={1.75} aria-hidden />
        {sharing ? "Making the picture…" : "Share as a picture"}
      </button>
      <button type="button" {...sx(a.btn, a.btnSecondary)} onClick={printing}>
        <Printer size={16} strokeWidth={1.75} aria-hidden />
        Print
      </button>
      <p {...sx(a.small, r.status)} role="status">
        {status}
      </p>
    </div>
  )

  return (
    <div {...sx(r.sheet)}>
      <RecapBody recap={recap} still={still} actions={actions} />
      {createPortal(
        <div {...sx("trips", "trips-recap-print-root", r.print)} style={paperTokens(ACCENT_FILL[recap.accent])} aria-hidden="true" inert>
          <style>{PRINT_CSS}</style>
          <header {...sx(r.printHead)}>
            <p {...sx(a.eyebrow)}>Trip recap</p>
            <h1 {...sx(a.display, a.wrapName, r.printTitle)}>{recap.name}</h1>
            <p {...sx(r.printDates)}>{recap.dates}</p>
          </header>
          {/* A dark-theme still would print as a black slab: the chart instead. */}
          <RecapBody recap={recap} still={dark ? undefined : still} />
        </div>,
        document.body,
      )}
    </div>
  )
}

function RecapBody({ recap, still, actions }: { recap: Recap; still?: string; actions?: ReactNode }) {
  const lovedId = useId()
  const journalId = useId()
  const spentId = useId()
  const { figures } = recapCardLines(recap)
  const { spend } = recap
  const nothing = recap.places === 0 && recap.loved.length === 0 && recap.journal.length === 0 && !spend

  return (
    <>
      {(still || recap.points.length > 0) && (
        <div {...sx(r.map)}>
          <TripCover seed={recap.name} points={recap.points} still={still} />
        </div>
      )}

      <p {...sx(a.srOnly)}>{recapLine(recap)}</p>
      <dl {...sx(r.figures)} style={{ "--recap-figures": figures.length } as CSSProperties} aria-hidden="true">
        {figures.map((figure, i) => (
          <div key={figure.label} {...sx(r.figure, i === 0 && r.figureFirst, i === 2 && r.figureRowStart)}>
            <dt {...sx(a.eyebrow, r.figureLabel)}>{figure.label}</dt>
            <dd {...sx(a.display, r.figureValue)}>{figure.value}</dd>
          </div>
        ))}
      </dl>
      {recap.cities.length > 0 && <p {...sx(r.cities, a.wrap)}>{recap.cities.join(" · ")}</p>}
      {nothing && (
        <p {...sx(a.body, r.empty)}>
          Nothing to look back on yet. A place counts once its day is over, or when it is marked done.
        </p>
      )}

      {actions}

      {recap.loved.length > 0 && (
        <section aria-labelledby={lovedId} {...sx(r.section)}>
          <h3 id={lovedId} {...sx(a.display, r.sectionTitle)}>
            Loved
          </h3>
          <ul {...sx(r.list)}>
            {recap.loved.map((stop) => (
              <li key={`${stop.dayId}:${stop.itemId}`} {...sx(r.loved)}>
                <span {...sx(a.eyebrow)}>{[`Day ${stop.dayNumber}`, stop.city].filter(Boolean).join(" · ")}</span>
                <span {...sx(a.display, a.wrapName, r.lovedName)}>{stop.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recap.journal.length > 0 && (
        <section aria-labelledby={journalId} {...sx(r.section)}>
          <h3 id={journalId} {...sx(a.display, r.sectionTitle)}>
            From the journal
          </h3>
          <ul {...sx(r.list)}>
            {recap.journal.map((entry) => (
              <li key={entry.dayId}>
                <figure {...sx(r.excerpt)}>
                  <figcaption {...sx(a.eyebrow)}>
                    Day {entry.dayNumber} · {formatTripDate(entry.date, "UTC")}
                  </figcaption>
                  <blockquote {...sx(r.excerptText, a.wrap)}>{entry.text}</blockquote>
                </figure>
              </li>
            ))}
          </ul>
        </section>
      )}

      {spend && (
        <section aria-labelledby={spentId} {...sx(r.section)}>
          <h3 id={spentId} {...sx(a.display, r.sectionTitle)}>
            Spent
          </h3>
          <p {...sx(a.display, r.total)}>{formatMoney(spend.total, spend.currency)}</p>
          <ul {...sx(r.list)}>
            {spend.categories.map((row) => (
              <li key={row.category} {...sx(r.spendRow)}>
                <span {...sx(r.spendLine)}>
                  <span>{row.label}</span>
                  <span {...sx(a.mono)}>{formatMoney(row.amount, spend.currency)}</span>
                </span>
                <span {...sx(r.track)} aria-hidden="true">
                  <span {...sx(r.bar)} style={{ width: `${Math.max(1, Math.round(row.share * 100))}%` }} />
                </span>
              </li>
            ))}
          </ul>
          {spend.unconverted.length > 0 && (
            <p {...sx(a.small)}>Not counted: amounts in {spend.unconverted.join(", ")}, with no rate to convert them.</p>
          )}
        </section>
      )}
    </>
  )
}

/**
 * A map picture of the visited places, in the trip's accent, once the map
 * engine has drawn one off screen. Undefined until then, and for good where
 * WebGL can't draw (the chart stands in).
 */
function useMapStill(points: readonly LngLat[], center: LngLat | undefined, accent: Recap["accent"], dark: boolean): string | undefined {
  const [still, setStill] = useState<{ key: string; url: string } | null>(null)
  const where = (p: LngLat) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`
  const key = `${dark ? "d" : "l"}:${accent}:${center ? where(center) : ""}:${points.map(where).join(";")}`
  useEffect(() => {
    if ((points.length === 0 && !center) || !canRenderMap()) return
    let dead = false
    let cancel = () => {}
    import("../map/engine").then(
      ({ renderStills }) => {
        if (dead) return
        cancel = renderStills([{ key, points, center, color: ACCENT_FILL[accent] }], dark, (done, url) => {
          if (!dead) setStill({ key: done, url })
        })
      },
      // No map chunk: the chart stays.
      () => undefined,
    )
    return () => {
      dead = true
      cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` names the points, centre, accent and theme; a new array of the same places must not redraw
  }, [key])
  return still?.key === key ? still.url : undefined
}

/**
 * Print the recap: "Save as PDF" names the file after the document title,
 * so the title is the recap's while the dialog is up, and back after.
 */
function usePrintTitle(title: string): () => void {
  const restore = useRef<(() => void) | null>(null)
  useEffect(() => () => restore.current?.(), [])
  return () => {
    restore.current?.()
    const before = document.title
    const back = () => {
      window.removeEventListener("afterprint", back)
      if (document.title === title) document.title = before
      restore.current = null
    }
    restore.current = back
    document.title = title
    window.addEventListener("afterprint", back)
    window.print()
  }
}

/** Light atlas inks on white, pinned inline so they beat the dark theme on paper. */
function paperTokens(fill: string): CSSProperties {
  return {
    "--trips-canvas": "#ffffff",
    "--trips-surface": "#ffffff",
    "--trips-raised": "#ffffff",
    "--trips-sunken": "#f4f3ef",
    "--trips-ink": "#14171a",
    "--trips-ink-secondary": "#4d5259",
    "--trips-ink-tertiary": "#696e75",
    "--trips-ink-faint": "#9a9ea4",
    "--trips-line": "rgb(20 23 26 / 0.18)",
    "--trips-line-strong": "rgb(20 23 26 / 0.3)",
    "--ta": fill,
    "--ta-fill": fill,
  } as CSSProperties
}

/**
 * While the recap is open: on screen its paper copy is hidden; in print
 * only it shows. The dialog's scroll lock pins `body` (overflow hidden,
 * position relative, !important on `body[data-scroll-locked]`), which would
 * cut a recap longer than a page to its first sheet; the resets below
 * outrank it.
 */
const PRINT_CSS = `
@media screen { .trips-recap-print-root { display: none !important; } }
@media print {
  @page { margin: 16mm 16mm 18mm; }
  html, html body, html body[data-scroll-locked] {
    background: #ffffff !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
    position: static !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  html body > :not(.trips-recap-print-root) { display: none !important; }
  html body > .trips-recap-print-root { display: flex !important; flex-direction: column; gap: 14pt; }
  .trips-recap-print-root section, .trips-recap-print-root figure { break-inside: avoid; }
}
.trips-recap-print-root { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
`
