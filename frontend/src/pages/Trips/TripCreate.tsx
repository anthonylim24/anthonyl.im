import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { ArrowRight, Sparkles, Square } from "lucide-react"
import { sx } from "@/styles/merge"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { useTabTitle } from "@/hooks/useTabTitle"
import { useGetToken } from "@/lib/safeAuth"
import { createTrip, generateItinerary, updateTrip } from "./tripsApi"
import { addDays, dayCount, TRIP_ACCENTS } from "./meta"
import { AtlasMap } from "./map/AtlasMap"
import type { AtlasPin } from "./map/geo"
import { searchCities, type CityResult } from "./geocode"
import { exactCity, placeKey } from "./cityMatch"
import { validZone } from "./dayClock"
import { draftNotice, elapsedText } from "./draftCopy"
import { extractInstagramUrls } from "./instagram/instagram"
import { LIMITS } from "./limits"
import { CityField } from "./components/CityField"
import { isComposing } from "./ime"
import { DateRange } from "./components/DateRange"
import { Spinner } from "./components/kit"
import { TimeZoneField } from "./components/TimeZoneField"
import { BriefFields, briefToRequest, EMPTY_BRIEF, type DraftBrief } from "./workspace/AiPanels"
import { a } from "./atlas.stylex"
import { create as c } from "./index.stylex"
import { ws } from "./workspace.stylex"

// Three answers make a trip: where, when, and whether AI should sketch it.
// The map beside the form flies to each place as it's picked.

interface Place {
  name: string
  city?: CityResult
}

const LENGTHS = [
  { label: "Weekend", days: 3 },
  { label: "5 days", days: 5 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
]

/** A geocoder that has not answered by then counts as "not found": creating must not hang on it. */
const LOCATE_MS = 5000
/** After this long the draft says it is still going, and that long trips take a while. */
const SLOW_DRAFT_S = 30

/** One mode at a time: the form, finding the first place, creating, or waiting on the AI draft. */
type Phase = { k: "idle" } | { k: "locating"; place: string } | { k: "creating" } | { k: "drafting"; since: number; path: string }

function localToday(): string {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function autoName(places: readonly Place[]): string {
  const names = places.map((p) => p.name)
  if (names.length === 0) return ""
  if (names.length === 1) return names[0]!
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  return `${names[0]}, ${names[1]} & more`
}

function hashIndex(text: string, size: number): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return h % size
}

function useWide(): boolean {
  const [wide, setWide] = useState(() => typeof window === "undefined" || !window.matchMedia || window.matchMedia("(min-width: 1024px)").matches)
  useEffect(() => {
    if (!window.matchMedia) return
    const query = window.matchMedia("(min-width: 1024px)")
    const sync = () => setWide(query.matches)
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])
  return wide
}

/** The city a typed place names exactly, or null when the geocoder has none (or fails, or is slow). */
function locate(name: string): Promise<CityResult | null> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve(null)
    }, LOCATE_MS)
  })
  const found = searchCities(name, controller.signal).then(
    (results) => exactCity(results, name) ?? null,
    () => null,
  )
  return Promise.race([found, timeout]).finally(() => clearTimeout(timer))
}

const isAbort = (err: unknown) => err instanceof Error && err.name === "AbortError"

export function TripCreate() {
  useTabTitle("New trip · Trips")
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const getToken = useGetToken()
  const readToken = useLatestCallback(getToken)
  const wide = useWide()
  const formId = useId()
  const [today] = useState(localToday)
  const [places, setPlaces] = useState<Place[]>([])
  const [startDate, setStartDate] = useState(() => addDays(today, 21))
  const [endDate, setEndDate] = useState(() => addDays(today, 25))
  const [name, setName] = useState("")
  const [useAi, setUseAi] = useState(params.get("ai") !== "0")
  const [brief, setBrief] = useState<DraftBrief>(EMPTY_BRIEF)
  const [phase, setPhase] = useState<Phase>({ k: "idle" })
  const [clock, setClock] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  /** The first place the geocoder couldn't find; the form asks for its time zone. */
  const [unplaced, setUnplaced] = useState<string | null>(null)
  const [zone, setZone] = useState<string | null>(null)
  const zoneRef = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)
  /** The AI draft in flight: Stop and leaving the page abort it. */
  const draftRun = useRef<AbortController | null>(null)
  /** False once the page is left: a draft that lands later must not navigate. */
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      draftRun.current?.abort()
    }
  }, [])

  // A post shared to the app with no trip to put it on: it goes onto this one once it exists.
  const sharedPost = extractInstagramUrls(params.get("instagram") ?? "")[0] ?? null

  const busy = phase.k !== "idle"
  const badRange = endDate < startDate
  const days = badRange ? 0 : dayCount(startDate, endDate)
  const tooLong = days > LIMITS.days
  const finalName = name.trim() || autoName(places)
  const head = places[0]
  // The question stands while the first place is still the one that couldn't be found.
  const askZone = unplaced !== null && head !== undefined && !head.city && placeKey(head.name) === placeKey(unplaced)
  const pins = useMemo<AtlasPin[]>(
    () =>
      places.flatMap((p) =>
        p.city ? [{ id: p.city.id, lat: p.city.lat, lng: p.city.lng, title: p.name, variant: "trip" as const }] : [],
      ),
    [places],
  )

  useEffect(() => {
    if (phase.k !== "drafting") return
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [phase.k])

  useEffect(() => {
    if (unplaced) zoneRef.current?.focus()
  }, [unplaced])

  const elapsed = phase.k === "drafting" ? Math.max(0, (clock - phase.since) / 1000) : 0
  const slow = elapsed >= SLOW_DRAFT_S
  /** Spoken: changes rarely, so a screen reader hears each step once. */
  const statusText =
    phase.k === "locating"
      ? `Finding ${phase.place} on the map…`
      : phase.k === "creating"
        ? "Creating your trip…"
        : phase.k === "drafting"
          ? slow
            ? "Still drafting. Long trips can take two minutes."
            : "Drafting the itinerary with AI…"
          : ""
  /** Shown: the same, with an honest running clock while the draft is out. */
  const shownText =
    phase.k === "drafting"
      ? slow
        ? `Still drafting · ${elapsedText(elapsed)} · long trips can take two minutes`
        : `Drafting the itinerary · ${elapsedText(elapsed)}`
      : statusText

  const tripPath = (slug: string) => (sharedPost ? `/trips/${slug}?instagram=${encodeURIComponent(sharedPost)}` : `/trips/${slug}`)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (submitting.current || places.length === 0 || badRange || tooLong || !finalName) return
    if (askZone && !zone) {
      zoneRef.current?.focus()
      return
    }
    submitting.current = true
    setError(null)
    const stop = () => {
      setPhase({ k: "idle" })
      submitting.current = false
    }

    // The first place sets the trip's time zone. One typed without picking
    // a result is looked up now; if the map can't place it, ask.
    let list = places
    let first = list[0]!
    let timezone = validZone(first.city?.timezone)
    if (!timezone && askZone) timezone = zone ?? undefined
    if (!timezone && !first.city) {
      setPhase({ k: "locating", place: first.name })
      const city = await locate(first.name)
      if (!mounted.current) return
      if (city) {
        first = { name: first.name, city }
        list = [first, ...list.slice(1)]
        setPlaces(list)
        timezone = validZone(city.timezone)
      }
    }
    if (!timezone) {
      setUnplaced(first.name)
      stop()
      return
    }

    setPhase({ k: "creating" })
    const centre = list.find((p) => p.city)?.city
    let trip: Awaited<ReturnType<typeof createTrip>>
    try {
      trip = await createTrip(readToken, {
        name: finalName,
        destinations: list.map((p) => p.name),
        startDate,
        endDate,
        timezone,
        center: centre ? { lat: centre.lat, lng: centre.lng } : undefined,
      })
    } catch (err) {
      if (!mounted.current) return
      setError(err instanceof Error ? err.message : String(err))
      stop()
      return
    }
    const path = tripPath(trip.slug ?? trip.id)
    // A colour of its own, so the atlas isn't one hue. Best effort.
    await updateTrip(readToken, trip.id, {
      appearance: { accent: TRIP_ACCENTS[hashIndex(trip.id, TRIP_ACCENTS.length)] },
    }).catch(() => undefined)
    if (!mounted.current) return
    if (!useAi) {
      navigate(path)
      return
    }

    const run = new AbortController()
    draftRun.current = run
    setClock(Date.now())
    setPhase({ k: "drafting", since: Date.now(), path })
    try {
      const generated = await generateItinerary(readToken, trip.id, briefToRequest(brief), run.signal)
      if (!mounted.current || run.signal.aborted) return
      const stops = generated.trip.days.reduce((n, d) => n + d.items.length, 0)
      navigate(path, { state: { notice: draftNotice(stops, generated.trip.days.length, generated.incompleteDays) } })
    } catch (err) {
      if (!mounted.current || run.signal.aborted || isAbort(err)) return
      const message = err instanceof Error ? err.message : String(err)
      navigate(path, {
        state: {
          notice: /GEMINI|GROQ|ai_not_configured|503/i.test(message)
            ? "Your trip is ready. AI drafting isn’t switched on for this server, so the days start empty."
            : `Your trip is ready, but the AI draft didn’t finish. Use “Draft with AI” to try again. (${message})`,
        },
      })
    } finally {
      if (draftRun.current === run) draftRun.current = null
    }
  }

  // The trip exists by now: Stop stops waiting and opens it. The server keeps
  // going once a draft has started (docs/trips.md), so the days may still fill.
  const stopDraft = (path: string) => {
    draftRun.current?.abort()
    navigate(path, {
      state: {
        notice: "You stopped waiting for the AI draft. It may still finish and fill the days in a minute or two; if it doesn’t, use “Draft with AI”.",
      },
    })
  }
  const map = (
    <AtlasMap
      pins={pins}
      frameKey={pins.map((p) => p.id).join(",")}
      restCenter={{ lat: 24, lng: 10 }}
      restZoom={1.5}
      bare={!wide}
      maxZoom={11.6}
      padding={wide ? { top: 120, right: 120, bottom: 120, left: 120 } : { top: 40, right: 60, bottom: 40, left: 60 }}
      label={pins.length > 0 ? `Map showing ${places.map((p) => p.name).join(", ")}` : "World map. It flies to each destination you add."}
    >
      {busy && wide && (
        <p {...sx(c.mapNote)} role="presentation">
          <Spinner />
          <span {...sx(a.truncate)}>{shownText}</span>
        </p>
      )}
    </AtlasMap>
  )

  return (
    <div {...sx(ws.root)}>
      <div {...sx(ws.pane)}>
        <form
          id={formId}
          {...sx(c.form)}
          onSubmit={(event) => void submit(event)}
          onKeyDown={(event) => {
            // Enter that confirms an IME composition (Korean, Japanese) must not create the trip.
            if (event.key === "Enter" && isComposing(event)) event.preventDefault()
          }}
          noValidate
        >
          <header {...sx(a.stack)}>
            <p {...sx(a.eyebrow)}>New trip</p>
            <h1 {...sx(a.display, c.title)}>
              Where <span {...sx(a.italic)}>to?</span>
            </h1>
          </header>
          {!wide && <div {...sx(c.strip)}>{map}</div>}

          {sharedPost && (
            <p {...sx(a.notice)}>Once the trip exists, the places from the Instagram post you shared go straight onto it.</p>
          )}

          <section>
            <div {...sx(c.stepBody)}>
              <label htmlFor={`${formId}-where`} {...sx(c.stepLabel)}>
                Destinations
              </label>
              <CityField
                id={`${formId}-where`}
                autoFocus
                disabled={busy}
                values={places.map((p) => p.name)}
                invalid={touched && places.length === 0}
                placeholder="Lisbon, Kyoto, Patagonia…"
                onAdd={(placeName, city) => setPlaces((current) => [...current, { name: placeName, city }])}
                onRemove={(index) => setPlaces((current) => current.filter((_, i) => i !== index))}
              />
              {touched && places.length === 0 ? (
                <p {...sx(a.errorText)} role="alert" style={{ marginTop: 0 }}>
                  Add at least one place to plan around.
                </p>
              ) : (
                <p {...sx(a.small)}>Add as many stops as the trip has. The first one sets the time zone.</p>
              )}
              {askZone && (
                <div {...sx(a.stack)} style={{ gap: "0.5rem", marginTop: "0.25rem" }}>
                  <label htmlFor={`${formId}-zone`} {...sx(a.label)} style={{ marginBottom: 0 }}>
                    Time zone for {head!.name}
                  </label>
                  <p id={`${formId}-zone-why`} {...sx(a.small)}>
                    The map couldn’t find “{head!.name}”, so pick its time zone. Times on the trip follow it.
                  </p>
                  <TimeZoneField
                    ref={zoneRef}
                    id={`${formId}-zone`}
                    value={zone}
                    onChange={setZone}
                    disabled={busy}
                    invalid={touched && !zone}
                    describedBy={`${formId}-zone-why`}
                  />
                </div>
              )}
            </div>
          </section>

          <section>
            <div {...sx(c.stepBody)}>
              <span {...sx(c.stepLabel)}>Dates</span>
              <DateRange
                start={startDate}
                end={badRange ? startDate : endDate}
                disabled={busy}
                invalid={tooLong}
                onChange={(from, to) => {
                  setStartDate(from)
                  setEndDate(to)
                }}
              />
              <div {...sx(a.rowWrap)} role="group" aria-label="Trip length">
                {LENGTHS.map((length) => (
                  <button
                    key={length.label}
                    type="button"
                    disabled={busy}
                    aria-pressed={days === length.days}
                    {...sx(a.pill, days === length.days && a.pillOn)}
                    onClick={() => setEndDate(addDays(startDate, length.days - 1))}
                  >
                    {length.label}
                  </button>
                ))}
              </div>
              {tooLong && (
                <p {...sx(a.errorText)} role="alert" style={{ marginTop: 0 }}>
                  Trips can run up to {LIMITS.days} days. Shorten the range, or split it into two trips.
                </p>
              )}
            </div>
          </section>

          <section>
            <div {...sx(c.stepBody)}>
              <label htmlFor={`${formId}-name`} {...sx(c.stepLabel)}>
                Name <span {...sx(a.muted)} style={{ fontWeight: 400 }}>· optional</span>
              </label>
              <input
                id={`${formId}-name`}
                value={name}
                maxLength={LIMITS.tripName}
                disabled={busy}
                placeholder={autoName(places) || "We’ll name it after the destination"}
                {...sx(a.field)}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          </section>

          <section {...sx(a.stack)} style={{ gap: "1rem" }}>
            <button
              type="button"
              role="switch"
              aria-checked={useAi}
              disabled={busy}
              {...sx(c.aiToggle, useAi && c.aiToggleOn)}
              onClick={() => setUseAi((v) => !v)}
            >
              <Sparkles size={20} strokeWidth={1.5} aria-hidden {...sx(a.noShrink, a.accentText)} />
              <span {...sx(a.grow)}>
                <span {...sx(a.body, a.ink)} style={{ fontWeight: 600, display: "block" }}>
                  Draft the itinerary with AI
                </span>
                <span {...sx(a.small)} style={{ display: "block" }}>
                  Real places, pinned and grouped into days. Takes a minute or two, and you can edit all of it.
                </span>
              </span>
              <span {...sx(c.switch, useAi && c.switchOn)} aria-hidden>
                <span {...sx(c.knob, useAi && c.knobOn)} />
              </span>
            </button>
            {useAi && <BriefFields brief={brief} onChange={setBrief} disabled={busy} />}
          </section>

          {error && (
            <p {...sx(a.alert)} role="alert">
              Couldn’t create the trip. Check your connection and try again. ({error})
            </p>
          )}

          <div {...sx(c.submitRow, c.submitSticky)}>
            <button type="submit" {...sx(a.btn, a.btnPrimary)} disabled={busy}>
              {busy ? <Spinner /> : useAi ? <Sparkles size={16} strokeWidth={1.75} aria-hidden /> : <ArrowRight size={16} strokeWidth={1.75} aria-hidden />}
              {busy ? (phase.k === "drafting" ? "Drafting…" : "Creating…") : useAi ? "Create and draft itinerary" : "Create trip"}
            </button>
            {phase.k === "drafting" && (
              <button type="button" {...sx(a.btn, a.btnSecondary)} onClick={() => stopDraft(phase.path)}>
                <Square size={14} strokeWidth={2} aria-hidden />
                Stop
              </button>
            )}
            <Link to="/trips" {...sx(a.btn, a.btnGhost)}>
              Cancel
            </Link>
            <p {...sx(a.small, a.grow)} aria-hidden>
              {shownText}
            </p>
            <p {...sx(a.srOnly)} role="status">
              {statusText}
            </p>
          </div>
        </form>
      </div>

      {wide && <div {...sx(ws.mapPane)}>{map}</div>}
    </div>
  )
}
