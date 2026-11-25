import { useEffect, useId, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ChevronDown, MapPin, Sparkles } from "lucide-react"
import { sx } from "@/styles/merge"
import { layout } from "@/styles/common.stylex"
import type { GetToken } from "../../../effect/http"
import { a } from "../atlas.stylex"
import { formatTripDate, plural } from "../meta"
import type { Trip } from "../types"
import { ar } from "./areas.stylex"
import { areaDays, areaFingerprint, areaMeta, hasAreaStops, type AreaDay } from "./areaStops"
import { cachedNeighborhoods, loadNeighborhoods, NeighborhoodsError } from "./areasApi"
import type { Neighborhood } from "./contract"

// The overview's Neighborhoods tab: the parts of town the trip's stops fall
// in, grouped by the server's model on first open and kept there. Each area
// has a photo when Google surely has one of it, what it is like, the days
// that go there, and its stops by day. "Show on map" draws one area at a time.

export interface AreasPanelProps {
  trip: Trip
  /** `/trips/<slug or id>`: each stop links to its day. */
  basePath: string
  getToken: GetToken
  /** The area drawn on the map, if any. */
  shownId: string | null
  onShow: (area: Neighborhood | null) => void
}

/** How the last request for these stops ended. */
type Settled = { key: string; failure: { message: string; retry: boolean } | null }

export function AreasPanel({ trip, basePath, getToken, shownId, onShow }: AreasPanelProps) {
  const located = hasAreaStops(trip)
  const fingerprint = useMemo(() => areaFingerprint(trip), [trip])
  const [attempt, setAttempt] = useState(0)
  const requestKey = `${trip.id}|${fingerprint}|${attempt}`
  const [settled, setSettled] = useState<Settled | null>(() => (cachedNeighborhoods(trip.id, fingerprint) ? { key: requestKey, failure: null } : null))
  // The last areas that loaded: a trip edited elsewhere keeps them on screen until the new ones come.
  const [areas, setAreas] = useState<Neighborhood[] | null>(() => cachedNeighborhoods(trip.id, fingerprint) ?? null)

  useEffect(() => {
    if (!located) return
    const controller = new AbortController()
    loadNeighborhoods(getToken, trip.id, fingerprint, controller.signal).then(
      (next) => {
        if (controller.signal.aborted) return
        setAreas(next)
        setSettled({ key: requestKey, failure: null })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        const failure = error instanceof NeighborhoodsError ? error : new NeighborhoodsError({ message: "Couldn’t group your stops into neighborhoods just now.", retry: true })
        setSettled({ key: requestKey, failure: { message: failure.message, retry: failure.retry } })
      },
    )
    return () => controller.abort()
  }, [located, trip.id, fingerprint, getToken, requestKey])

  const load = settled?.key !== requestKey ? { k: "loading" as const } : settled.failure ? { k: "failed" as const, ...settled.failure } : { k: "ready" as const }
  // An area regrouped away is no longer drawn.
  useEffect(() => {
    if (shownId && areas && !areas.some((area) => area.id === shownId)) onShow(null)
  }, [areas, shownId, onShow])

  if (!located) {
    return (
      <div {...sx(ar.message)}>
        <p {...sx(a.body)}>Neighborhoods group your stops by the part of town they’re in. Add places to your days and they’ll show up here.</p>
      </div>
    )
  }

  const cities = new Set(areas?.map((area) => area.city.toLowerCase()))
  const status =
    load.k === "loading"
      ? areas
        ? "Updating your neighborhoods…"
        : "Grouping your stops into neighborhoods. The first time takes about half a minute."
      : load.k === "failed"
        ? load.message
        : areas && areas.length > 0
          ? plural(areas.length, "neighborhood")
          : ""

  return (
    <section {...sx(ar.root)} aria-label="Neighborhoods" aria-busy={load.k === "loading"}>
      <p role="status" {...sx(layout.srOnly)}>
        {status}
      </p>
      {load.k === "failed" && (
        <div {...sx(ar.message)}>
          <p {...sx(a.body)} aria-hidden>
            {load.message}
          </p>
          {load.retry && (
            <button type="button" {...sx(a.btn, a.btnSecondary, a.btnSm)} onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          )}
        </div>
      )}
      {!areas && load.k === "loading" && (
        <>
          <p {...sx(a.small)} aria-hidden>
            {status}
          </p>
          <Ghosts />
        </>
      )}
      {areas && areas.length === 0 && load.k === "ready" && (
        <p {...sx(a.body)}>Your stops are too spread out to group into neighborhoods. As you add places close together, they’ll be grouped here.</p>
      )}
      {areas && areas.length > 0 && (
        <>
          <div {...sx(ar.head)}>
            <p {...sx(a.eyebrow)} aria-hidden>
              {load.k === "loading" ? "Updating…" : plural(areas.length, "neighborhood")}
            </p>
            <p {...sx(ar.aiNote)}>
              <Sparkles size={13} strokeWidth={1.75} aria-hidden />
              Grouped by AI
            </p>
          </div>
          <ol {...sx(ar.list)}>
            {areas.map((area) => (
              <AreaCard
                key={area.id}
                area={area}
                days={areaDays(trip, area.stopIds)}
                withCity={cities.size > 1}
                basePath={basePath}
                shown={area.id === shownId}
                onShow={onShow}
              />
            ))}
          </ol>
        </>
      )}
    </section>
  )
}

function AreaCard({
  area,
  days,
  withCity,
  basePath,
  shown,
  onShow,
}: {
  area: Neighborhood
  days: AreaDay[]
  withCity: boolean
  basePath: string
  shown: boolean
  onShow: (area: Neighborhood | null) => void
}) {
  const [open, setOpen] = useState(false)
  const headingId = useId()
  const stopsId = useId()
  // Every stop it had may have left the trip since it was grouped.
  if (days.length === 0) return null
  return (
    <li>
      <article {...sx(ar.card, shown && ar.cardShown)} aria-labelledby={headingId}>
        <AreaPhoto area={area} />
        <div {...sx(ar.body)}>
          <div {...sx(ar.title)}>
            <h3 id={headingId} {...sx(a.display, ar.name, a.wrap)}>
              {area.name}
            </h3>
            {area.localName && <span {...sx(ar.localName)}>{area.localName}</span>}
          </div>
          <p {...sx(a.mono, ar.meta)}>{[withCity ? area.city : null, areaMeta(days)].filter(Boolean).join(" · ")}</p>
          {area.summary && <p {...sx(a.body, a.wrap)}>{area.summary}</p>}
          <div {...sx(ar.actions)}>
            <button type="button" aria-pressed={shown} {...sx(a.btn, a.btnSecondary, a.btnSm, shown && ar.toggleOn)} onClick={() => onShow(shown ? null : area)}>
              <MapPin size={15} strokeWidth={1.75} fill={shown ? "currentColor" : "none"} fillOpacity={0.2} aria-hidden />
              Show on map
            </button>
            <button type="button" aria-expanded={open} aria-controls={stopsId} {...sx(a.btn, a.btnGhost, a.btnSm)} onClick={() => setOpen(!open)}>
              Stops by day
              <ChevronDown size={15} strokeWidth={1.75} aria-hidden {...sx(ar.chevron, open && ar.chevronOpen)} />
            </button>
          </div>
          <div id={stopsId} hidden={!open} {...sx(ar.days)}>
            {open &&
              days.map(({ day, dayNumber, stops }) => (
                <div key={day.id}>
                  <p {...sx(a.eyebrow)}>{[`Day ${dayNumber}`, day.date ? formatTripDate(day.date).replace(",", "") : null].filter(Boolean).join(" · ")}</p>
                  <ul {...sx(ar.stops)}>
                    {stops.map((stop) => (
                      <li key={stop.id}>
                        <Link to={`${basePath}/day/${day.id}#stop-${encodeURIComponent(stop.id)}`} {...sx(ar.stop)}>
                          <span {...sx(ar.stopMark)} aria-hidden />
                          <span {...sx(a.truncate)}>{stop.title || stop.location.name}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </div>
      </article>
    </li>
  )
}

/** The area's first photo that loads, with its author; nothing when there is none. */
function AreaPhoto({ area }: { area: Neighborhood }) {
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set())
  const photo = area.photos.find((p) => !broken.has(p.url))
  if (!photo?.author) return null
  return (
    <figure {...sx(ar.figure)}>
      <img
        src={photo.url}
        alt={`${area.name}, ${area.city}`}
        width={photo.width}
        height={photo.height}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setBroken((last) => new Set(last).add(photo.url))}
        {...sx(ar.photo)}
      />
      <figcaption {...sx(ar.credit)}>
        Photo:{" "}
        {photo.author.uri ? (
          <a href={photo.author.uri} target="_blank" rel="noopener noreferrer" {...sx(ar.creditLink)}>
            {photo.author.name}
          </a>
        ) : (
          photo.author.name
        )}
      </figcaption>
    </figure>
  )
}

function Ghosts() {
  return (
    <ol {...sx(ar.list)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <li key={i} {...sx(ar.card)}>
          <span {...sx(a.skeleton, ar.ghostPhoto)} />
          <span {...sx(ar.ghost)}>
            <span {...sx(a.skeleton, ar.ghostLine)} style={{ width: "45%", height: "1.375rem" }} />
            <span {...sx(a.skeleton, ar.ghostLine)} style={{ width: "30%" }} />
            <span {...sx(a.skeleton, ar.ghostLine)} style={{ width: "92%" }} />
            <span {...sx(a.skeleton, ar.ghostLine)} style={{ width: "70%" }} />
          </span>
        </li>
      ))}
    </ol>
  )
}
