import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Link, useLocation, useParams } from "react-router-dom"
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Bookmark,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  FileText,
  Globe2,
  Heading2,
  Loader2,
  Map as MapIcon,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { useGetToken } from "@/lib/safeAuth"
import { applySuggestions, enhanceTrip, generateItinerary, getTrip, updateTrip, type GetToken } from "./tripsApi"
import {
  addItem,
  convertNoteToPlace,
  duplicateItem,
  makeItem,
  moveItem,
  moveItemToDay,
  removeItem,
  updateItem,
} from "./tripEdits"
import type {
  EnhancementRun,
  ItemKind,
  ItemStatus,
  ItineraryItem,
  Trip,
  TripAccess,
  TripDay,
  TripStatus,
} from "./types"
import { DEFAULT_ITINERARY_PROMPT, type GeneratePreferences } from "./types"

// Map Mode pulls in three.js — keep it lazy so the editor stays light.
const MapModeOverlay = lazy(() =>
  import("../Korea/MapModeOverlay").then((m) => ({ default: m.MapModeOverlay })),
)

const inputClass =
  "rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-stone-900 transition placeholder:text-stone-400 hover:border-stone-200 focus:border-amber-500 focus:bg-white focus:outline-none dark:text-stone-100 dark:hover:border-stone-700 dark:focus:bg-stone-900"

const STATUS_OPTIONS: Array<{ value: ItemStatus; label: string }> = [
  { value: "none", label: "—" },
  { value: "optional", label: "Optional" },
  { value: "booked", label: "Booked" },
  { value: "completed", label: "Completed" },
  { value: "needs_review", label: "Needs review" },
]

const STATUS_CHIP: Record<ItemStatus, string> = {
  none: "",
  optional: "bg-stone-200/70 text-stone-600 dark:bg-stone-800 dark:text-stone-400",
  booked: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  completed: "bg-stone-200 text-stone-500 line-through dark:bg-stone-800 dark:text-stone-500",
  needs_review: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
}

const KIND_ICON: Record<ItemKind, typeof MapPin> = {
  place: MapPin,
  note: FileText,
  section: Heading2,
  reservation: Bookmark,
}

function formatDayDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success" }

export function TripDetail() {
  const { tripId } = useParams<{ tripId: string }>()
  const routerLocation = useLocation()
  const getToken = useGetToken()
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [trip, setTrip] = useState<Trip | null>(null)
  const [access, setAccess] = useState<TripAccess>("view")
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty" | "error">("saved")
  const navState = routerLocation.state as {
    notice?: string
    retryGenerate?: { prompt?: string; preferences?: GeneratePreferences }
  } | null
  const [notice, setNotice] = useState<string | null>(navState?.notice ?? null)
  const [mapDayId, setMapDayId] = useState<string | null>(null)
  // "trip" or a dayId while that enhancement is in flight.
  const [enhancingTarget, setEnhancingTarget] = useState<string | null>(null)
  const [activeRun, setActiveRun] = useState<EnhancementRun | null>(null)
  // Item ids touched by the last applied suggestions — drives the amber
  // "this just changed" flash, cleared after the flash finishes.
  const [recentIds, setRecentIds] = useState<Set<string>>(() => new Set())
  const recentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editable = access === "edit" || access === "owner"


  useEffect(() => {
    if (!tripId) return
    void (async () => {
      try {
        const { trip: loaded, access: a } = await getTrip(getToken, tripId)
        setTrip(loaded)
        setAccess(a)
        setState({ status: "success" })
      } catch (err) {
        setState({ status: "error", message: err instanceof Error ? err.message : String(err) })
      }
    })()
  }, [tripId, getToken])

  // Debounced document save: any edit marks the trip dirty; 900ms after the
  // last keystroke the whole days array (and renamed metadata) is PATCHed.
  const scheduleSave = useCallback(
    (next: Trip) => {
      setTrip(next)
      setSaveState("dirty")
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        setSaveState("saving")
        void updateTrip(getToken, next.id, {
          name: next.name,
          status: next.status,
          days: next.days,
        })
          .then(() => setSaveState("saved"))
          .catch(() => setSaveState("error"))
      }, 900)
    },
    [getToken],
  )

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  const setDays = useCallback(
    (fn: (days: TripDay[]) => TripDay[]) => {
      setTrip((t) => {
        if (!t) return t
        const next = { ...t, days: fn(t.days) }
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave],
  )

  const dayOptions = useMemo(
    () => (trip ? trip.days.map((d, i) => ({ id: d.id, label: `Day ${i + 1} · ${formatDayDate(d.date)}` })) : []),
    [trip],
  )

  const runEnhance = async (scope: "day" | "trip", dayId?: string) => {
    if (!trip || enhancingTarget) return
    setEnhancingTarget(scope === "day" ? (dayId ?? null) : "trip")
    setActiveRun(null)
    try {
      const { run, trip: refreshed } = await enhanceTrip(getToken, trip.id, scope, dayId)
      // The server auto-syncs day.weather from the live forecast during the run.
      if (refreshed) setTrip(refreshed)
      setActiveRun(run)
    } catch (err) {
      setNotice(`Enhancement failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setEnhancingTarget(null)
    }
  }

  const applyRun = async (suggestionIds: string[]) => {
    if (!trip || !activeRun) return
    try {
      const { trip: next, applied } = await applySuggestions(getToken, trip.id, activeRun.id, suggestionIds)
      // Flash the items the accepted suggestions touched (added or edited).
      const touched = new Set<string>()
      for (const id of applied) {
        const s = activeRun.suggestions.find((x) => x.id === id)
        const target = s?.proposedItem?.id ?? s?.itemId
        if (target && (s?.kind === "add" || s?.kind === "edit")) touched.add(target)
      }
      setTrip(next)
      setActiveRun(null)
      setSaveState("saved")
      setRecentIds(touched)
      if (recentTimer.current) clearTimeout(recentTimer.current)
      recentTimer.current = setTimeout(() => setRecentIds(new Set()), 3200)
      setNotice(`Applied ${applied.length} suggestion${applied.length === 1 ? "" : "s"}.`)
    } catch (err) {
      setNotice(`Could not apply suggestions: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  useEffect(() => () => {
    if (recentTimer.current) clearTimeout(recentTimer.current)
  }, [])

  if (state.status === "loading") {
    return (
      <div className="space-y-4" role="status" aria-label="Loading trip">
        <div className="h-12 w-2/3 animate-pulse rounded-xl bg-stone-200/60 dark:bg-stone-900" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl bg-stone-200/60 dark:bg-stone-900" />
        ))}
      </div>
    )
  }

  if (state.status === "error" || !trip) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
        Couldn’t load this trip{state.status === "error" ? ` (${state.message})` : ""}.
      </div>
    )
  }

  const mapDay = mapDayId ? trip.days.find((d) => d.id === mapDayId) : null
  const mapDayIndex = mapDay ? trip.days.findIndex((d) => d.id === mapDay.id) : -1

  return (
    <div>
      {/* Trip header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <input
            value={trip.name}
            disabled={!editable}
            onChange={(e) => scheduleSave({ ...trip, name: e.target.value })}
            aria-label="Trip name"
            className="w-full bg-transparent font-serif text-4xl text-stone-900 focus:outline-none dark:text-stone-100"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          />
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {trip.destinations.join(" · ")} · {trip.startDate} → {trip.endDate} · {trip.timezone}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/trips/${trip.id}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-3.5 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-900 dark:border-stone-700 dark:text-stone-300 dark:hover:text-stone-100"
          >
            <Eye className="h-4 w-4" aria-hidden />
            View
          </Link>
          <select
            value={trip.status}
            disabled={!editable}
            onChange={(e) => scheduleSave({ ...trip, status: e.target.value as TripStatus })}
            aria-label="Trip status"
            className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm capitalize dark:border-stone-700 dark:bg-stone-900"
          >
            {(["draft", "active", "archived", "completed"] as const).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {editable && trip.status === "draft" && (
            <button
              type="button"
              onClick={() => {
                scheduleSave({ ...trip, status: "active" })
                setNotice("Trip published — it's now active for everyone who can see it.")
              }}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-600/40 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70"
            >
              <Globe2 className="h-4 w-4" aria-hidden />
              Publish
            </button>
          )}
          {editable && (
            <button
              type="button"
              onClick={() => void runEnhance("trip")}
              disabled={enhancingTarget !== null}
              className="inline-flex items-center gap-2 rounded-full bg-amber-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-800 disabled:opacity-50 dark:bg-amber-600 dark:hover:bg-amber-500"
            >
              {enhancingTarget === "trip" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
              {enhancingTarget === "trip" ? "Reviewing trip…" : "Enhance trip"}
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {/* Appearance — accent + dossier copy for the trip's public pages */}
      {editable && (
        <AppearancePanel trip={trip} onChange={(appearance) => scheduleSave({ ...trip, appearance })} />
      )}

      {/* AI generation for an empty itinerary — also the retry path when
          generation failed during the create flow. */}
      {editable && trip.days.every((d) => d.items.length === 0) && (
        <GeneratePanel
          getToken={getToken}
          tripId={trip.id}
          initialPrompt={navState?.retryGenerate?.prompt}
          preferences={navState?.retryGenerate?.preferences}
          onGenerated={(next) => {
            setTrip(next)
            setSaveState("saved")
            setNotice(null)
          }}
        />
      )}

      {/* Trip-wide enhancement review stays at the top; day-scoped runs
          render inside their day card. */}
      {activeRun && activeRun.scope === "trip" && (
        <SuggestionsPanel
          run={activeRun}
          dayOptions={dayOptions}
          onApply={(ids) => void applyRun(ids)}
          onDismiss={() => setActiveRun(null)}
        />
      )}

      {/* Days + sticky day-rail navigation (desktop) */}
      <div className="mt-8 lg:grid lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-8">
        <nav aria-label="Days" className="hidden lg:block">
          <ol className="sticky top-20 space-y-0.5 border-l border-stone-200 pl-3 dark:border-stone-800">
            {trip.days.map((day, idx) => (
              <li key={day.id}>
                <a
                  href={`#${day.id}`}
                  className="block rounded-md px-2 py-1 text-[13px] text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                >
                  <span className="font-medium">Day {idx + 1}</span>
                  <span className="ml-1.5 text-stone-400 dark:text-stone-500">
                    {new Date(`${day.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="space-y-8">
          {trip.days.map((day, idx) => (
            <DayCard
              key={day.id}
              day={day}
              index={idx}
              editable={editable}
              dayOptions={dayOptions}
              enhancing={enhancingTarget === day.id}
              recentIds={recentIds}
              run={activeRun && activeRun.scope === "day" && activeRun.dayId === day.id ? activeRun : null}
              onApplyRun={(ids) => void applyRun(ids)}
              onDismissRun={() => setActiveRun(null)}
              onChange={setDays}
              onOpenMap={() => setMapDayId(day.id)}
              onEnhance={() => void runEnhance("day", day.id)}
            />
          ))}
        </div>
      </div>

      {/* Non-blocking floating save indicator (visible while scrolled) */}
      <FloatingSaveIndicator saveState={saveState} />


      {/* Map Mode */}
      {mapDay && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 text-sm text-stone-300" role="status">
              Loading map…
            </div>
          }
        >
          <MapModeOverlay
            daySlug={mapDay.id}
            dayTitle={mapDay.title ?? `Day ${mapDayIndex + 1}`}
            placesUrl={`/api/trips/${encodeURIComponent(trip.id)}/days/${encodeURIComponent(mapDay.id)}/places`}
            onClose={() => setMapDayId(null)}
          />
        </Suspense>
      )}
    </div>
  )
}

// ── AI generation panel (empty trips + retry after a failed generate) ────

function GeneratePanel({
  getToken,
  tripId,
  initialPrompt,
  preferences,
  onGenerated,
}: {
  getToken: GetToken
  tripId: string
  initialPrompt?: string
  preferences?: GeneratePreferences
  onGenerated: (trip: Trip) => void
}) {
  const [prompt, setPrompt] = useState(initialPrompt ?? DEFAULT_ITINERARY_PROMPT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const { trip } = await generateItinerary(getToken, tripId, {
        prompt: prompt.trim() || undefined,
        preferences,
        replaceExisting: true,
      })
      onGenerated(trip)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      aria-label="Generate itinerary with AI"
      className="mt-6 rounded-3xl border border-stone-200/80 bg-white p-5 motion-reduce:transition-none dark:border-stone-800 dark:bg-stone-900"
    >
      <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900 dark:text-stone-100">
        <Sparkles className="h-4 w-4 text-amber-600" aria-hidden />
        Draft this itinerary with AI
      </h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        The itinerary is empty — generate a structured starting point, then reshape it. Every place
        the AI adds lands on the map.
      </p>
      <textarea
        value={prompt}
        rows={3}
        aria-label="AI prompt"
        onChange={(e) => setPrompt(e.target.value)}
        className="mt-3 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-600/25 dark:border-stone-700 dark:bg-stone-950/40 dark:text-stone-100"
      />
      {error && (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300" role="alert">
          Generation failed: {error}
        </p>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-800 disabled:opacity-60 dark:bg-amber-600 dark:hover:bg-amber-500"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          {busy ? "Generating… (~30s)" : error ? "Retry generation" : "Generate itinerary"}
        </button>
        {preferences && Object.values(preferences).some(Boolean) && (
          <span className="text-xs text-stone-500 dark:text-stone-400">
            Your traveler preferences from the create form are included.
          </span>
        )}
      </div>
    </motion.section>
  )
}

// ── Floating save indicator ──────────────────────────────────────────────
//
// Non-blocking: a small fixed pill that appears while edits are unsaved or
// in flight, lingers on "Saved" for a moment, then fades away.

function FloatingSaveIndicator({ saveState }: { saveState: "saved" | "saving" | "dirty" | "error" }) {
  const reduce = useReducedMotion()
  const [showSaved, setShowSaved] = useState(false)
  const prev = useRef(saveState)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    if (saveState === "saved" && (prev.current === "saving" || prev.current === "dirty")) {
      setShowSaved(true)
      timer = setTimeout(() => setShowSaved(false), 1800)
    }
    prev.current = saveState
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [saveState])

  const visible = saveState !== "saved" || showSaved
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-40" role="status" aria-live="polite">
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium shadow-lg backdrop-blur ${
              saveState === "error"
                ? "border-red-200 bg-red-50/95 text-red-800 dark:border-red-900/50 dark:bg-red-950/90 dark:text-red-300"
                : "border-stone-200 bg-white/95 text-stone-600 dark:border-stone-700 dark:bg-stone-900/95 dark:text-stone-300"
            }`}
          >
            {saveState === "error" ? (
              <>
                <X className="h-3.5 w-3.5 text-red-600" aria-hidden />
                Save failed — retries on next edit
              </>
            ) : saveState === "saved" ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                All changes saved
              </>
            ) : (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 motion-reduce:animate-none" aria-hidden />
                {saveState === "saving" ? "Saving…" : "Unsaved changes…"}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Appearance panel ─────────────────────────────────────────────────────
//
// Configures the dossier-style public pages: accent family + editorial copy.
// AI generation proposes these; everything here overrides it.

const ACCENT_SWATCH: Record<string, string> = {
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
}

function AppearancePanel({ trip, onChange }: { trip: Trip; onChange: (appearance: NonNullable<Trip["appearance"]>) => void }) {
  const [open, setOpen] = useState(false)
  const appearance = trip.appearance ?? {}
  const patch = (p: Partial<NonNullable<Trip["appearance"]>>) => onChange({ ...appearance, ...p })
  const fieldClass =
    "w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"

  return (
    <section className="mt-6 rounded-2xl border border-stone-200/80 bg-white dark:border-stone-800 dark:bg-stone-900">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
      >
        <span className="flex items-center gap-2.5 text-sm font-semibold text-stone-900 dark:text-stone-100">
          <span className={`h-3.5 w-3.5 rounded-full ${ACCENT_SWATCH[appearance.accent ?? "amber"]}`} aria-hidden />
          Appearance
          <span className="font-normal text-stone-400 dark:text-stone-500">
            — accent, hero copy for the trip page
          </span>
        </span>
        <span className="text-xs text-stone-400">{open ? "Hide" : "Configure"}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-stone-100 px-5 py-4 dark:border-stone-800">
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Accent</span>
            <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Accent color">
              {Object.entries(ACCENT_SWATCH).map(([name, cls]) => (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={(appearance.accent ?? "amber") === name}
                  aria-label={name}
                  title={name}
                  onClick={() => patch({ accent: name as NonNullable<Trip["appearance"]>["accent"] })}
                  className={`h-7 w-7 rounded-full ${cls} transition ${
                    (appearance.accent ?? "amber") === name
                      ? "ring-2 ring-stone-900 ring-offset-2 dark:ring-stone-100 dark:ring-offset-stone-900"
                      : "opacity-60 hover:opacity-100"
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Eyebrow</span>
              <input className={`mt-1 ${fieldClass}`} value={appearance.eyebrow ?? ""} placeholder="The dossier" onChange={(e) => patch({ eyebrow: e.target.value || undefined })} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Subtitle</span>
              <input className={`mt-1 ${fieldClass}`} value={appearance.subtitle ?? ""} placeholder="a Seoul & Busan dossier" onChange={(e) => patch({ subtitle: e.target.value || undefined })} />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Headline</span>
            <textarea
              rows={2}
              className={`mt-1 ${fieldClass}`}
              value={appearance.headline ?? ""}
              placeholder="The editorial paragraph under the trip title — AI fills this on generation."
              onChange={(e) => patch({ headline: e.target.value || undefined })}
            />
          </label>
        </div>
      )}
    </section>
  )
}

// ── Day card ─────────────────────────────────────────────────────────────

function DayCard({
  day,
  index,
  editable,
  dayOptions,
  enhancing,
  recentIds,
  run,
  onApplyRun,
  onDismissRun,
  onChange,
  onOpenMap,
  onEnhance,
}: {
  day: TripDay
  index: number
  editable: boolean
  dayOptions: Array<{ id: string; label: string }>
  enhancing: boolean
  recentIds: Set<string>
  run: EnhancementRun | null
  onApplyRun: (ids: string[]) => void
  onDismissRun: () => void
  onChange: (fn: (days: TripDay[]) => TripDay[]) => void
  onOpenMap: () => void
  onEnhance: () => void
}) {
  const hasMappable = day.items.some((i) => i.location?.lat != null && i.location?.lng != null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const patchDay = (p: Partial<TripDay>) => onChange((days) => days.map((d) => (d.id === day.id ? { ...d, ...p } : d)))
  return (
    <section
      id={day.id}
      aria-label={`Day ${index + 1}`}
      aria-busy={enhancing}
      className={`scroll-mt-20 rounded-3xl border bg-white p-5 shadow-sm transition-colors duration-300 dark:bg-stone-900 ${
        enhancing
          ? "border-amber-400/70 dark:border-amber-600/60"
          : "border-stone-200/80 dark:border-stone-800"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Day {index + 1} · {formatDayDate(day.date)}
            {day.city ? ` · ${day.city}` : ""}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={day.emoji ?? ""}
              disabled={!editable}
              placeholder="✦"
              maxLength={4}
              aria-label={`Day ${index + 1} emoji`}
              onChange={(e) => patchDay({ emoji: e.target.value || undefined })}
              className="w-9 shrink-0 bg-transparent text-center text-xl focus:outline-none"
            />
            <input
              value={day.title ?? ""}
              disabled={!editable}
              placeholder="Day theme…"
              aria-label={`Day ${index + 1} title`}
              onChange={(e) => patchDay({ title: e.target.value })}
              className="mt-0.5 w-full bg-transparent text-lg font-semibold text-stone-900 placeholder:text-stone-300 focus:outline-none dark:text-stone-100 dark:placeholder:text-stone-600"
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {editable && (
            <button
              type="button"
              onClick={onEnhance}
              disabled={enhancing}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                enhancing
                  ? "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-300"
                  : "border-stone-300 text-stone-700 hover:border-amber-400 hover:text-amber-700 dark:border-stone-700 dark:text-stone-300 dark:hover:text-amber-400"
              }`}
            >
              {enhancing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
              )}
              {enhancing ? "Reviewing day…" : "Enhance day"}
            </button>
          )}
          <button
            type="button"
            onClick={onOpenMap}
            disabled={!hasMappable}
            title={hasMappable ? "Open Map Mode" : "No located places on this day yet"}
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:border-amber-400 hover:text-amber-700 disabled:opacity-40 dark:border-stone-700 dark:text-stone-300 dark:hover:text-amber-400"
          >
            <MapIcon className="h-3.5 w-3.5" aria-hidden />
            Map
          </button>
        </div>
      </div>

      <textarea
        value={day.notes ?? ""}
        disabled={!editable}
        placeholder={editable ? "Day theme prose — the editorial line under the title on the trip page…" : ""}
        aria-label={`Day ${index + 1} theme`}
        rows={day.notes ? Math.min(4, day.notes.split("\n").length) : 1}
        onChange={(e) => patchDay({ notes: e.target.value })}
        className="mt-2 w-full resize-none rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-stone-600 transition placeholder:text-stone-300 hover:border-stone-200 focus:border-amber-500 focus:outline-none dark:text-stone-400 dark:placeholder:text-stone-600 dark:hover:border-stone-700"
      />

      {/* Day details: display metadata for the dossier pages */}
      {editable && (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            aria-expanded={detailsOpen}
            className="rounded-md px-2 py-1 text-xs font-medium text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-300"
          >
            {detailsOpen ? "Hide day details" : "Day details (neighborhoods, callouts, weather)"}
          </button>
          {detailsOpen && (
            <div className="mt-2 space-y-3 rounded-xl border border-stone-100 p-3 dark:border-stone-800">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                  Neighborhoods (comma-separated)
                </span>
                <input
                  value={(day.neighborhoods ?? []).join(", ")}
                  placeholder="Samseong, COEX, Bongeunsa"
                  onChange={(e) =>
                    patchDay({
                      neighborhoods: e.target.value
                        .split(",")
                        .map((n) => n.trim())
                        .filter(Boolean),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
                />
              </label>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Callouts</span>
                <div className="mt-1 space-y-2">
                  {(day.callouts ?? []).map((c, ci) => (
                    <div key={ci} className="flex items-start gap-2">
                      <input
                        value={c.icon}
                        maxLength={4}
                        aria-label="Callout icon"
                        onChange={(e) =>
                          patchDay({ callouts: (day.callouts ?? []).map((x, xi) => (xi === ci ? { ...x, icon: e.target.value } : x)) })
                        }
                        className="w-10 shrink-0 rounded-lg border border-stone-200 bg-white px-1 py-1.5 text-center text-sm dark:border-stone-700 dark:bg-stone-900"
                      />
                      <select
                        value={c.tone}
                        aria-label="Callout tone"
                        onChange={(e) =>
                          patchDay({
                            callouts: (day.callouts ?? []).map((x, xi) =>
                              xi === ci ? { ...x, tone: e.target.value as typeof c.tone } : x,
                            ),
                          })
                        }
                        className="shrink-0 rounded-lg border border-stone-200 bg-white px-1.5 py-1.5 text-xs dark:border-stone-700 dark:bg-stone-900"
                      >
                        {(["info", "warn", "success", "alert"] as const).map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <input
                        value={c.body}
                        aria-label="Callout text"
                        placeholder="Heads-up text…"
                        onChange={(e) =>
                          patchDay({ callouts: (day.callouts ?? []).map((x, xi) => (xi === ci ? { ...x, body: e.target.value } : x)) })
                        }
                        className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
                      />
                      <IconButton label="Remove callout" destructive onClick={() => patchDay({ callouts: (day.callouts ?? []).filter((_, xi) => xi !== ci) })}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </IconButton>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => patchDay({ callouts: [...(day.callouts ?? []), { icon: "⚠️", tone: "warn", body: "" }] })}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800"
                  >
                    <Plus className="h-3 w-3" aria-hidden />
                    Add callout
                  </button>
                </div>
              </div>
              {day.weather && (
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Weather: {day.weather.highC}°C / {day.weather.lowC}°C · {day.weather.condition} — auto-synced from the live
                  forecast on each Enhance run.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Day-scoped enhancement review renders here, inside the day. */}
      <AnimatePresence>
        {run && (
          <SuggestionsPanel
            run={run}
            dayOptions={dayOptions}
            onApply={onApplyRun}
            onDismiss={onDismissRun}
          />
        )}
      </AnimatePresence>

      {day.items.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-stone-200 px-4 py-6 text-center text-sm text-stone-400 dark:border-stone-700 dark:text-stone-500">
          Nothing planned yet{editable ? " — add a place, note, or section below." : "."}
        </div>
      ) : (
        // Timeline rail: a vertical line with one marker per item, the
        // itinerary affordance that makes day order legible at a glance.
        <ul className="relative mt-4 space-y-2 pl-6 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-stone-200 dark:before:bg-stone-800">
          <AnimatePresence initial={false}>
            {day.items.map((item, itemIdx) => (
              <ItemRow
                key={item.id}
                item={item}
                dayId={day.id}
                isFirst={itemIdx === 0}
                isLast={itemIdx === day.items.length - 1}
                editable={editable}
                dayOptions={dayOptions}
                highlight={recentIds.has(item.id)}
                onChange={onChange}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

      {editable && (
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              { kind: "place", label: "Place" },
              { kind: "note", label: "Note" },
              { kind: "section", label: "Section" },
            ] as Array<{ kind: ItemKind; label: string }>
          ).map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              onClick={() =>
                onChange((days) => {
                  const item = makeItem(kind)
                  if (kind === "place") item.location = { name: "", source: "user" }
                  return addItem(days, day.id, item)
                })
              }
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Item row ─────────────────────────────────────────────────────────────

function ItemRow({
  item,
  dayId,
  isFirst,
  isLast,
  editable,
  dayOptions,
  highlight,
  onChange,
}: {
  item: ItineraryItem
  dayId: string
  isFirst: boolean
  isLast: boolean
  editable: boolean
  dayOptions: Array<{ id: string; label: string }>
  highlight: boolean
  onChange: (fn: (days: TripDay[]) => TripDay[]) => void
}) {
  const reduce = useReducedMotion()
  const [expanded, setExpanded] = useState(false)
  const Icon = KIND_ICON[item.kind]
  const patch = (p: Partial<Omit<ItineraryItem, "id">>) => onChange((days) => updateItem(days, dayId, item.id, p))
  const isSection = item.kind === "section"
  const hasLocation = item.location?.lat != null && item.location?.lng != null

  // Amber pulse on items just touched by applied AI suggestions. Reduced
  // motion gets a static ring (cleared with recentIds) instead of the pulse.
  const flashAnimate =
    highlight && !reduce
      ? { backgroundColor: ["rgba(245, 158, 11, 0.20)", "rgba(245, 158, 11, 0)"] }
      : {}

  return (
    <motion.li
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0, ...flashAnimate }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
      transition={{
        duration: 0.22,
        ease: [0.16, 1, 0.3, 1],
        backgroundColor: { duration: 2.6, ease: "easeOut" },
      }}
      className={`relative ${
        isSection
          ? "rounded-xl bg-stone-100/80 px-3 py-2 dark:bg-stone-800/60"
          : "rounded-xl border border-stone-200/80 bg-white px-3 py-2 transition-shadow hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700"
      } ${highlight ? "ring-2 ring-amber-400/70 dark:ring-amber-500/50" : ""}`}
    >
      {/* Timeline marker — filled when the stop is mapped, hollow otherwise. */}
      <span
        className={`absolute -left-[23px] top-1/2 h-[9px] w-[9px] -translate-y-1/2 rounded-full border-2 ${
          isSection
            ? "border-stone-300 bg-stone-300 dark:border-stone-600 dark:bg-stone-600"
            : hasLocation
              ? "border-amber-600 bg-amber-600 dark:border-amber-400 dark:bg-amber-400"
              : "border-stone-300 bg-white dark:border-stone-600 dark:bg-stone-900"
        }`}
        aria-hidden
      />
      <div className="flex items-center gap-2">
        <Icon
          className={`h-4 w-4 shrink-0 ${item.kind === "place" ? "text-amber-600 dark:text-amber-400" : "text-stone-400 dark:text-stone-500"}`}
          aria-hidden
        />
        {item.time && (
          <span className="shrink-0 rounded-md bg-stone-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-stone-600 dark:bg-stone-800 dark:text-stone-300">
            {item.time}
            {item.endTime ? `–${item.endTime}` : ""}
          </span>
        )}
        <input
          value={item.title}
          disabled={!editable}
          placeholder={item.kind === "section" ? "Section heading…" : "Title…"}
          aria-label="Item title"
          onChange={(e) => {
            patch({ title: e.target.value })
          }}
          className={`min-w-0 flex-1 ${inputClass} ${isSection ? "font-semibold uppercase tracking-wide text-xs" : ""} ${item.status === "completed" ? "line-through opacity-60" : ""}`}
        />
        {item.createdBy === "ai" && (
          <span className="hidden shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 sm:inline dark:bg-violet-950/60 dark:text-violet-300">
            AI
          </span>
        )}
        {item.status !== "none" && (
          <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline ${STATUS_CHIP[item.status]}`}>
            {STATUS_OPTIONS.find((s) => s.value === item.status)?.label}
          </span>
        )}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse item" : "Expand item"}
          className="shrink-0 rounded-md px-2 py-1 text-xs text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-300"
        >
          {expanded ? "Less" : "More"}
        </button>
      </div>

      {expanded && (
        <div className="mt-2 space-y-3 border-t border-stone-100 pt-3 dark:border-stone-800">
          {editable && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                Starts
                <input
                  type="time"
                  value={item.time ?? ""}
                  onChange={(e) => patch({ time: e.target.value || undefined })}
                  className="rounded-md border border-stone-200 bg-white px-2 py-1 text-xs tabular-nums focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
                />
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                Ends
                <input
                  type="time"
                  value={item.endTime ?? ""}
                  onChange={(e) => patch({ endTime: e.target.value || undefined })}
                  className="rounded-md border border-stone-200 bg-white px-2 py-1 text-xs tabular-nums focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
                />
              </label>
            </div>
          )}
          <textarea
            value={item.notes ?? ""}
            disabled={!editable}
            placeholder="Notes, links, reminders…"
            aria-label="Item notes"
            rows={3}
            onChange={(e) => patch({ notes: e.target.value || undefined })}
            className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
          />
          {(item.kind === "place" || item.kind === "reservation") && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                value={item.location?.name ?? ""}
                disabled={!editable}
                placeholder="Place name"
                aria-label="Location name"
                onChange={(e) =>
                  patch({ location: { ...(item.location ?? { source: "user" as const }), name: e.target.value } })
                }
                className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
              />
              <input
                value={item.location?.address ?? ""}
                disabled={!editable}
                placeholder="Address"
                aria-label="Location address"
                onChange={(e) =>
                  patch({
                    location: {
                      ...(item.location ?? { name: item.title, source: "user" as const }),
                      address: e.target.value || undefined,
                    },
                  })
                }
                className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
              />
              {item.location?.lat != null && item.location?.lng != null ? (
                <p className="col-span-full text-xs text-stone-400 dark:text-stone-500">
                  📍 {item.location.lat.toFixed(4)}, {item.location.lng.toFixed(4)}
                  {item.location.confidence ? ` · ${item.location.confidence} confidence` : ""} — appears in Map Mode
                </p>
              ) : (
                <p className="col-span-full text-xs text-amber-700 dark:text-amber-400">
                  No coordinates yet — run “Enhance day” or add them so this place appears in Map Mode.
                </p>
              )}
            </div>
          )}

          {editable && (
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={item.status}
                aria-label="Item status"
                onChange={(e) => patch({ status: e.target.value as ItemStatus })}
                className="rounded-md border border-stone-200 bg-white px-2 py-1 text-xs dark:border-stone-700 dark:bg-stone-900"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label === "—" ? "No status" : s.label}</option>
                ))}
              </select>
              <IconButton label="Move up" disabled={isFirst} onClick={() => onChange((days) => moveItem(days, dayId, item.id, -1))}>
                <ArrowUp className="h-3.5 w-3.5" aria-hidden />
              </IconButton>
              <IconButton label="Move down" disabled={isLast} onClick={() => onChange((days) => moveItem(days, dayId, item.id, 1))}>
                <ArrowDown className="h-3.5 w-3.5" aria-hidden />
              </IconButton>
              <IconButton label="Duplicate" onClick={() => onChange((days) => duplicateItem(days, dayId, item.id))}>
                <Copy className="h-3.5 w-3.5" aria-hidden />
              </IconButton>
              {item.kind === "note" && (
                <IconButton label="Convert to place" onClick={() => onChange((days) => convertNoteToPlace(days, dayId, item.id))}>
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                </IconButton>
              )}
              <label className="inline-flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400">
                <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden />
                <select
                  value={dayId}
                  aria-label="Move to day"
                  onChange={(e) => onChange((days) => moveItemToDay(days, dayId, item.id, e.target.value))}
                  className="rounded-md border border-stone-200 bg-white px-1.5 py-1 text-xs dark:border-stone-700 dark:bg-stone-900"
                >
                  {dayOptions.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
              </label>
              <span className="flex-1" />
              <IconButton label="Delete item" destructive onClick={() => onChange((days) => removeItem(days, dayId, item.id))}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </IconButton>
            </div>
          )}
        </div>
      )}
    </motion.li>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  destructive,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md p-1.5 transition disabled:opacity-30 ${
        destructive
          ? "text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
          : "text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-300"
      }`}
    >
      {children}
    </button>
  )
}

// ── Enhancement suggestions review ───────────────────────────────────────

const SUGGESTION_BADGE: Record<string, string> = {
  add: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  edit: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
  remove: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  reorder: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  info: "bg-stone-200/70 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
}

function SuggestionsPanel({
  run,
  dayOptions,
  onApply,
  onDismiss,
}: {
  run: EnhancementRun
  dayOptions: Array<{ id: string; label: string }>
  onApply: (ids: string[]) => void
  onDismiss: () => void
}) {
  const actionable = useMemo(
    () => run.suggestions.filter((s) => s.kind === "add" || s.kind === "edit" || s.kind === "remove" || s.kind === "reorder"),
    [run],
  )
  const [selected, setSelected] = useState<Set<string>>(() => new Set(actionable.map((s) => s.id)))
  const dayLabel = (id?: string) => dayOptions.find((d) => d.id === id)?.label ?? id

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      aria-label="AI enhancement suggestions"
      className="mt-5 rounded-2xl border border-amber-200/80 bg-amber-50/50 p-5 motion-reduce:transition-none dark:border-amber-900/40 dark:bg-amber-950/15"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900 dark:text-stone-100">
            <Sparkles className="h-4 w-4 text-amber-600" aria-hidden />
            Enhancement review {run.scope === "day" ? `· ${dayLabel(run.dayId)}` : "· whole trip"}
          </h2>
          {run.summary && <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{run.summary}</p>}
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss suggestions" className="rounded-full p-1.5 text-stone-400 hover:bg-stone-200/60 dark:hover:bg-stone-800/60">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {run.suggestions.length === 0 ? (
        <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">No suggestions — this plan already looks solid.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {run.suggestions.map((s) => {
            const isActionable = actionable.some((a) => a.id === s.id)
            return (
              <li key={s.id} className="rounded-xl border border-stone-200/80 bg-white p-3 dark:border-stone-800 dark:bg-stone-900">
                <label className="flex items-start gap-3">
                  {isActionable ? (
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={(e) =>
                        setSelected((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(s.id)
                          else next.delete(s.id)
                          return next
                        })
                      }
                      className="mt-1 h-4 w-4 accent-amber-700"
                      aria-label={`Accept: ${s.title}`}
                    />
                  ) : (
                    <span className="mt-1 h-4 w-4 shrink-0" aria-hidden />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${SUGGESTION_BADGE[s.kind] ?? SUGGESTION_BADGE.info}`}>
                        {s.kind}
                      </span>
                      <span className="text-sm font-medium text-stone-900 dark:text-stone-100">{s.title}</span>
                      {s.dayId && <span className="text-xs text-stone-400">{dayLabel(s.dayId)}</span>}
                      <span className="text-[10px] uppercase text-stone-400">{s.confidence} confidence</span>
                    </div>
                    {s.detail && <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{s.detail}</p>}
                    {s.proposedItem && (
                      <p className="mt-1 text-xs text-stone-500 dark:text-stone-500">
                        Adds: {s.proposedItem.title}
                        {s.proposedItem.location?.name ? ` @ ${s.proposedItem.location.name}` : ""}
                      </p>
                    )}
                  </div>
                </label>
              </li>
            )
          })}
        </ul>
      )}

      {actionable.length > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() => onApply([...selected])}
            className="inline-flex items-center gap-2 rounded-full bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:opacity-50 dark:bg-amber-600 dark:hover:bg-amber-500"
          >
            <Check className="h-4 w-4" aria-hidden />
            Apply {selected.size} selected
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full px-3 py-2 text-sm text-stone-600 hover:bg-stone-200/60 dark:text-stone-400 dark:hover:bg-stone-800/60"
          >
            Dismiss all
          </button>
        </div>
      )}
    </motion.section>
  )
}
