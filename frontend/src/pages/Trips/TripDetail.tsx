import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion } from "motion/react"
import { useLocation, useParams } from "react-router-dom"
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Bookmark,
  Check,
  Copy,
  FileText,
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
import { applySuggestions, enhanceTrip, getTrip, updateTrip } from "./tripsApi"
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
  const [notice, setNotice] = useState<string | null>(
    (routerLocation.state as { notice?: string } | null)?.notice ?? null,
  )
  const [mapDayId, setMapDayId] = useState<string | null>(null)
  const [enhancing, setEnhancing] = useState<"day" | "trip" | null>(null)
  const [activeRun, setActiveRun] = useState<EnhancementRun | null>(null)
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
    if (!trip || enhancing) return
    setEnhancing(scope)
    setActiveRun(null)
    try {
      const run = await enhanceTrip(getToken, trip.id, scope, dayId)
      setActiveRun(run)
    } catch (err) {
      setNotice(`Enhancement failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setEnhancing(null)
    }
  }

  const applyRun = async (suggestionIds: string[]) => {
    if (!trip || !activeRun) return
    try {
      const { trip: next, applied } = await applySuggestions(getToken, trip.id, activeRun.id, suggestionIds)
      setTrip(next)
      setActiveRun(null)
      setSaveState("saved")
      setNotice(`Applied ${applied.length} suggestion${applied.length === 1 ? "" : "s"}.`)
    } catch (err) {
      setNotice(`Could not apply suggestions: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

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
        <div className="flex items-center gap-2">
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
          {editable && (
            <button
              type="button"
              onClick={() => void runEnhance("trip")}
              disabled={enhancing !== null}
              className="inline-flex items-center gap-2 rounded-full bg-amber-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-800 disabled:opacity-50 dark:bg-amber-600 dark:hover:bg-amber-500"
            >
              {enhancing === "trip" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
              Enhance trip
            </button>
          )}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors ${
              saveState === "error"
                ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                : "text-stone-400 dark:text-stone-500"
            }`}
            role="status"
            aria-live="polite"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                saveState === "saved"
                  ? "bg-emerald-500"
                  : saveState === "error"
                    ? "bg-red-500"
                    : "animate-pulse bg-amber-500 motion-reduce:animate-none"
              }`}
              aria-hidden
            />
            {saveState === "saved" && "Saved"}
            {saveState === "dirty" && "Editing…"}
            {saveState === "saving" && "Saving…"}
            {saveState === "error" && "Save failed — retries on next edit"}
          </span>
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

      {/* Enhancement review sheet */}
      {activeRun && (
        <SuggestionsPanel
          run={activeRun}
          dayOptions={dayOptions}
          onApply={(ids) => void applyRun(ids)}
          onDismiss={() => setActiveRun(null)}
        />
      )}

      {/* Days */}
      <div className="mt-8 space-y-8">
        {trip.days.map((day, idx) => (
          <DayCard
            key={day.id}
            day={day}
            index={idx}
            editable={editable}
            dayOptions={dayOptions}
            enhancing={enhancing === "day"}
            onChange={setDays}
            onOpenMap={() => setMapDayId(day.id)}
            onEnhance={() => void runEnhance("day", day.id)}
          />
        ))}
      </div>

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

// ── Day card ─────────────────────────────────────────────────────────────

function DayCard({
  day,
  index,
  editable,
  dayOptions,
  enhancing,
  onChange,
  onOpenMap,
  onEnhance,
}: {
  day: TripDay
  index: number
  editable: boolean
  dayOptions: Array<{ id: string; label: string }>
  enhancing: boolean
  onChange: (fn: (days: TripDay[]) => TripDay[]) => void
  onOpenMap: () => void
  onEnhance: () => void
}) {
  const hasMappable = day.items.some((i) => i.location?.lat != null && i.location?.lng != null)
  return (
    <section aria-label={`Day ${index + 1}`} className="rounded-3xl border border-stone-200/80 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Day {index + 1} · {formatDayDate(day.date)}
            {day.city ? ` · ${day.city}` : ""}
          </div>
          <input
            value={day.title ?? ""}
            disabled={!editable}
            placeholder="Day theme…"
            aria-label={`Day ${index + 1} title`}
            onChange={(e) => onChange((days) => days.map((d) => (d.id === day.id ? { ...d, title: e.target.value } : d)))}
            className="mt-0.5 w-full bg-transparent text-lg font-semibold text-stone-900 placeholder:text-stone-300 focus:outline-none dark:text-stone-100 dark:placeholder:text-stone-600"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {editable && (
            <button
              type="button"
              onClick={onEnhance}
              disabled={enhancing}
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:border-amber-400 hover:text-amber-700 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:text-amber-400"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Enhance day
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
        placeholder={editable ? "Day notes — freeform planning space…" : ""}
        aria-label={`Day ${index + 1} notes`}
        rows={day.notes ? Math.min(4, day.notes.split("\n").length) : 1}
        onChange={(e) => onChange((days) => days.map((d) => (d.id === day.id ? { ...d, notes: e.target.value } : d)))}
        className="mt-2 w-full resize-none rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-stone-600 transition placeholder:text-stone-300 hover:border-stone-200 focus:border-amber-500 focus:outline-none dark:text-stone-400 dark:placeholder:text-stone-600 dark:hover:border-stone-700"
      />

      {day.items.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-stone-200 px-4 py-6 text-center text-sm text-stone-400 dark:border-stone-700 dark:text-stone-500">
          Nothing planned yet{editable ? " — add a place, note, or section below." : "."}
        </div>
      ) : (
        // Timeline rail: a vertical line with one marker per item, the
        // itinerary affordance that makes day order legible at a glance.
        <ul className="relative mt-4 space-y-2 pl-6 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-stone-200 dark:before:bg-stone-800">
          {day.items.map((item, itemIdx) => (
            <ItemRow
              key={item.id}
              item={item}
              dayId={day.id}
              isFirst={itemIdx === 0}
              isLast={itemIdx === day.items.length - 1}
              editable={editable}
              dayOptions={dayOptions}
              onChange={onChange}
            />
          ))}
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
  onChange,
}: {
  item: ItineraryItem
  dayId: string
  isFirst: boolean
  isLast: boolean
  editable: boolean
  dayOptions: Array<{ id: string; label: string }>
  onChange: (fn: (days: TripDay[]) => TripDay[]) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const Icon = KIND_ICON[item.kind]
  const patch = (p: Partial<Omit<ItineraryItem, "id">>) => onChange((days) => updateItem(days, dayId, item.id, p))
  const isSection = item.kind === "section"
  const hasLocation = item.location?.lat != null && item.location?.lng != null

  return (
    <li
      className={`relative ${
        isSection
          ? "rounded-xl bg-stone-100/80 px-3 py-2 dark:bg-stone-800/60"
          : "rounded-xl border border-stone-200/80 bg-white px-3 py-2 transition-colors hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700"
      }`}
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
    </li>
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
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      aria-label="AI enhancement suggestions"
      className="mt-6 rounded-3xl border border-amber-200/80 bg-amber-50/50 p-5 motion-reduce:transition-none dark:border-amber-900/40 dark:bg-amber-950/15"
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
