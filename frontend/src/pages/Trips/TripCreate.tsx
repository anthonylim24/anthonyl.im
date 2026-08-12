import { useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Loader2, PenLine, Sparkles } from "lucide-react"
import { useGetToken } from "@/lib/safeAuth"
import { createTrip, generateItinerary } from "./tripsApi"
import { DateRangeField } from "./components/DateRangeField"
import { TimezoneField } from "./components/TimezoneField"
import { DEFAULT_ITINERARY_PROMPT, type GeneratePreferences } from "./types"
import {
  SERIF,
  alertErrorClass,
  ghostBtnClass,
  inputClass,
  labelClass,
  primaryBtnClass,
  softPanelClass,
} from "./ui"

const CORE_PREFS: Array<{ key: keyof GeneratePreferences; label: string; placeholder: string }> = [
  { key: "pace", label: "Pace", placeholder: "Relaxed mornings, busy afternoons" },
  { key: "interests", label: "Interests", placeholder: "Food, architecture, vintage shopping" },
  { key: "food", label: "Food", placeholder: "No raw fish; loves noodles" },
]

const MORE_PREFS: Array<{ key: keyof GeneratePreferences; label: string; placeholder: string }> = [
  { key: "budget", label: "Budget", placeholder: "Mid-range, splurge on 2 dinners" },
  { key: "mobility", label: "Mobility", placeholder: "Lots of walking OK; avoid stairs" },
  { key: "mustSee", label: "Must-see", placeholder: "Teamlab, a sumo match" },
  { key: "avoid", label: "Avoid", placeholder: "Long museum days, tourist traps" },
  { key: "lodging", label: "Hotel / base", placeholder: "Park Hyatt, Shinjuku" },
  { key: "transport", label: "Transport", placeholder: "Trains + walking, no rental car" },
]

function parseList(raw: string): string[] {
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function TripCreate() {
  const getToken = useGetToken()
  const navigate = useNavigate()
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
  const [prompt, setPrompt] = useState(DEFAULT_ITINERARY_PROMPT)
  const [prefs, setPrefs] = useState<GeneratePreferences>({})
  const [showPrefs, setShowPrefs] = useState(false)
  const [showMorePrefs, setShowMorePrefs] = useState(false)
  const [busy, setBusy] = useState<"idle" | "creating" | "generating">("idle")
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  const destinationList = useMemo(() => parseList(destinations), [destinations])
  const missing = useMemo(() => {
    const gaps: string[] = []
    if (!name.trim()) gaps.push("trip name")
    if (destinationList.length === 0) gaps.push("at least one destination")
    if (!startDate || !endDate) gaps.push("dates")
    else if (endDate < startDate) gaps.push("an end date on or after the start")
    if (!timezone.trim()) gaps.push("timezone")
    return gaps
  }, [name, destinationList, startDate, endDate, timezone])

  const valid = missing.length === 0

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!valid || busy !== "idle") return
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
      if (mode === "ai") {
        setBusy("generating")
        const preferences = Object.fromEntries(
          Object.entries(prefs).filter(([, v]) => v && v.trim()),
        ) as GeneratePreferences
        try {
          await generateItinerary(getToken, trip.id, {
            prompt: prompt.trim() || undefined,
            preferences: Object.keys(preferences).length ? preferences : undefined,
          })
        } catch (err) {
          navigate(`/trips/${trip.id}/edit`, {
            state: {
              notice: `Trip created, but AI generation failed: ${err instanceof Error ? err.message : String(err)}`,
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
      setError(err instanceof Error ? err.message : String(err))
      setBusy("idle")
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl" noValidate>
      <p className="font-mono-trips text-[11px] uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">
        New itinerary
      </p>
      <h1
        className="mt-2 font-display text-[clamp(2.25rem,5vw,3rem)] tracking-tight text-stone-900 dark:text-stone-100"
        style={SERIF}
      >
        Plan a trip
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
        Essentials first. Days, reservations, and Map Mode come after.
      </p>

      <fieldset className="mt-8">
        <legend className={labelClass}>Start with</legend>
        <div
          className="mt-3 grid grid-cols-2 gap-1 rounded-xl border border-stone-200/90 p-1 dark:border-stone-700"
          role="radiogroup"
          aria-label="How to start"
        >
          {(
            [
              { id: "ai" as const, title: "AI draft", Icon: Sparkles },
              { id: "blank" as const, title: "Blank days", Icon: PenLine },
            ]
          ).map((opt) => (
            <label
              key={opt.id}
              className={`relative flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition focus-within:ring-2 focus-within:ring-amber-700/40 ${
                mode === opt.id
                  ? "bg-amber-800 text-amber-50 dark:bg-amber-600 dark:text-amber-50"
                  : "text-stone-600 hover:bg-stone-100/80 dark:text-stone-300 dark:hover:bg-stone-800/60"
              }`}
            >
              <input
                type="radio"
                name="mode"
                value={opt.id}
                checked={mode === opt.id}
                onChange={() => setMode(opt.id)}
                className="sr-only"
              />
              <opt.Icon className="h-4 w-4 shrink-0" aria-hidden />
              {opt.title}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
          {mode === "ai"
            ? "Structured days and places you can edit."
            : "Empty days for each date. Build it yourself."}
        </p>
      </fieldset>

      <div className={`mt-6 space-y-5 p-5 sm:p-6 ${softPanelClass}`}>
        <div>
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
          />
        </div>
        <div>
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
            aria-describedby="trip-dest-hint"
          />
          <p id="trip-dest-hint" className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
            Comma-separated. First destination usually sets the planning center.
          </p>
          {destinationList.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Parsed destinations">
              {destinationList.map((d) => (
                <li
                  key={d}
                  className="rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-xs text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
                >
                  {d}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[3fr_2fr]">
          <div>
            <span className={labelClass} id="trip-dates-label">
              Dates
            </span>
            <div className="mt-2">
              <DateRangeField
                startDate={startDate}
                endDate={endDate}
                onChange={(s, e) => {
                  setStartDate(s)
                  setEndDate(e)
                }}
              />
            </div>
          </div>
          <div>
            <span className={labelClass} id="trip-tz-label">
              Time zone
            </span>
            <div className="mt-2">
              <TimezoneField value={timezone} onChange={setTimezone} />
            </div>
            <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
              Prefer the destination zone so “today” stays accurate.
            </p>
          </div>
        </div>
        <div>
          <label htmlFor="trip-tags" className={labelClass}>
            Tags <span className="font-normal normal-case tracking-normal text-stone-400">(optional)</span>
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
            Notes <span className="font-normal normal-case tracking-normal text-stone-400">(optional)</span>
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

      {mode === "ai" && (
        <div className={`mt-5 space-y-4 p-5 sm:p-6 ${softPanelClass}`}>
          <div>
            <label htmlFor="trip-prompt" className={labelClass}>
              AI brief
            </label>
            <textarea
              id="trip-prompt"
              rows={3}
              className={`mt-2 ${inputClass}`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowPrefs((s) => !s)}
            className="text-sm font-medium text-amber-800 underline-offset-2 hover:underline dark:text-amber-400"
            aria-expanded={showPrefs}
          >
            {showPrefs ? "Hide traveler preferences" : "Add traveler preferences"}
          </button>
          {showPrefs && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {CORE_PREFS.map((f) => (
                  <div key={f.key} className={f.key === "food" ? "sm:col-span-2" : undefined}>
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
              <button
                type="button"
                onClick={() => setShowMorePrefs((s) => !s)}
                className="text-xs font-medium text-stone-500 underline-offset-2 hover:underline dark:text-stone-400"
                aria-expanded={showMorePrefs}
              >
                {showMorePrefs ? "Fewer preferences" : "More preferences"}
              </button>
              {showMorePrefs && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {MORE_PREFS.map((f) => (
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
            </div>
          )}
        </div>
      )}

      {error && (
        <div className={`mt-5 ${alertErrorClass}`} role="alert">
          {error}
        </div>
      )}

      {touched && !valid && (
        <p className="mt-4 text-sm text-amber-900 dark:text-amber-200" role="status">
          Still need {missing.join(", ")}.
        </p>
      )}

      <div className="sticky bottom-0 z-20 -mx-4 mt-8 border-t border-stone-200/70 bg-[var(--trips-canvas)] px-4 py-4 sm:-mx-6 sm:px-6 dark:border-stone-800/70">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-3">
          <button type="submit" disabled={busy !== "idle"} className={primaryBtnClass}>
            {busy === "idle" ? (
              mode === "ai" ? (
                <>
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Create & generate
                </>
              ) : (
                "Create trip"
              )
            ) : (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {busy === "creating" ? "Creating trip…" : "Generating itinerary…"}
              </>
            )}
          </button>
          <button type="button" onClick={() => navigate("/trips")} className={ghostBtnClass} disabled={busy !== "idle"}>
            Cancel
          </button>
          {busy === "generating" && (
            <p className="w-full text-xs text-stone-500 dark:text-stone-400 sm:w-auto" role="status" aria-live="polite">
              Usually 20–40 seconds. Stay on this page.
            </p>
          )}
        </div>
      </div>
    </form>
  )
}
