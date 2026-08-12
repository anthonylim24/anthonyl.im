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
  accentIconClass,
  alertErrorClass,
  ghostBtnClass,
  inputClass,
  labelClass,
  primaryBtnClass,
  quietBtnClass,
  softPanelClass,
} from "./ui"

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
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl px-4 pt-8 sm:px-6 sm:pt-10" noValidate>
      <p className="font-mono-trips text-[11px] uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">
        New itinerary
      </p>
      <h1 className="mt-2 font-display text-[clamp(2.25rem,5vw,3rem)] tracking-tight text-stone-900 dark:text-stone-100" style={SERIF}>
        Plan a trip
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
        Capture the essentials first. You can refine days, reservations, and Map Mode after.
      </p>

      <fieldset className={`mt-8 p-5 sm:p-6 ${softPanelClass}`}>
        <legend className="sr-only">How to start</legend>
        <p className={labelClass}>Start with</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              {
                id: "ai" as const,
                title: "AI draft",
                body: "Structured days and places you can edit.",
                Icon: Sparkles,
              },
              {
                id: "blank" as const,
                title: "Blank days",
                body: "Empty days for each date — build it yourself.",
                Icon: PenLine,
              },
            ]
          ).map((opt) => (
            <label
              key={opt.id}
              className={`relative flex cursor-pointer gap-3 rounded-xl border p-4 transition focus-within:ring-2 focus-within:ring-[color:var(--trips-focus)] ${
                mode === opt.id
                  ? "border-[color:var(--trips-accent)] bg-[color:var(--ta-soft)]"
                  : "border-stone-200 hover:border-stone-300 dark:border-stone-700 dark:hover:border-stone-600"
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
              <opt.Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${mode === opt.id ? accentIconClass : "text-stone-500 dark:text-stone-400"}`}
                strokeWidth={1.5}
                aria-hidden
              />
              <span>
                <span className="block text-sm font-semibold text-stone-900 dark:text-stone-100">{opt.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-stone-500 dark:text-stone-400">{opt.body}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={`mt-5 space-y-5 p-5 sm:p-6 ${softPanelClass}`}>
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
            Comma-separated. First destination usually sets the planning center of gravity.
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
              Prefer the destination zone so “today” and countdowns stay accurate.
            </p>
          </div>
        </div>
        <div>
          <label htmlFor="trip-tags" className={labelClass}>
            Tags <span className="font-normal normal-case tracking-normal text-stone-500 dark:text-stone-400">(optional)</span>
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
            Notes <span className="font-normal normal-case tracking-normal text-stone-500 dark:text-stone-400">(optional)</span>
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
            className={quietBtnClass}
            aria-expanded={showPrefs}
          >
            {showPrefs ? "Hide traveler preferences" : "Add traveler preferences"}
          </button>
          {showPrefs && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

      <div className="sticky bottom-0 z-20 -mx-4 mt-8 border-t border-stone-200/70 bg-[color-mix(in_srgb,var(--trips-canvas)_92%,transparent)] px-4 py-4 backdrop-blur-md sm:-mx-6 sm:px-6 dark:border-stone-800/70">
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
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} aria-hidden />
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
