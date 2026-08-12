import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Link, useLocation, useParams } from "react-router-dom"
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Eye,
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
import {
  ACCENT,
  ACCENT_SWATCH,
  TRIP_ACCENTS,
  formatTripDate,
  itemIcon,
  resolveAccent,
} from "./theme"
import { AiChip, StatusChip, SuggestionChip } from "./components/StatusChip"
import {
  SERIF,
  accentChipBtnClass,
  alertErrorClass,
  alertNoticeClass,
  chipBtnClass,
  compactInputClass,
  compactSelectClass,
  checkboxClass,
  dangerIconBtnClass,
  focusRingClass,
  focusRingInsetClass,
  ghostBtnClass,
  iconBtnClass,
  inputClass,
  labelClass,
  primaryBtnClass,
  quietBtnClass,
  secondaryBtnClass,
  selectClass,
  softPanelClass,
  subtleInputClass,
  successBtnClass,
} from "./ui"
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

const STATUS_OPTIONS: Array<{ value: ItemStatus; label: string }> = [
  { value: "none", label: "No status" },
  { value: "optional", label: "Optional" },
  { value: "booked", label: "Booked" },
  { value: "completed", label: "Completed" },
  { value: "needs_review", label: "Needs review" },
]

/** Page gutters — `<main>` is unconstrained so trip heroes can be full-bleed. */
const pageClass = "mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-10"

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
  // Item ids touched by the last applied suggestions — drives the accent
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

  // Latest pending document for flush-on-leave.
  const pendingPatchRef = useRef<Trip | null>(null)

  const persistTrip = useCallback(
    async (next: Trip) => {
      setSaveState("saving")
      try {
        await updateTrip(getToken, next.id, {
          name: next.name,
          status: next.status,
          slug: next.slug,
          appearance: next.appearance,
          destinations: next.destinations,
          startDate: next.startDate,
          endDate: next.endDate,
          timezone: next.timezone,
          tags: next.tags,
          description: next.description ?? null,
          days: next.days,
        })
        // Ignore stale responses if a newer edit is already queued.
        if (pendingPatchRef.current && pendingPatchRef.current !== next) return
        pendingPatchRef.current = null
        setSaveState("saved")
      } catch (err: unknown) {
        setSaveState("error")
        const message = err instanceof Error ? err.message : String(err)
        if (/permalink|slug|hyphen/i.test(message)) setNotice(message)
      }
    },
    [getToken],
  )

  // Debounced document save: any edit marks the trip dirty; 900ms after the
  // last keystroke metadata + days are PATCHed (including appearance).
  const scheduleSave = useCallback(
    (next: Trip) => {
      setTrip(next)
      pendingPatchRef.current = next
      setSaveState("dirty")
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        void persistTrip(next)
      }, 900)
    },
    [persistTrip],
  )

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!pendingPatchRef.current) return
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      const pending = pendingPatchRef.current
      if (pending) {
        pendingPatchRef.current = null
        void updateTrip(getToken, pending.id, {
          name: pending.name,
          status: pending.status,
          slug: pending.slug,
          appearance: pending.appearance,
          destinations: pending.destinations,
          startDate: pending.startDate,
          endDate: pending.endDate,
          timezone: pending.timezone,
          tags: pending.tags,
          description: pending.description ?? null,
          days: pending.days,
        }).catch(() => {
          /* best-effort flush on leave */
        })
      }
    }
  }, [getToken])

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
    () =>
      trip
        ? trip.days.map((d, i) => ({ id: d.id, label: `Day ${i + 1} · ${formatTripDate(d.date, trip.timezone)}` }))
        : [],
    [trip],
  )

  const runEnhance = async (scope: "day" | "trip", dayId?: string, prompt?: string) => {
    if (!trip || enhancingTarget) return
    setEnhancingTarget(scope === "day" ? (dayId ?? null) : "trip")
    setActiveRun(null)
    try {
      const { run, trip: refreshed } = await enhanceTrip(getToken, trip.id, scope, dayId, prompt)
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

  useEffect(() => {
    if (state.status !== "success" || !trip) return
    const hash = routerLocation.hash.replace(/^#/, "")
    if (!hash) return
    // Wait a frame so day sections exist in the DOM after async load.
    const id = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 80)
    return () => window.clearTimeout(id)
  }, [state.status, trip, routerLocation.hash])

  if (state.status === "loading") {
    return (
      <div className={`${pageClass} space-y-4`} role="status" aria-label="Loading trip">
        <div className="h-12 w-2/3 animate-pulse rounded-xl bg-stone-200/60 dark:bg-stone-900" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl bg-stone-200/60 dark:bg-stone-900" />
        ))}
      </div>
    )
  }

  if (state.status === "error" || !trip) {
    return (
      <div className={pageClass}>
        <div className={alertErrorClass} role="alert">
          Couldn’t load this trip{state.status === "error" ? ` (${state.message})` : ""}.
        </div>
      </div>
    )
  }

  const mapDay = mapDayId ? trip.days.find((d) => d.id === mapDayId) : null
  const mapDayIndex = mapDay ? trip.days.findIndex((d) => d.id === mapDay.id) : -1

  return (
    <div className={pageClass} data-trip-accent={resolveAccent(trip.appearance?.accent)}>
      {/* Trip header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200/80 pb-6 dark:border-stone-800/80">
        <div className="min-w-0 flex-1">
          <p className="font-mono-trips text-[11px] uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
            Itinerary editor
          </p>
          <label className="sr-only" htmlFor="trip-editor-name">
            Trip name
          </label>
          <input
            id="trip-editor-name"
            value={trip.name}
            disabled={!editable}
            onChange={(e) => scheduleSave({ ...trip, name: e.target.value })}
            className={`mt-1 w-full bg-transparent font-display text-[clamp(1.75rem,4vw,2.5rem)] font-medium leading-tight tracking-tight text-stone-900 focus:outline-none dark:text-stone-100 ${focusRingClass}`}
            style={SERIF}
          />
          <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
            {trip.destinations.join(" · ")} · {formatTripDate(trip.startDate, trip.timezone)} →{" "}
            {formatTripDate(trip.endDate, trip.timezone)} · {trip.timezone}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/trips/${trip.slug ?? trip.id}`} className={secondaryBtnClass}>
            <Eye className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            View
          </Link>
          <select
            value={trip.status}
            disabled={!editable}
            onChange={(e) => scheduleSave({ ...trip, status: e.target.value as TripStatus })}
            aria-label="Trip status"
            className={`capitalize ${selectClass}`}
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
              className={successBtnClass}
            >
              <Globe2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Publish
            </button>
          )}
          {editable && (
            <EnhanceButton
              label="Enhance trip"
              busyLabel="Reviewing trip…"
              busy={enhancingTarget === "trip"}
              disabled={enhancingTarget !== null}
              variant="solid"
              promptPlaceholder="Optional focus — e.g. “tighten the pacing and add more local food”"
              onRun={(prompt) => void runEnhance("trip", undefined, prompt)}
            />
          )}
        </div>
      </div>

      {notice && (
        <div className={`mt-4 flex items-start justify-between gap-3 ${alertNoticeClass}`} role="status">
          <span className="min-w-0 break-words">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice" className={`-my-2 shrink-0 ${iconBtnClass}`}>
            <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      )}

      {/* Appearance — accent, dossier copy, permalink for the trip's pages */}
      {editable && (
        <AppearancePanel
          trip={trip}
          onChange={(appearance) => scheduleSave({ ...trip, appearance })}
          onSlugChange={(slug) => scheduleSave({ ...trip, slug })}
        />
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
                  className={`block rounded-lg px-2 py-1 text-[13px] text-stone-600 transition hover:bg-stone-200/60 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100 ${focusRingClass}`}
                >
                  <span className="font-medium">Day {idx + 1}</span>
                  <span className="ml-1.5 text-stone-600 dark:text-stone-400">
                    {formatTripDate(day.date, trip.timezone, { weekday: undefined })}
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
              timezone={trip.timezone}
              editable={editable}
              dayOptions={dayOptions}
              enhancing={enhancingTarget === day.id}
              recentIds={recentIds}
              run={activeRun && activeRun.scope === "day" && activeRun.dayId === day.id ? activeRun : null}
              onApplyRun={(ids) => void applyRun(ids)}
              onDismissRun={() => setActiveRun(null)}
              onChange={setDays}
              onOpenMap={() => setMapDayId(day.id)}
              onEnhance={(prompt) => void runEnhance("day", day.id, prompt)}
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
      className={`mt-6 p-5 motion-reduce:transition-none ${softPanelClass}`}
    >
      <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900 dark:text-stone-100">
        <Sparkles className={`h-4 w-4 ${ACCENT.text}`} strokeWidth={1.5} aria-hidden />
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
        className={`mt-3 ${inputClass}`}
      />
      {error && (
        <p className={`mt-3 ${alertErrorClass}`} role="alert">
          Generation failed: {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void generate()} disabled={busy} className={primaryBtnClass}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <Sparkles className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          )}
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
                <Loader2
                  className={`h-3.5 w-3.5 animate-spin motion-reduce:animate-none ${ACCENT.text}`}
                  aria-hidden
                />
                {saveState === "saving" ? "Saving…" : "Unsaved changes…"}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Enhance split-button (optional focus prompt) ─────────────────────────

function EnhanceButton({
  label,
  busyLabel,
  busy,
  disabled,
  variant,
  promptPlaceholder,
  onRun,
}: {
  label: string
  busyLabel: string
  busy: boolean
  disabled: boolean
  variant: "solid" | "outline"
  promptPlaceholder: string
  onRun: (prompt?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState("")
  const promptId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("touchstart", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("touchstart", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const run = (withPrompt: boolean) => {
    setOpen(false)
    onRun(withPrompt && prompt.trim() ? prompt.trim() : undefined)
  }

  const solid = variant === "solid"
  const base = solid ? primaryBtnClass : busy ? accentChipBtnClass : chipBtnClass
  const iconSize = solid ? "h-4 w-4" : "h-3.5 w-3.5"

  return (
    <div ref={rootRef} className="trip-split relative inline-flex">
      <button type="button" onClick={() => run(false)} disabled={disabled} className={base}>
        {busy ? (
          <Loader2 className={`${iconSize} animate-spin motion-reduce:animate-none`} aria-hidden />
        ) : (
          <Sparkles className={iconSize} strokeWidth={1.5} aria-hidden />
        )}
        {busy ? busyLabel : label}
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${label} with a custom focus`}
        className={base}
      >
        <ChevronDown className={`${iconSize} transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label={`${label} focus`}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className={`absolute right-0 top-[calc(100%+0.5rem)] z-40 w-[20rem] p-3 shadow-xl shadow-stone-950/10 dark:shadow-black/40 ${softPanelClass}`}
          >
            <label className={labelClass} htmlFor={promptId}>
              Focus for this review
            </label>
            <textarea
              id={promptId}
              value={prompt}
              rows={3}
              autoFocus
              placeholder={promptPlaceholder}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(true)
              }}
              className={`mt-1.5 ${inputClass}`}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-stone-500 dark:text-stone-400">⌘↵ to run</span>
              <button type="button" onClick={() => run(true)} className={primaryBtnClass}>
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                {label}
              </button>
            </div>
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

function AppearancePanel({
  trip,
  onChange,
  onSlugChange,
}: {
  trip: Trip
  onChange: (appearance: NonNullable<Trip["appearance"]>) => void
  onSlugChange: (slug: string) => void
}) {
  const [open, setOpen] = useState(false)
  const appearance = trip.appearance ?? {}
  const patch = (p: Partial<NonNullable<Trip["appearance"]>>) => onChange({ ...appearance, ...p })

  return (
    <section className={`mt-6 ${softPanelClass}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl px-5 py-3.5 text-left ${focusRingInsetClass}`}
      >
        <span className="flex items-center gap-2.5 text-sm font-semibold text-stone-900 dark:text-stone-100">
          <span className={`h-3.5 w-3.5 rounded-full ${ACCENT_SWATCH[resolveAccent(appearance.accent)]}`} aria-hidden />
          Appearance
          <span className="hidden font-normal text-stone-500 sm:inline dark:text-stone-400">
            accent & dossier copy
          </span>
        </span>
        <span className="text-xs text-stone-500 dark:text-stone-400">{open ? "Hide" : "Configure"}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-stone-100 px-5 py-4 dark:border-stone-800">
          <div>
            <span className={labelClass}>Accent</span>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Accent color">
              {TRIP_ACCENTS.map((name) => {
                const selected = resolveAccent(appearance.accent) === name
                return (
                  <button
                    key={name}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={name}
                    title={name}
                    onClick={() => patch({ accent: name })}
                    className={`flex h-11 w-11 items-center justify-center rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 dark:focus-visible:ring-stone-100 ${
                      selected ? "bg-stone-900/5 dark:bg-stone-100/10" : "hover:bg-stone-900/5 dark:hover:bg-stone-100/10"
                    }`}
                  >
                    <span
                      className={`h-8 w-8 rounded-full ${ACCENT_SWATCH[name]} ${
                        selected
                          ? "ring-2 ring-stone-900 ring-offset-2 ring-offset-[var(--trips-surface)] dark:ring-stone-100"
                          : "opacity-60"
                      }`}
                      aria-hidden
                    />
                  </button>
                )
              })}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Eyebrow</span>
              <input className={`mt-1.5 ${inputClass}`} value={appearance.eyebrow ?? ""} placeholder="The dossier" onChange={(e) => patch({ eyebrow: e.target.value || undefined })} />
            </label>
            <label className="block">
              <span className={labelClass}>Subtitle</span>
              <input className={`mt-1.5 ${inputClass}`} value={appearance.subtitle ?? ""} placeholder="a Seoul & Busan dossier" onChange={(e) => patch({ subtitle: e.target.value || undefined })} />
            </label>
          </div>
          <label className="block">
            <span className={labelClass}>Headline</span>
            <textarea
              rows={2}
              className={`mt-1.5 ${inputClass}`}
              value={appearance.headline ?? ""}
              placeholder="Editorial paragraph under the trip title."
              onChange={(e) => patch({ headline: e.target.value || undefined })}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Permalink</span>
            <span className="mt-1.5 flex items-center gap-0 overflow-hidden rounded-xl border border-stone-300/90 bg-[var(--trips-surface)] focus-within:border-[color:var(--trips-accent)] focus-within:ring-2 focus-within:ring-[color:var(--trips-focus)] dark:border-stone-700 dark:bg-stone-900">
              <span className="shrink-0 select-none border-r border-stone-300/90 bg-stone-100 px-2.5 py-2.5 text-sm text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400">
                /trips/
              </span>
              <input
                value={trip.slug ?? ""}
                placeholder="my-trip-2026"
                aria-label="Trip permalink"
                onChange={(e) =>
                  onSlugChange(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]+/g, "-")
                      .replace(/-{2,}/g, "-")
                      .slice(0, 80),
                  )
                }
                className="min-h-11 w-full bg-transparent px-2.5 py-2 text-sm focus:outline-none"
              />
            </span>
            <span className="mt-1.5 block text-xs text-stone-500 dark:text-stone-400">
              Lowercase letters, numbers, hyphens. Must be unique.
            </span>
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
  timezone,
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
  timezone: string
  editable: boolean
  dayOptions: Array<{ id: string; label: string }>
  enhancing: boolean
  recentIds: Set<string>
  run: EnhancementRun | null
  onApplyRun: (ids: string[]) => void
  onDismissRun: () => void
  onChange: (fn: (days: TripDay[]) => TripDay[]) => void
  onOpenMap: () => void
  onEnhance: (prompt?: string) => void
}) {
  const hasMappable = day.items.some((i) => i.location?.lat != null && i.location?.lng != null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const patchDay = (p: Partial<TripDay>) => onChange((days) => days.map((d) => (d.id === day.id ? { ...d, ...p } : d)))
  return (
    <section
      id={day.id}
      aria-label={`Day ${index + 1}`}
      aria-busy={enhancing}
      className={`scroll-mt-24 rounded-2xl border bg-[var(--trips-surface)] p-5 transition-colors duration-300 dark:bg-stone-900/50 ${
        enhancing ? ACCENT.border : "border-stone-200/80 dark:border-stone-800"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-xs font-semibold uppercase tracking-wide ${ACCENT.text}`}>
            Day {index + 1} · {formatTripDate(day.date, timezone)}
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
              className={`w-11 shrink-0 text-center text-xl ${subtleInputClass}`}
            />
            <input
              value={day.title ?? ""}
              disabled={!editable}
              placeholder="Day theme…"
              title={day.title ?? undefined}
              aria-label={`Day ${index + 1} title`}
              onChange={(e) => patchDay({ title: e.target.value })}
              className={`w-full text-lg font-semibold ${subtleInputClass}`}
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {editable && (
            <EnhanceButton
              label="Enhance day"
              busyLabel="Reviewing day…"
              busy={enhancing}
              disabled={enhancing}
              variant="outline"
              promptPlaceholder="Optional focus — e.g. “swap the museum for something outdoors”"
              onRun={onEnhance}
            />
          )}
          <button
            type="button"
            onClick={onOpenMap}
            disabled={!hasMappable}
            title={hasMappable ? "Open Map Mode" : "No located places on this day yet"}
            className={chipBtnClass}
          >
            <MapIcon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
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
        className={`mt-2 w-full resize-none ${subtleInputClass}`}
      />

      {/* Day details: display metadata for the dossier pages */}
      {editable && (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            aria-expanded={detailsOpen}
            className={quietBtnClass}
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${detailsOpen ? "rotate-180" : ""}`} aria-hidden />
            {detailsOpen ? "Hide details" : "Details"}
          </button>
          {detailsOpen && (
            <div className="mt-2 space-y-3 rounded-xl border border-stone-200/80 p-3 dark:border-stone-800">
              <label className="block">
                <span className={labelClass}>Neighborhoods (comma-separated)</span>
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
                  className={`mt-1 w-full ${compactInputClass}`}
                />
              </label>
              <div>
                <span className={labelClass}>Callouts</span>
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
                        className={`w-11 shrink-0 px-1 text-center ${compactInputClass}`}
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
                        className={`shrink-0 ${compactSelectClass}`}
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
                        className={`min-w-0 flex-1 ${compactInputClass}`}
                      />
                      <IconButton label="Remove callout" destructive onClick={() => patchDay({ callouts: (day.callouts ?? []).filter((_, xi) => xi !== ci) })}>
                        <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                      </IconButton>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => patchDay({ callouts: [...(day.callouts ?? []), { icon: "⚠️", tone: "warn", body: "" }] })}
                    className={quietBtnClass}
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
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
        <div className="mt-3 rounded-xl border border-dashed border-stone-200 px-4 py-6 text-center text-sm text-stone-600 dark:border-stone-700 dark:text-stone-400">
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
              className={quietBtnClass}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
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
  const isSection = item.kind === "section"
  const Icon = isSection ? Heading2 : itemIcon(item.kind, item.location?.category, item.reservation?.type)
  const patch = (p: Partial<Omit<ItineraryItem, "id">>) => onChange((days) => updateItem(days, dayId, item.id, p))
  const hasLocation = item.location?.lat != null && item.location?.lng != null

  return (
    <motion.li
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className={`relative ${
        isSection
          ? "rounded-xl bg-stone-100/80 px-3 py-2 dark:bg-stone-800/60"
          : "rounded-xl border border-stone-200/80 bg-white px-3 py-2 transition-shadow hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700"
      } ${highlight ? `trip-flash ring-2 ${ACCENT.ring}` : ""}`}
    >
      {/* Timeline marker — filled when the stop is mapped, hollow otherwise. */}
      <span
        className={`absolute -left-[23px] top-1/2 h-[9px] w-[9px] -translate-y-1/2 rounded-full border-2 ${
          isSection
            ? "border-stone-300 bg-stone-300 dark:border-stone-600 dark:bg-stone-600"
            : hasLocation
              ? `${ACCENT.border} ${ACCENT.dot}`
              : "border-stone-300 bg-white dark:border-stone-600 dark:bg-stone-900"
        }`}
        aria-hidden
      />
      <div className="flex items-center gap-2">
        <Icon
          className={`h-4 w-4 shrink-0 ${item.kind === "place" || item.kind === "reservation" ? ACCENT.text : "text-stone-500 dark:text-stone-400"}`}
          strokeWidth={1.5}
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
          className={`min-w-0 flex-1 ${compactInputClass} ${isSection ? "text-xs font-semibold uppercase tracking-wide" : ""} ${item.status === "completed" ? "line-through opacity-60" : ""}`}
        />
        {item.createdBy === "ai" && <AiChip className="hidden sm:inline-flex" />}
        <StatusChip status={item.status} className="hidden sm:inline-flex" />
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse item" : "Expand item"}
          className={`${quietBtnClass} shrink-0`}
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
                  className={`tabular-nums ${compactInputClass}`}
                />
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                Ends
                <input
                  type="time"
                  value={item.endTime ?? ""}
                  onChange={(e) => patch({ endTime: e.target.value || undefined })}
                  className={`tabular-nums ${compactInputClass}`}
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
            className={`w-full resize-none ${compactInputClass}`}
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
                className={`w-full ${compactInputClass}`}
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
                className={`w-full ${compactInputClass}`}
              />
              {item.location?.lat != null && item.location?.lng != null ? (
                <p className="col-span-full inline-flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
                  <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                  {item.location.lat.toFixed(4)}, {item.location.lng.toFixed(4)}
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
                className={compactSelectClass}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <IconButton label="Move up" disabled={isFirst} onClick={() => onChange((days) => moveItem(days, dayId, item.id, -1))}>
                <ArrowUp className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              </IconButton>
              <IconButton label="Move down" disabled={isLast} onClick={() => onChange((days) => moveItem(days, dayId, item.id, 1))}>
                <ArrowDown className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              </IconButton>
              <IconButton label="Duplicate" onClick={() => onChange((days) => duplicateItem(days, dayId, item.id))}>
                <Copy className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              </IconButton>
              {item.kind === "note" && (
                <IconButton label="Convert to place" onClick={() => onChange((days) => convertNoteToPlace(days, dayId, item.id))}>
                  <MapPin className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                </IconButton>
              )}
              <label className="inline-flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400">
                <ArrowRightLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                <select
                  value={dayId}
                  aria-label="Move to day"
                  onChange={(e) => onChange((days) => moveItemToDay(days, dayId, item.id, e.target.value))}
                  className={compactSelectClass}
                >
                  {dayOptions.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
              </label>
              <span className="flex-1" />
              <IconButton label="Delete item" destructive onClick={() => onChange((days) => removeItem(days, dayId, item.id))}>
                <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
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
      className={destructive ? dangerIconBtnClass : iconBtnClass}
    >
      {children}
    </button>
  )
}

// ── Enhancement suggestions review ───────────────────────────────────────

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
      className={`mt-5 p-5 motion-reduce:transition-none ${softPanelClass} ${ACCENT.border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900 dark:text-stone-100">
            <Sparkles className={`h-4 w-4 ${ACCENT.text}`} strokeWidth={1.5} aria-hidden />
            Enhancement review {run.scope === "day" ? `· ${dayLabel(run.dayId)}` : "· whole trip"}
          </h2>
          {run.summary && <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{run.summary}</p>}
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss suggestions" className={iconBtnClass}>
          <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
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
                      className={`mt-1 ${checkboxClass}`}
                      aria-label={`Accept: ${s.title}`}
                    />
                  ) : (
                    <span className="mt-1 h-4 w-4 shrink-0" aria-hidden />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <SuggestionChip kind={s.kind} />
                      <span className="text-sm font-medium text-stone-900 dark:text-stone-100">{s.title}</span>
                      {s.dayId && <span className="text-xs text-stone-500 dark:text-stone-400">{dayLabel(s.dayId)}</span>}
                      <span className="text-[10px] uppercase text-stone-500 dark:text-stone-400">{s.confidence} confidence</span>
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
            className={primaryBtnClass}
          >
            <Check className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Apply {selected.size} selected
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className={ghostBtnClass}
          >
            Dismiss all
          </button>
        </div>
      )}
    </motion.section>
  )
}
