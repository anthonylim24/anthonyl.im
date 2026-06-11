import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Loader2, Sparkles, WandSparkles } from "lucide-react"
import { useGetToken } from "@/lib/safeAuth"
import { createTrip, generateItinerary } from "./tripsApi"
import { DateRangeField } from "./components/DateRangeField"
import { TimezoneField } from "./components/TimezoneField"
import { DEFAULT_ITINERARY_PROMPT, type GeneratePreferences } from "./types"

const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"

const labelClass = "block text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400"

const PREFERENCE_FIELDS: Array<{ key: keyof GeneratePreferences; label: string; placeholder: string }> = [
  { key: "pace", label: "Pace", placeholder: "Relaxed mornings, busy afternoons" },
  { key: "budget", label: "Budget", placeholder: "Mid-range, splurge on 2 dinners" },
  { key: "interests", label: "Interests", placeholder: "Food, architecture, vintage shopping" },
  { key: "food", label: "Food preferences", placeholder: "No raw fish; loves noodles" },
  { key: "mustSee", label: "Must-see", placeholder: "Teamlab, a sumo match" },
  { key: "avoid", label: "Avoid", placeholder: "Long museum days, tourist traps" },
  { key: "lodging", label: "Hotel / base", placeholder: "Park Hyatt, Shinjuku" },
  { key: "transport", label: "Transport", placeholder: "Trains + walking, no rental car" },
]

export function TripCreate() {
  const getToken = useGetToken()
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [destinations, setDestinations] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")
  const [tags, setTags] = useState("")
  const [description, setDescription] = useState("")
  const [mode, setMode] = useState<"blank" | "ai">("ai")
  const [prompt, setPrompt] = useState(DEFAULT_ITINERARY_PROMPT)
  const [prefs, setPrefs] = useState<GeneratePreferences>({})
  const [showPrefs, setShowPrefs] = useState(false)
  const [busy, setBusy] = useState<"idle" | "creating" | "generating">("idle")
  const [error, setError] = useState<string | null>(null)

  const valid = name.trim() && destinations.trim() && startDate && endDate && endDate >= startDate

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid || busy !== "idle") return
    setError(null)
    setBusy("creating")
    try {
      const trip = await createTrip(getToken, {
        name: name.trim(),
        destinations: destinations.split(",").map((d) => d.trim()).filter(Boolean),
        startDate,
        endDate,
        timezone,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
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
          // The trip exists — land on it with a notice rather than losing work.
          navigate(`/trips/${trip.id}`, {
            state: { notice: `Trip created, but AI generation failed: ${err instanceof Error ? err.message : String(err)}` },
          })
          return
        }
      }
      navigate(`/trips/${trip.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy("idle")
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl">
      <h1
        className="font-serif text-4xl text-stone-900 dark:text-stone-100"
        style={{ fontFamily: "'Cormorant Garamond', serif" }}
      >
        New trip
      </h1>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
        Start blank, or let AI draft a structured itinerary you can reshape.
      </p>

      <div className="mt-8 space-y-5 rounded-3xl border border-stone-200/80 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <div>
          <label htmlFor="trip-name" className={labelClass}>Trip name</label>
          <input id="trip-name" className={`mt-1.5 ${inputClass}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tokyo Long Weekend" required />
        </div>
        <div>
          <label htmlFor="trip-dest" className={labelClass}>Destinations (comma-separated)</label>
          <input id="trip-dest" className={`mt-1.5 ${inputClass}`} value={destinations} onChange={(e) => setDestinations(e.target.value)} placeholder="Tokyo, Hakone" required />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[3fr_2fr]">
          <div>
            <span className={labelClass}>Dates</span>
            <div className="mt-1.5">
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
            <span className={labelClass}>Time zone</span>
            <div className="mt-1.5">
              <TimezoneField value={timezone} onChange={setTimezone} />
            </div>
          </div>
        </div>
        <div>
          <label htmlFor="trip-tags" className={labelClass}>Tags (optional, comma-separated)</label>
          <input id="trip-tags" className={`mt-1.5 ${inputClass}`} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="anniversary, food" />
        </div>
        <div>
          <label htmlFor="trip-desc" className={labelClass}>Notes (optional)</label>
          <textarea id="trip-desc" rows={2} className={`mt-1.5 ${inputClass}`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Context the AI and collaborators should know — occasion, constraints, anchors." />
        </div>
      </div>

      <fieldset className="mt-6 rounded-3xl border border-stone-200/80 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <legend className="sr-only">Itinerary start mode</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              { id: "ai", title: "AI starter itinerary", body: "Drafts days, places, and meals as structured, editable items." },
              { id: "blank", title: "Start blank", body: "Empty days for each date — build it up yourself." },
            ] as const
          ).map((opt) => (
            <label
              key={opt.id}
              className={`cursor-pointer rounded-2xl border p-4 transition ${
                mode === opt.id
                  ? "border-amber-500 bg-amber-50/60 dark:border-amber-600 dark:bg-amber-950/20"
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
              <div className="flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-100">
                {opt.id === "ai" && <Sparkles className="h-4 w-4 text-amber-600" aria-hidden />}
                {opt.title}
              </div>
              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{opt.body}</p>
            </label>
          ))}
        </div>

        {mode === "ai" && (
          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="trip-prompt" className={labelClass}>AI prompt</label>
              <textarea
                id="trip-prompt"
                rows={3}
                className={`mt-1.5 ${inputClass}`}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => setShowPrefs((s) => !s)}
              className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
            >
              {showPrefs ? "Hide" : "Add"} traveler preferences
            </button>
            {showPrefs && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {PREFERENCE_FIELDS.map((f) => (
                  <div key={f.key}>
                    <label htmlFor={`pref-${f.key}`} className={labelClass}>{f.label}</label>
                    <input
                      id={`pref-${f.key}`}
                      className={`mt-1.5 ${inputClass}`}
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
      </fieldset>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300" role="alert">
          {error}
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={!valid || busy !== "idle"}
          className="inline-flex items-center gap-2 rounded-full bg-amber-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-600 dark:hover:bg-amber-500"
        >
          {busy === "idle" ? (
            <>
              <WandSparkles className="h-4 w-4" aria-hidden />
              {mode === "ai" ? "Create & generate" : "Create trip"}
            </>
          ) : (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {busy === "creating" ? "Creating trip…" : "Generating itinerary… (~30s)"}
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => navigate("/trips")}
          className="rounded-full px-4 py-3 text-sm text-stone-600 transition hover:bg-stone-200/60 dark:text-stone-400 dark:hover:bg-stone-800/60"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
