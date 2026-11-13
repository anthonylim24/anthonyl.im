import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { ArrowRight, Sparkles } from "lucide-react"
import { sx } from "@/styles/merge"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { useTabTitle } from "@/hooks/useTabTitle"
import { useGetToken } from "@/lib/safeAuth"
import { createTrip, generateItinerary, updateTrip } from "./tripsApi"
import { addDays, dayCount, plural, TRIP_ACCENTS } from "./meta"
import { AtlasMap } from "./map/AtlasMap"
import type { AtlasPin } from "./map/geo"
import type { CityResult } from "./geocode"
import { CityField } from "./components/CityField"
import { DateRange } from "./components/DateRange"
import { Spinner } from "./components/kit"
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

const DRAFT_STEPS = [
  "Creating your trip…",
  "Reading up on the area…",
  "Choosing places worth the detour…",
  "Arranging each day so the route flows…",
  "Pinning everything to the map…",
]

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

export function TripCreate() {
  useTabTitle("New trip · Trips")
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const getToken = useGetToken()
  const readToken = useLatestCallback(getToken)
  const wide = useWide()
  const formId = useId()
  const today = useMemo(localToday, [])
  const [places, setPlaces] = useState<Place[]>([])
  const [startDate, setStartDate] = useState(() => addDays(today, 21))
  const [endDate, setEndDate] = useState(() => addDays(today, 25))
  const [name, setName] = useState("")
  const [useAi, setUseAi] = useState(params.get("ai") !== "0")
  const [brief, setBrief] = useState<DraftBrief>(EMPTY_BRIEF)
  const [phase, setPhase] = useState<"idle" | "creating" | "drafting">("idle")
  const [stepIndex, setStepIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const submitting = useRef(false)

  const busy = phase !== "idle"
  const badRange = endDate < startDate
  const days = badRange ? 0 : dayCount(startDate, endDate)
  const tooLong = days > 60
  const finalName = name.trim() || autoName(places)
  const pins = useMemo<AtlasPin[]>(
    () =>
      places.flatMap((p) =>
        p.city ? [{ id: p.city.id, lat: p.city.lat, lng: p.city.lng, title: p.name, variant: "trip" as const }] : [],
      ),
    [places],
  )

  useEffect(() => {
    if (phase !== "drafting") return
    const timer = setInterval(() => setStepIndex((i) => Math.min(i + 1, DRAFT_STEPS.length - 1)), 6500)
    return () => clearInterval(timer)
  }, [phase])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (submitting.current || places.length === 0 || badRange || tooLong || !finalName) return
    submitting.current = true
    setError(null)
    setPhase("creating")
    setStepIndex(0)
    const first = places.find((p) => p.city)?.city
    try {
      const trip = await createTrip(readToken, {
        name: finalName,
        destinations: places.map((p) => p.name),
        startDate,
        endDate,
        timezone: first?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        center: first ? { lat: first.lat, lng: first.lng } : undefined,
      })
      const path = `/trips/${trip.slug ?? trip.id}`
      // A colour of its own, so the atlas isn't one hue. Best effort.
      await updateTrip(readToken, trip.id, {
        appearance: { accent: TRIP_ACCENTS[hashIndex(trip.id, TRIP_ACCENTS.length)] },
      }).catch(() => undefined)
      if (!useAi) {
        navigate(path)
        return
      }
      setPhase("drafting")
      setStepIndex(1)
      try {
        const generated = await generateItinerary(readToken, trip.id, briefToRequest(brief))
        const stops = generated.trip.days.reduce((n, d) => n + d.items.length, 0)
        navigate(path, {
          state: {
            notice:
              stops > 0
                ? `Drafted ${plural(stops, "stop")} across ${plural(generated.trip.days.length, "day")}. Everything is editable.`
                : "The AI draft came back empty. Use “Draft with AI” to try again, or add stops yourself.",
          },
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        navigate(path, {
          state: {
            notice: /GEMINI|GROQ|ai_not_configured|503/i.test(message)
              ? "Your trip is ready. AI drafting isn’t switched on for this server, so the days start empty."
              : `Your trip is ready, but the AI draft didn’t finish. Use “Draft with AI” to try again. (${message})`,
          },
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase("idle")
      submitting.current = false
    }
  }

  const map = (
<AtlasMap
      pins={pins}
      frameKey={pins.map((p) => p.id).join(",")}
      restCenter={{ lat: 24, lng: 10 }}
      restZoom={1.5}
      bare={!wide}
      maxZoom={9.5}
      padding={wide ? { top: 120, right: 120, bottom: 120, left: 120 } : { top: 40, right: 60, bottom: 40, left: 60 }}
      label={pins.length > 0 ? `Map showing ${places.map((p) => p.name).join(", ")}` : "World map. It flies to each destination you add."}
    >
      {busy && wide && (
        <p {...sx(c.mapNote)} role="presentation">
          <Spinner />
          <span {...sx(a.truncate)}>{DRAFT_STEPS[stepIndex]}</span>
        </p>
      )}
    </AtlasMap>
  )

  return (
    <div {...sx(ws.root)}>
      <div {...sx(ws.pane)}>
        <form id={formId} {...sx(c.form)} onSubmit={(event) => void submit(event)} noValidate>
          <header {...sx(a.stack)}>
            <p {...sx(a.eyebrow)}>New trip</p>
            <h1 {...sx(a.display, c.title)}>
              Where <span {...sx(a.italic)}>to?</span>
            </h1>
          </header>
          {!wide && <div {...sx(c.strip)}>{map}</div>}

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
                  Trips can run up to 60 days. Shorten the range, or split it into two trips.
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
                maxLength={160}
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
                  Real places, pinned and grouped into days. Takes about a minute, and you can edit all of it.
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
              {busy ? (phase === "drafting" ? "Drafting…" : "Creating…") : useAi ? "Create and draft itinerary" : "Create trip"}
            </button>
            {!busy && (
              <Link to="/trips" {...sx(a.btn, a.btnGhost)}>
                Cancel
              </Link>
            )}
            <p {...sx(a.small, a.grow)} role="status" aria-live="polite">
              {busy ? DRAFT_STEPS[stepIndex] : ""}
            </p>
          </div>
        </form>
      </div>

      {wide && <div {...sx(ws.mapPane)}>{map}</div>}
    </div>
  )
}
