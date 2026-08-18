import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ChevronDown, Loader2, type LucideIcon, PenLine, Sparkles } from "lucide-react"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { useGetToken } from "@/lib/safeAuth"
import { createTrip, generateItinerary } from "./tripsApi"
import { DateRangeField } from "./components/DateRangeField"
import { TimezoneField } from "./components/TimezoneField"
import { DEFAULT_ITINERARY_PROMPT, type GeneratePreferences } from "./types"
import { useCompactChrome } from "./useCompactChrome"
import {
  EASE,
  REVEAL_DURATION,
  accentIconClass,
  alertErrorClass,
  coverBandClass,
  displayInputClass,
  ghostBtnClass,
  hintClass,
  inputClass,
  labelClass,
  mutedInkClass,
  pageClass,
  primaryBtnClass,
  secondaryBtnClass,
  segmentOptionClass,
  segmentTrackClass,
  spinnerClass,
  stampChipClass,
  typeDisplayClass,
  wrapAnywhereClass,
} from "./ui"

const SHEET = pageClass("form")

const optionalLabelClass = `font-normal normal-case tracking-normal ${mutedInkClass}`

const fieldErrorClass = "mt-1.5 text-xs font-medium text-red-700 dark:text-red-300"

const bandFieldErrorClass = "mt-1.5 text-xs font-medium text-red-200"

const sheetRuleClass = "border-t border-[color:var(--trips-border)] pt-5"

type FieldKey = "name" | "destinations" | "dates" | "timezone"

interface FieldProblem {
  field: FieldKey
  /** Reads as a list item in the summary ("Still need a trip name, dates."). */
  summary: string
  /** Reads as an instruction under the field itself. */
  message: string
}

function FieldError({
  problem,
  id,
  className = fieldErrorClass,
}: {
  problem: FieldProblem | null
  id: string
  className?: string
}) {
  if (!problem) return null
  return (
    <p id={id} className={className}>
      {problem.message}
    </p>
  )
}

const PREFERENCE_FIELDS: Array<{ key: keyof GeneratePreferences; label: string; placeholder: string }> = [
  { key: "pace", label: "Pace", placeholder: "Relaxed mornings, busy afternoons" },
  { key: "budget", label: "Budget", placeholder: "Mid-range, splurge on 2 dinners" },
  { key: "interests", label: "Interests", placeholder: "Food, architecture, vintage shopping" },
  { key: "food", label: "Food", placeholder: "No raw fish; loves noodles" },
  { key: "mobility", label: "Mobility", placeholder: "Lots of walking OK; avoid stairs" },
  { key: "mustSee", label: "Must-see", placeholder: "Teamlab, a sumo match" },
  { key: "avoid", label: "Avoid", placeholder: "Long museum days, tourist traps" },
  { key: "lodging", label: "Hotel / base", placeholder: "Park Hyatt, Shinjuku" },
  { key: "transport", label: "Transport", placeholder: "Trains + walking, no rental car" },
]

interface ModeOption {
  id: "ai" | "blank"
  title: string
  body: string
  Icon: LucideIcon
  recommended?: boolean
}

const MODE_OPTIONS: ModeOption[] = [
  {
    id: "ai",
    title: "AI draft",
    body: "Structured days and places you can edit.",
    Icon: Sparkles,
    recommended: true,
  },
  {
    id: "blank",
    title: "Blank days",
    body: "Empty days for each date. Build it yourself.",
    Icon: PenLine,
  },
]

function parseList(raw: string): string[] {
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function TripCreate() {
  const getToken = useGetToken()
  const readToken = useLatestCallback(getToken)
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const compact = useCompactChrome()
  const [params] = useSearchParams()
  const initialMode = params.get("mode") === "blank" ? "blank" : "ai"

  const [name, setName] = useState("")
  const [destinations, setDestinations] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")
  const [tags, setTags] = useState("")
  const [description, setDescription] = useState("")
  const [mode, setMode] = useState<"blank" | "ai">(initialMode)
  const [prompt, setPrompt] = useState("")
  const [prefs, setPrefs] = useState<GeneratePreferences>({})
  const [showPrefs, setShowPrefs] = useState(false)
  const [showCoverDetails, setShowCoverDetails] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [phase, setPhase] = useState<"creating" | "generating">("creating")
  const busy: "idle" | "creating" | "generating" = isPending ? phase : "idle"
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
  const selectedMode = MODE_OPTIONS.find((opt) => opt.id === mode)

  useEffect(() => {
    if (!generating || reduce) return
    const startedAt = Date.now()
    const id = window.setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [generating, reduce])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (isPending) return
    if (!valid) {
      focusField(problems[0].field)
      return
    }
    setError(null)
    startTransition(async () => {
      setPhase("creating")
      try {
        const trip = await createTrip(readToken, {
          name: name.trim(),
          destinations: destinationList,
          startDate,
          endDate,
          timezone,
          tags: parseList(tags),
          description: description.trim() || undefined,
        })
        if (mode === "ai") {
          setElapsed(0)
          setPhase("generating")
          const preferences = Object.fromEntries(
            Object.entries(prefs).filter(([, v]) => v && v.trim()),
          ) as GeneratePreferences
          try {
            const generated = await generateItinerary(readToken, trip.id, {
              prompt: prompt.trim() || undefined,
              preferences: Object.keys(preferences).length ? preferences : undefined,
            })
            const empty = generated.trip.days.every((d) => d.items.length === 0)
            if (empty) {
              navigate(`/trips/${trip.id}`, {
                state: {
                  notice: "The AI draft came back empty. Your days are ready; run Generate to try again.",
                  retryGenerate: { prompt: prompt.trim() || undefined, preferences },
                },
              })
              return
            }
          } catch (err) {
            navigate(`/trips/${trip.id}`, {
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
        navigate(`/trips/${trip.id}`)
      } catch (err) {
        setError(
          `Couldn’t create the trip. Nothing was saved, so you can submit again. (${err instanceof Error ? err.message : String(err)})`,
        )
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="pb-16" noValidate>
      <header
        className={`${coverBandClass} flex flex-col justify-end ${compact ? "" : "min-h-[38svh]"}`}
        data-compact={compact ? "true" : undefined}
      >
        <div className="mx-auto w-full max-w-2xl">
          <h1 className={`${typeDisplayClass} cover-extra`}>New trip</h1>
          <div className="mt-6" ref={(el) => void (groupRefs.current.name = el)}>
            <label htmlFor="trip-name" className="sr-only">
              Trip name
            </label>
            <input
              id="trip-name"
              className={`${displayInputClass} text-[color:var(--trips-band-ink)] placeholder:text-[color:var(--trips-band-ink)]/40 ${wrapAnywhereClass}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tokyo Long Weekend"
              required
              autoComplete="off"
              aria-invalid={errorFor("name") ? true : undefined}
              aria-describedby={errorFor("name") ? errorId("name") : undefined}
            />
            <FieldError problem={errorFor("name")} id={errorId("name")} className={bandFieldErrorClass} />
          </div>
        </div>
      </header>

      <div className={SHEET}>
        <div className="space-y-5">
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
            <FieldError problem={errorFor("destinations")} id={errorId("destinations")} />
            <p id="trip-dest-hint" className={hintClass}>
              Comma-separated. First destination usually sets the planning center of gravity.
            </p>
            {destinationList.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Parsed destinations">
                {destinationList.map((d) => (
                  <li
                    key={d}
                    className={`${stampChipClass} text-[color:var(--trips-ink)] ${wrapAnywhereClass}`}
                  >
                    {d}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={`grid grid-cols-1 gap-5 sm:grid-cols-[3fr_2fr] ${sheetRuleClass}`}>
            <div ref={(el) => void (groupRefs.current.dates = el)}>
              <span className={labelClass} id="trip-dates-label">
                Dates
              </span>
              <div className="mt-2">
                <DateRangeField
                  startDate={startDate}
                  endDate={endDate}
                  invalid={errorFor("dates") !== null}
                  describedBy={errorFor("dates") ? errorId("dates") : undefined}
                  onChange={(s, e) => {
                    setStartDate(s)
                    setEndDate(e)
                  }}
                />
              </div>
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
                  describedBy={errorFor("timezone") ? errorId("timezone") : undefined}
                />
              </div>
              <FieldError problem={errorFor("timezone")} id={errorId("timezone")} />
              <p className={hintClass}>Use the destination’s time zone.</p>
            </div>
          </div>

          <div className={sheetRuleClass}>
            <button
              type="button"
              onClick={() => setShowCoverDetails((s) => !s)}
              className={secondaryBtnClass}
              aria-expanded={showCoverDetails}
              aria-controls="trip-cover-details"
            >
              {showCoverDetails ? "Hide cover details" : "More cover details"}
              <ChevronDown
                className={`h-4 w-4 transition ${showCoverDetails ? "rotate-180" : ""} motion-reduce:transition-none`}
                strokeWidth={1.5}
                aria-hidden
              />
            </button>
            <div id="trip-cover-details" hidden={!showCoverDetails}>
              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
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
                  />
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
                    placeholder="Occasion, constraints, or anchors collaborators should know."
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <fieldset className={`mt-8 ${sheetRuleClass}`}>
          <legend className={labelClass}>How should we start it?</legend>
          <div className={`mt-3 ${segmentTrackClass}`}>
            {MODE_OPTIONS.map((opt) => {
              const selected = mode === opt.id
              return (
                <label key={opt.id} className={`cursor-pointer ${segmentOptionClass(selected)}`}>
                  <input
                    type="radio"
                    name="mode"
                    value={opt.id}
                    checked={selected}
                    onChange={() => setMode(opt.id)}
                    className="sr-only"
                  />
                  <opt.Icon
                    className={`h-4 w-4 shrink-0 ${selected && opt.recommended ? accentIconClass : ""}`}
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  {opt.title}
                  {opt.recommended ? <span className="sr-only">, recommended</span> : null}
                </label>
              )
            })}
          </div>
          {selectedMode ? (
            <p className={hintClass}>
              {selectedMode.recommended ? "Recommended. " : ""}
              {selectedMode.body}
            </p>
          ) : null}
        </fieldset>

        {mode === "ai" && (
          <motion.div
            className={`mt-5 space-y-4 ${sheetRuleClass}`}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: REVEAL_DURATION, ease: EASE }}
          >
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
                    />
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {error && (
          <div className={`mt-5 ${alertErrorClass}`} role="alert">
            {error}
          </div>
        )}

        <p className="mt-4 text-sm text-amber-900 empty:mt-0 dark:text-amber-200" role="status">
          {shown.length > 0 ? `Still need ${shown.map((p) => p.summary).join(", ")}.` : ""}
        </p>
      </div>

      <div className="sticky bottom-0 z-20 mt-8 border-t border-[color:var(--trips-border)] bg-[color:var(--trips-canvas)] px-4 py-4 sm:px-6">
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
            <p
              className="w-full text-xs text-stone-600 sm:w-auto dark:text-stone-400"
              role="status"
              aria-live="polite"
            >
              <span className="sr-only">
                Generating your itinerary. This usually takes 20 to 40 seconds. Stay on this page.
              </span>
              <span aria-hidden className="font-mono-trips tabular-nums">
                {reduce ? "Usually 20 to 40s. Stay on this page." : `Generating… ${elapsed}s · usually 20 to 40s`}
              </span>
            </p>
          )}
        </div>
      </div>
    </form>
  )
}
