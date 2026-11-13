import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowRight, Copy, MoreHorizontal, Plus, RotateCcw, Search, Share2, Sparkles, Trash2, Users } from "lucide-react"
import { sx } from "@/styles/merge"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { useTabTitle } from "@/hooks/useTabTitle"
import { useAuthReady, useGetToken, useViewer } from "@/lib/safeAuth"
import { deleteTrip, duplicateTrip, getTrip, listTrips } from "./tripsApi"
import { dayCount, formatRange, plural, resolveAccent, tripTiming, visibleTags, type TripPhase } from "./meta"
import { AtlasMap } from "./map/AtlasMap"
import { formatCoord, type AtlasPin, type LngLat } from "./map/geo"
import { Menu, Modal, Spinner, type MenuItem } from "./components/kit"
import { ShareDialog } from "./components/ShareDialog"
import { TripCover } from "./components/TripCover"
import type { TripSummary } from "./types"
import { a } from "./atlas.stylex"
import { idx as s } from "./index.stylex"

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; trips: TripSummary[] }

const BUCKETS: Array<{ phase: TripPhase; label: string }> = [
  { phase: "now", label: "Happening now" },
  { phase: "upcoming", label: "Upcoming" },
  { phase: "past", label: "Past" },
]

const REST_CENTER: LngLat = { lat: 22, lng: 12 }

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable || Boolean(target.closest('[role="dialog"]'))
}

export function tripHref(trip: Pick<TripSummary, "id" | "slug">): string {
  return `/trips/${trip.slug ?? trip.id}`
}

export function TripsIndex() {
  useTabTitle("Trips")
  const navigate = useNavigate()
  const getToken = useGetToken()
  const readToken = useLatestCallback(getToken)
  const authReady = useAuthReady()
  const viewer = useViewer()
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [reloadKey, setReloadKey] = useState(0)
  const [, startTransition] = useTransition()
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const [hot, setHot] = useState<string | null>(null)
  const [shareId, setShareId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<TripSummary | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!authReady) return
    let cancelled = false
    listTrips(readToken).then(
      (trips) => !cancelled && startTransition(() => setState({ status: "success", trips })),
      (err: unknown) => !cancelled && setState({ status: "error", message: err instanceof Error ? err.message : String(err) }),
    )
    return () => {
      cancelled = true
    }
  }, [authReady, reloadKey, readToken])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
      if (event.key === "/") {
        event.preventDefault()
        searchRef.current?.focus()
      } else if (event.key === "n") {
        event.preventDefault()
        navigate("/trips/new")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [navigate])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  const trips = state.status === "success" ? state.trips : null
  const timed = useMemo(() => (trips ?? []).map((trip) => ({ trip, timing: tripTiming(trip) })), [trips])

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    if (!q) return timed
    return timed.filter(({ trip }) =>
      [trip.name, ...trip.destinations, ...trip.tags].some((text) => text.toLowerCase().includes(q)),
    )
  }, [timed, deferredQuery])

  const pins = useMemo<AtlasPin[]>(
    () =>
      filtered.flatMap(({ trip }) =>
        trip.center
          ? [{ id: trip.id, lat: trip.center.lat, lng: trip.center.lng, title: trip.name, variant: "trip" as const, accent: resolveAccent(trip.accent) }]
          : [],
      ),
    [filtered],
  )

  const nextUp = useMemo(() => {
    const live = timed.find((t) => t.timing.phase === "now")
    if (live) return live
    return timed.filter((t) => t.timing.phase === "upcoming").sort((x, y) => x.timing.daysAway - y.timing.daysAway)[0]
  }, [timed])

  const hotTrip = hot ? timed.find((t) => t.trip.id === hot)?.trip : undefined
  const framePoints = hotTrip?.center ? [hotTrip.center] : pins
  const upcomingCount = timed.filter((t) => t.timing.phase !== "past").length

  const remove = async (trip: TripSummary) => {
    setBusy(trip.id)
    setActionError(null)
    try {
      await deleteTrip(readToken, trip.id)
      setConfirm(null)
      setToast(`Deleted “${trip.name}”.`)
      setState((current) =>
        current.status === "success" ? { status: "success", trips: current.trips.filter((t) => t.id !== trip.id) } : current,
      )
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const duplicate = async (trip: TripSummary) => {
    setBusy(trip.id)
    try {
      const { trip: full } = await getTrip(readToken, trip.id)
      const copy = await duplicateTrip(readToken, full)
      navigate(tripHref(copy))
    } catch (err) {
      setToast(`Couldn’t duplicate that trip. (${err instanceof Error ? err.message : String(err)})`)
    } finally {
      setBusy(null)
    }
  }

  const menuFor = (trip: TripSummary): MenuItem[] => [
    { label: "Share…", icon: <Share2 size={16} strokeWidth={1.75} aria-hidden />, onSelect: () => setShareId(trip.id) },
    { label: "Duplicate", icon: <Copy size={16} strokeWidth={1.75} aria-hidden />, onSelect: () => void duplicate(trip) },
    ...(trip.access === "owner" && !trip.sharedWithAllUsers
      ? [
          {
            label: "Delete trip…",
            icon: <Trash2 size={16} strokeWidth={1.75} aria-hidden />,
            danger: true,
            separated: true,
            onSelect: () => {
              setActionError(null)
              setConfirm(trip)
            },
          },
        ]
      : []),
  ]

  return (
    <div {...sx(s.page)}>
      <section {...sx(s.hero)} aria-labelledby="trips-hero-title">
        <div {...sx(s.heroCopy)}>
          <p {...sx(a.eyebrow)}>
            {trips
              ? trips.length === 0
                ? "Atlas · Nothing pinned yet"
                : `Atlas · ${plural(trips.length, "trip")}${upcomingCount > 0 ? ` · ${upcomingCount} ahead` : ""}`
              : "Atlas"}
          </p>
          <h1 id="trips-hero-title" {...sx(a.display, s.heroTitle)}>
            Where to <span {...sx(a.italic)}>next?</span>
          </h1>
          <p {...sx(s.heroLede)}>
            Plan each day on a live 3D map, let AI draft the first pass, and share the whole thing with whoever’s coming.
          </p>
          <div {...sx(s.heroActions)}>
            <Link to="/trips/new" {...sx(a.btn, a.btnPrimary)}>
              <Plus size={18} strokeWidth={2} aria-hidden />
              Plan a trip
            </Link>
            <Link to="/trips/new?ai=1" {...sx(a.btn, a.btnSecondary)}>
              <Sparkles size={16} strokeWidth={1.75} aria-hidden />
              Draft one with AI
            </Link>
          </div>
          {nextUp && (
            <Link to={tripHref(nextUp.trip)} {...sx(s.nextUp)} data-trip-accent={resolveAccent(nextUp.trip.accent)}>
              <span {...sx(s.liveDot)} aria-hidden />
              <span {...sx(a.truncate)}>
                {nextUp.timing.phase === "now" ? "Now" : "Next"}: {nextUp.trip.name}
              </span>
              <span {...sx(a.mono, a.muted, a.noShrink)}>{nextUp.timing.label}</span>
              <ArrowRight size={16} strokeWidth={1.75} aria-hidden {...sx(a.noShrink)} />
            </Link>
          )}
        </div>
        <div {...sx(s.globe)}>
          <AtlasMap
            ambient
            pins={pins}
            framePoints={framePoints}
            frameKey={`${hot ?? "all"}:${pins.map((p) => p.id).join(",")}`}
            restCenter={REST_CENTER}
            hotId={hot}
            onSelect={(id) => {
              const trip = trips?.find((t) => t.id === id)
              if (trip) navigate(tripHref(trip))
            }}
            onHover={setHot}
            label={
              pins.length > 0
                ? `Globe with ${plural(pins.length, "trip")} pinned. Each pin opens its trip.`
                : "Globe. Trips appear here as pins once they have a destination."
            }
          />
          <p {...sx(a.eyebrow, s.globeCaption)} aria-hidden>
            {hotTrip?.center ? `${hotTrip.name} · ${formatCoord(hotTrip.center)}` : "Drag to turn the globe"}
          </p>
        </div>
      </section>

      {state.status === "loading" && (
        <div role="status" aria-label="Loading trips">
          <div {...sx(s.listHead)}>
            <h2 {...sx(a.display, s.listTitle)}>Your trips</h2>
          </div>
          <div {...sx(s.bucket, s.grid)}>
            {[0, 1, 2].map((i) => (
              <div key={i} {...sx(a.skeleton, s.skeletonCard)} />
            ))}
          </div>
        </div>
      )}

      {state.status === "error" && (
        <div {...sx(s.empty)} role="alert">
          <h2 {...sx(a.display, s.emptyTitle)}>Couldn’t load your trips</h2>
          <p {...sx(a.body)}>Check your connection and try again. ({state.message})</p>
          <button type="button" {...sx(a.btn, a.btnSecondary)} onClick={() => setReloadKey((k) => k + 1)}>
            <RotateCcw size={16} strokeWidth={1.75} aria-hidden />
            Try again
          </button>
        </div>
      )}

      {trips && trips.length === 0 && (
        <div {...sx(s.empty)}>
          <h2 {...sx(a.display, s.emptyTitle)}>
            A blank <span {...sx(a.italic)}>map.</span>
          </h2>
          <p {...sx(a.body)}>Name a place and some dates. You can fill in the days yourself or have AI sketch them.</p>
          <Link to="/trips/new" {...sx(a.btn, a.btnPrimary)}>
            <Plus size={18} strokeWidth={2} aria-hidden />
            Plan your first trip
          </Link>
        </div>
      )}

      {trips && trips.length > 0 && (
        <section aria-labelledby="trips-list-title">
          <div {...sx(s.listHead)}>
            <h2 id="trips-list-title" {...sx(a.display, s.listTitle)}>
              Your trips
            </h2>
            <label {...sx(s.search)}>
              <Search size={16} strokeWidth={1.75} aria-hidden {...sx(a.noShrink)} />
              <span {...sx(a.srOnly)}>Search trips</span>
              <input
                ref={searchRef}
                type="search"
                value={query}
                placeholder="Search by name, place or tag"
                {...sx(a.fieldBare)}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setQuery("")
                    event.currentTarget.blur()
                  }
                }}
              />
              <kbd {...sx(s.kbd)}>/</kbd>
            </label>
          </div>

          {filtered.length === 0 && (
            <div {...sx(s.empty)} role="status">
              <p {...sx(a.body, a.ink)}>No trips match “{deferredQuery.trim()}”.</p>
              <button type="button" {...sx(a.btn, a.btnSecondary, a.btnSm)} onClick={() => setQuery("")}>
                Clear search
              </button>
            </div>
          )}

          {BUCKETS.map(({ phase, label }) => {
            const rows = filtered
              .filter((t) => t.timing.phase === phase)
              .sort((x, y) => (phase === "past" ? y.trip.startDate.localeCompare(x.trip.startDate) : x.trip.startDate.localeCompare(y.trip.startDate)))
            if (rows.length === 0) return null
            return (
              <div key={phase} {...sx(s.bucket)}>
                <div {...sx(s.bucketHead)}>
                  <h3 {...sx(a.eyebrow)}>
                    {label} · {rows.length}
                  </h3>
                  <span {...sx(s.bucketRule)} aria-hidden />
                </div>
                <ul {...sx(s.grid)}>
                  {rows.map(({ trip, timing }, index) => {
                    const tags = visibleTags(trip.tags)
                    const points = (trip.points ?? []).map(([lng, lat]) => ({ lat, lng }))
                    const shared = trip.sharedWithAllUsers || trip.collaborators.length > 0
                    return (
                      <li key={trip.id}>
                        <article
                          {...sx(s.card)}
                          style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
                          data-trip-accent={resolveAccent(trip.accent)}
                          onMouseEnter={() => setHot(trip.id)}
                          onMouseLeave={() => setHot((current) => (current === trip.id ? null : current))}
                        >
                          <Link
                            to={tripHref(trip)}
                            {...sx(s.cardLink)}
                            aria-label={`${trip.name}, ${formatRange(trip.startDate, trip.endDate)}`}
                            onFocus={() => setHot(trip.id)}
                            onBlur={() => setHot((current) => (current === trip.id ? null : current))}
                          />
                          <div {...sx(s.cardCover)}>
                            <TripCover seed={trip.id} points={points.length > 0 ? points : trip.center ? [trip.center] : []} />
                            <div {...sx(s.cardBadges)}>
                              <span {...sx(s.badge)}>
                                {timing.phase === "now" && <span {...sx(s.liveDot)} aria-hidden />}
                                {timing.label}
                              </span>
                              {trip.status === "draft" && <span {...sx(s.badge)}>Draft</span>}
                            </div>
                          </div>
                          <div {...sx(s.cardBody)}>
                            <h4 {...sx(a.display, s.cardTitle, a.wrap)}>{trip.name}</h4>
                            <p {...sx(a.mono, a.muted)}>
                              {formatRange(trip.startDate, trip.endDate)} · {plural(dayCount(trip.startDate, trip.endDate), "day")}
                            </p>
                            <p {...sx(a.small, a.wrap)}>
                              {trip.destinations.join(" · ")}
                              {tags.length > 0 ? ` · ${tags.slice(0, 2).join(", ")}` : ""}
                            </p>
                          </div>
                          <div {...sx(s.cardFoot)}>
                            <span {...sx(a.row, a.small)}>
                              {plural(trip.placeCount ?? 0, "pinned place")}
                              {shared && (
                                <span {...sx(a.chip)} title={trip.sharedWithAllUsers ? "Shared with everyone" : plural(trip.collaborators.length, "guest")}>
                                  <Users size={12} strokeWidth={2} aria-hidden />
                                  {trip.sharedWithAllUsers ? "Everyone" : trip.collaborators.length}
                                </span>
                              )}
                            </span>
                            <span {...sx(s.cardMenu)}>
                              {busy === trip.id ? (
                                <span {...sx(a.iconBtn)} role="status" aria-label="Working">
                                  <Spinner />
                                </span>
                              ) : (
                                <Menu
                                  label={`Options for ${trip.name}`}
                                  side="up"
                                  trigger={<MoreHorizontal size={18} strokeWidth={1.75} aria-hidden />}
                                  items={menuFor(trip)}
                                />
                              )}
                            </span>
                          </div>
                        </article>
                      </li>
                    )
                  })}
                  {phase === BUCKETS.find((b) => filtered.some((t) => t.timing.phase === b.phase))?.phase && !deferredQuery.trim() && (
                    <li>
                      <Link to="/trips/new" {...sx(s.newCard)}>
                        <span {...sx(s.newCardPlus)}>
                          <Plus size={20} strokeWidth={1.75} aria-hidden />
                        </span>
                        <span {...sx(a.body, a.ink)}>Plan another trip</span>
                        <span {...sx(a.small)}>
                          or press <kbd {...sx(s.kbd)}>N</kbd>
                        </span>
                      </Link>
                    </li>
                  )}
                </ul>
              </div>
            )
          })}
        </section>
      )}

      {shareId && (
        <ShareDialog
          open
          tripId={shareId}
          getToken={readToken}
          viewerId={viewer.id}
          onClose={() => {
            setShareId(null)
            setReloadKey((k) => k + 1)
          }}
          onLeft={() => {
            setShareId(null)
            setReloadKey((k) => k + 1)
          }}
        />
      )}

      <Modal
        open={confirm !== null}
        onClose={() => busy === null && setConfirm(null)}
        title={confirm ? `Delete “${confirm.name}”?` : "Delete trip?"}
        description="The itinerary, bookings and invite links are removed for everyone on the trip. This can’t be undone."
        footer={
          <>
            <button type="button" {...sx(a.btn, a.btnSecondary)} disabled={busy !== null} onClick={() => setConfirm(null)}>
              Keep trip
            </button>
            <button type="button" {...sx(a.btn, a.btnDanger)} disabled={busy !== null} onClick={() => confirm && void remove(confirm)}>
              {busy !== null ? <Spinner /> : <Trash2 size={16} strokeWidth={1.75} aria-hidden />}
              Delete trip
            </button>
          </>
        }
      >
        {actionError ? (
          <p {...sx(a.alert)} role="alert">
            Couldn’t delete this trip. ({actionError})
          </p>
        ) : null}
      </Modal>

      {toast && (
        <div {...sx(s.toast)} role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
