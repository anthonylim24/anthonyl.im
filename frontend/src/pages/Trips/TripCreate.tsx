import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ChevronDown, Loader2, Sparkles } from "lucide-react"
import { useGetToken } from "@/lib/safeAuth"
import { createTrip, generateItinerary, updateTrip } from "./tripsApi"
import { DateRangeField } from "./components/DateRangeField"
import { TimezoneField } from "./components/TimezoneField"
import { DEFAULT_ITINERARY_PROMPT, type GeneratePreferences, type TripAccent } from "./types"
import { ACCENT_LABEL, ACCENT_SWATCH, DEFAULT_ACCENT, TRIP_ACCENTS } from "./theme"
import {
  DISPLAY,
  EASE,
  REVEAL_DURATION,
  alertErrorClass,
  displaySectionClass,
  displayTitleClass,
  focusRingClass,
  ghostBtnClass,
  hintClass,
  inputClass,
  labelClass,
  mutedInkClass,
  pageClass,
  panelClass,
  primaryBtnClass,
  revealDelay,
  secondaryBtnClass,
  spinnerClass,
  wrapAnywhereClass,
} from "./ui"

const optionalLabelClass = `font-normal ${mutedInkClass}`

const fieldErrorClass = "mt-1.5 text-xs font-medium text-[color:var(--tr-danger)]"

type FieldKey = "name" | "destinations" | "dates" | "timezone"

interface FieldProblem {
  field: FieldKey
  /** Reads as a list item in the summary ("Still need a trip name, dates."). */
  summary: string
  /** Reads as an instruction under the field itself. */
  message: string
}

function FieldError({ problem, id }: { problem: FieldProblem | null; id: string }) {
  if (!problem) return null
  return (
    <p id={id} className={fieldErrorClass}>
      {problem.message}
    </p>
  )
}

const PREFERENCE_FIELDS: Array<{ key: keyof GeneratePreferences; label: string; hint: string; placeholder: string }> = [
  { key: "pace", label: "Pace", hint: "How full each day should feel.", placeholder: "Relaxed mornings, busy afternoons" },
  { key: "budget", label: "Budget", hint: "A range, or where you want to splurge.", placeholder: "Mid-range, splurge on 2 dinners" },
  { key: "interests", label: "Interests", hint: "What you want the days to orbit.", placeholder: "Food, architecture, vintage shopping" },
  { key: "food", label: "Food", hint: "Likes, dislikes, and hard limits.", placeholder: "No raw fish; loves noodles" },
  { key: "mobility", label: "Mobility", hint: "Walking, stairs, transit comfort.", placeholder: "Lots of walking OK; avoid stairs" },
  { key: "mustSee", label: "Must-see", hint: "Places that have to make the cut.", placeholder: "Teamlab, a sumo match" },
  { key: "avoid", label: "Avoid", hint: "Things to leave off the draft.", placeholder: "Long museum days, tourist traps" },
  { key: "lodging", label: "Hotel / base", hint: "Where you are staying, if you know.", placeholder: "Park Hyatt, Shinjuku" },
  { key: "transport", label: "Transport", hint: "How you want to get around.", placeholder: "Trains + walking, no rental car" },
]

function parseList(raw: string): string[] {
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseMode(raw: string | null): "ai" | "blank" | null {
  if (raw === "ai" || raw === "blank") return raw
  return null
}

export function TripCreate() {
  const getToken = useGetToken()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [params, setParams] = useSearchParams()
  const mode = parseMode(params.get("mode"))

  const [name, setName] = useState("")
  const [destinations, setDestinations] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")
  const [tags, setTags] = useState("")
  const [description, setDescription] = useState("")
  const [accent, setAccent] = useState<TripAccent>(DEFAULT_ACCENT)
  const [prompt, setPrompt] = useState("")
  const [prefs, setPrefs] = useState<GeneratePreferences>({})
  const [showPrefs, setShowPrefs] = useState(false)
  const [busy, setBusy] = useState<"idle" | "creating" | "generating">("idle")
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  const groupRefs = useRef<Record<FieldKey, HTMLDivElement | null>>({
    name: null,
    destinations: null,
    dates: null,
    timezone: null,
  })

  const destinationList = useMemo(() => parseList(destinations), [destinations])
  const problems = useMemo<FieldProblem[]>(() => {
    const list: FieldProblem[] = []
    if (!name.trim()) list.push({ field: "name", summary: "a trip name", message: "Give the trip a name." })
    if (destinationList.length === 0)
      list.push({
        field: "destinations",
        summary: "at least one destination",
        message: "Name at least one destination.",
      })
    if (!startDate || !endDate)
      list.push({ field: "dates", summary: "dates", message: "Pick the first and last day." })
    else if (endDate < startDate)
      list.push({
        field: "dates",
        summary: "an end date on or after the start",
        message: "The last day can’t be before the first.",
      })
    if (!timezone.trim()) list.push({ field: "timezone", summary: "a time zone", message: "Pick a time zone." })
    return list
  }, [name, destinationList, startDate, endDate, timezone])

  const valid = problems.length === 0
  // Errors stay silent until the first submit attempt, then follow the fields.
  const shown = touched ? problems : []
  const errorFor = (field: FieldKey) => shown.find((p) => p.field === field) ?? null
  const errorId = (field: FieldKey) => `trip-${field}-error`

  const focusField = (field: FieldKey) => {
    groupRefs.current[field]?.querySelector<HTMLElement>("input, button, textarea, select")?.focus()
  }

  const generating = busy === "generating"

  useEffect(() => {
    if (!generating || reduce) return
    const startedAt = Date.now()
    const id = window.setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [generating, reduce])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (busy !== "idle") return
    if (!valid) {
      focusField(problems[0].field)
      return
    }
    if (!mode) return
    setError(null)
    setBusy("creating")
    try {
      const trip = await createTrip(getToken, {
        name: name.trim(),
        destinations: destinationList,
        startDate,
        endDate,
        timezone,
        tags: parseList(tags),
        description: description.trim() || undefined,
      })
      try {
        await updateTrip(getToken, trip.id, { appearance: { accent } })
      } catch {
        // The trip exists. Accent can be set later in the editor.
      }
      if (mode === "ai") {
        setElapsed(0)
        setBusy("generating")
        const preferences = Object.fromEntries(
          Object.entries(prefs).filter(([, v]) => v && v.trim()),
        ) as GeneratePreferences
        try {
          const generated = await generateItinerary(getToken, trip.id, {
            prompt: prompt.trim() || undefined,
            preferences: Object.keys(preferences).length ? preferences : undefined,
          })
          const empty = generated.trip.days.every((d) => d.items.length === 0)
          if (empty) {
            navigate(`/trips/${trip.id}/edit`, {
              state: {
                notice: "The AI draft came back empty. Your days are ready; run Generate to try again.",
                retryGenerate: { prompt: prompt.trim() || undefined, preferences },
              },
            })
            return
          }
        } catch (err) {
          navigate(`/trips/${trip.id}/edit`, {
            state: {
              notice: `Trip created, but the AI draft didn’t finish. Your days are empty; run Generate to try again. (${err instanceof Error ? err.message : String(err)})`,
              retryGenerate: { prompt: prompt.trim() || undefined, preferences },
            },
          })
          return
        }
        navigate(`/trips/${trip.id}`)
        return
      }
      navigate(`/trips/${trip.id}/edit`)
    } catch (err) {
      setError(
        `Couldn’t create the trip. Nothing was saved, so you can submit again. (${err instanceof Error ? err.message : String(err)})`,
      )
      setBusy("idle")
    }
  }

  if (!mode) {
    return (
      // One decision, so the step is composed as a moment rather than a page
      // with a hole under it.
      <div className={`${pageClass("reading")} flex min-h-[calc(100dvh-9rem)] flex-col justify-center pb-16`}>
        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: REVEAL_DURATION, ease: EASE }}
          className={displayTitleClass}
          style={DISPLAY}
        >
          How should we start?
        </motion.h1>
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: REVEAL_DURATION, delay: revealDelay(1), ease: EASE }}
          className={`mt-3 max-w-[46ch] text-sm leading-relaxed ${mutedInkClass}`}
        >
          An AI draft gives you structured days to edit. A blank trip is empty days you fill yourself.
        </motion.p>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-[1.35fr_1fr] sm:gap-5">
          <motion.button
            type="button"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: REVEAL_DURATION, delay: revealDelay(2), ease: EASE }}
            onClick={() => setParams({ mode: "ai" })}
            className={`trip-plate group min-h-44 p-6 text-left sm:min-h-56 sm:p-8 ${panelClass} ${focusRingClass} active:translate-y-px motion-reduce:active:translate-y-0`}
          >
            <h2 className={displaySectionClass} style={DISPLAY}>
              Plan with AI
            </h2>
            <p className={`mt-3 max-w-[32ch] text-sm leading-relaxed ${mutedInkClass}`}>
              Structured days and places you can reshape after the draft lands.
            </p>
          </motion.button>
          <motion.button
            type="button"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: REVEAL_DURATION, delay: revealDelay(4), ease: EASE }}
            onClick={() => setParams({ mode: "blank" })}
            className={`min-h-36 p-6 text-left sm:min-h-56 sm:self-end ${panelClass} ${focusRingClass} active:translate-y-px motion-reduce:active:translate-y-0`}
          >
            <h2 className="font-display text-xl leading-snug tracking-[-0.015em]" style={DISPLAY}>
              Start blank
            </h2>
            <p className={`mt-3 max-w-[28ch] text-sm leading-relaxed ${mutedInkClass}`}>
              Empty days for each date. Build the itinerary yourself.
            </p>
          </motion.button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className={pageClass("form")} noValidate data-trip-accent={accent}>
      <p className={`text-sm ${mutedInkClass}`}>{mode === "ai" ? "AI draft" : "Blank days"}</p>
      <h1 className={`mt-2 ${displayTitleClass}`} style={DISPLAY}>
        Plan a trip
      </h1>
      <p className={`mt-2 max-w-[46ch] text-sm leading-relaxed ${mutedInkClass}`}>
        {mode === "ai"
          ? "Capture the essentials, then we draft days you can edit."
          : "Capture the essentials. You fill the days after."}
      </p>
      <button
        type="button"
        className={`mt-3 ${ghostBtnClass}`}
        onClick={() => setParams({})}
        disabled={busy !== "idle"}
      >
        Choose a different start
      </button>

      <div className={`mt-8 space-y-5 p-5 sm:p-6 ${panelClass}`}>
        <div ref={(el) => void (groupRefs.current.name = el)}>
          <label htmlFor="trip-name" className={labelClass}>
            Trip name
          </label>
          <input
            id="trip-name"
            className={`mt-2 ${inputClass}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tokyo Long Weekend"
            required
            autoComplete="off"
            aria-invalid={errorFor("name") ? true : undefined}
            aria-describedby={errorFor("name") ? `${errorId("name")} trip-name-hint` : "trip-name-hint"}
          />
          <p id="trip-name-hint" className={hintClass}>
            A short name collaborators will recognize.
          </p>
          <FieldError problem={errorFor("name")} id={errorId("name")} />
        </div>
        <div ref={(el) => void (groupRefs.current.destinations = el)}>
          <label htmlFor="trip-dest" className={labelClass}>
            Destinations
          </label>
          <input
            id="trip-dest"
            className={`mt-2 ${inputClass}`}
            value={destinations}
            onChange={(e) => setDestinations(e.target.value)}
            placeholder="Tokyo, Hakone"
            required
            aria-invalid={errorFor("destinations") ? true : undefined}
            aria-describedby={
              errorFor("destinations") ? `${errorId("destinations")} trip-dest-hint` : "trip-dest-hint"
            }
          />
          <p id="trip-dest-hint" className={hintClass}>
            Comma-separated. First destination usually sets the planning center of gravity.
          </p>
          <FieldError problem={errorFor("destinations")} id={errorId("destinations")} />
          {destinationList.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Parsed destinations">
              {destinationList.map((d) => (
                <li
                  key={d}
                  className={`rounded-[var(--tr-r-control)] border border-[color:var(--tr-line)] bg-[var(--tr-overlay)] px-2 py-1 text-xs ${wrapAnywhereClass}`}
                >
                  {d}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[3fr_2fr]">
          <div ref={(el) => void (groupRefs.current.dates = el)}>
            <span className={labelClass} id="trip-dates-label">
              Dates
            </span>
            <div className="mt-2">
              <DateRangeField
                startDate={startDate}
                endDate={endDate}
                invalid={errorFor("dates") !== null}
                describedBy={errorFor("dates") ? `${errorId("dates")} trip-dates-hint` : "trip-dates-hint"}
              onChange={(s, e) => {
                  setStartDate(s)
                  setEndDate(e)
                }}
              />
            </div>
            <p id="trip-dates-hint" className={hintClass}>
              First and last day of the trip.
            </p>
            <FieldError problem={errorFor("dates")} id={errorId("dates")} />
          </div>
          <div ref={(el) => void (groupRefs.current.timezone = el)}>
            <span className={labelClass} id="trip-tz-label">
              Time zone
            </span>
            <div className="mt-2">
              <TimezoneField
                value={timezone}
                onChange={setTimezone}
                invalid={errorFor("timezone") !== null}
                describedBy={errorFor("timezone") ? `${errorId("timezone")} trip-tz-hint` : "trip-tz-hint"}
              />
            </div>
            <p id="trip-tz-hint" className={hintClass}>
              Use the destination’s time zone.
            </p>
            <FieldError problem={errorFor("timezone")} id={errorId("timezone")} />
          </div>
        </div>
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className={labelClass}>Accent</legend>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Trip accent" aria-describedby="trip-accent-hint">
            {TRIP_ACCENTS.map((a) => {
              const selected = accent === a
              return (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={ACCENT_LABEL[a]}
                  onClick={() => setAccent(a)}
                  className={`h-11 w-11 rounded-[var(--tr-r-control)] ${focusRingClass} ${
                    selected ? "ring-2 ring-[color:var(--tr-ink)] ring-offset-2 ring-offset-[var(--tr-canvas)]" : "opacity-70 hover:opacity-100"
                  }`}
                  style={{ backgroundColor: ACCENT_SWATCH[a] }}
                />
              )
            })}
          </div>
          <p id="trip-accent-hint" className={hintClass}>
            Used on this trip’s pages. Ember is the default.
          </p>
        </fieldset>
        <div>
          <label htmlFor="trip-tags" className={labelClass}>
            Tags <span className={optionalLabelClass}>(optional)</span>
          </label>
          <input
            id="trip-tags"
            className={`mt-2 ${inputClass}`}
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="anniversary, food"
            aria-describedby="trip-tags-hint"
          />
          <p id="trip-tags-hint" className={hintClass}>
            Comma-separated labels for later filtering.
          </p>
        </div>
        <div>
          <label htmlFor="trip-desc" className={labelClass}>
            Notes <span className={optionalLabelClass}>(optional)</span>
          </label>
          <textarea
            id="trip-desc"
            rows={2}
            className={`mt-2 ${inputClass}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Anniversary weekend, no early trains."
            aria-describedby="trip-desc-hint"
          />
          <p id="trip-desc-hint" className={hintClass}>
            Occasion, constraints, or anchors collaborators should know.
          </p>
        </div>
      </div>

      {mode === "ai" && (
        <div className={`mt-5 space-y-4 p-5 sm:p-6 ${panelClass}`}>
          <div>
            <label htmlFor="trip-prompt" className={labelClass}>
              AI brief <span className={optionalLabelClass}>(optional)</span>
            </label>
            <textarea
              id="trip-prompt"
              rows={3}
              className={`mt-2 ${inputClass}`}
              value={prompt}
              placeholder={DEFAULT_ITINERARY_PROMPT}
              onChange={(e) => setPrompt(e.target.value)}
              aria-describedby="trip-prompt-hint"
            />
            <p id="trip-prompt-hint" className={hintClass}>
              Leave blank to use the balanced default shown here.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPrefs((s) => !s)}
            className={secondaryBtnClass}
            aria-expanded={showPrefs}
            aria-controls="trip-prefs"
          >
            {showPrefs ? "Hide traveler preferences" : "Add traveler preferences"}
            <ChevronDown
              className={`h-4 w-4 transition ${showPrefs ? "rotate-180" : ""} motion-reduce:transition-none`}
              strokeWidth={1.5}
              aria-hidden
            />
          </button>
          {showPrefs && (
            <div id="trip-prefs" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {PREFERENCE_FIELDS.map((f) => (
                <div key={f.key}>
                  <label htmlFor={`pref-${f.key}`} className={labelClass}>
                    {f.label}
                  </label>
                  <input
                    id={`pref-${f.key}`}
                    className={`mt-2 ${inputClass}`}
                    value={prefs[f.key] ?? ""}
                    placeholder={f.placeholder}
                    onChange={(e) => setPrefs((p) => ({ ...p, [f.key]: e.target.value }))}
                    aria-describedby={`pref-${f.key}-hint`}
                  />
                  <p id={`pref-${f.key}-hint`} className={hintClass}>
                    {f.hint}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className={`mt-5 ${alertErrorClass}`} role="alert">
          {error}
        </div>
      )}

      <p className="mt-4 text-sm text-[color:var(--tr-warn)] empty:mt-0" role="status">
        {shown.length > 0 ? `Still need ${shown.map((p) => p.summary).join(", ")}.` : ""}
      </p>

      <div className="sticky bottom-0 z-20 -mx-4 mt-8 border-t border-[color:var(--tr-line)] bg-[color-mix(in_srgb,var(--tr-canvas)_92%,transparent)] px-4 py-4 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-3">
          <button type="submit" disabled={busy !== "idle"} className={primaryBtnClass}>
            {busy === "idle" ? (
              mode === "ai" ? (
                <>
                  <Sparkles className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  Create & generate
                </>
              ) : (
                "Create trip"
              )
            ) : (
              <>
                <Loader2 className={`h-4 w-4 ${spinnerClass}`} strokeWidth={1.5} aria-hidden />
                {busy === "creating" ? "Creating trip…" : "Generating itinerary…"}
              </>
            )}
          </button>
          <button type="button" onClick={() => navigate("/trips")} className={ghostBtnClass} disabled={busy !== "idle"}>
            Cancel
          </button>
          {generating && (
            <p className={`w-full text-xs sm:w-auto ${mutedInkClass}`} role="status" aria-live="polite">
              <span className="sr-only">
                Generating your itinerary. This usually takes 20 to 40 seconds. Stay on this page.
              </span>
              <span aria-hidden className="font-mono-trips tabular-nums">
                {reduce ? "Usually 20-40s. Stay on this page." : `Generating, ${elapsed}s. Usually 20-40s.`}
              </span>
            </p>
          )}
        </div>
      </div>
    </form>
  )
}
