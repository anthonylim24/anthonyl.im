import { memo, useCallback, useState } from "react"
import { AnimatePresence } from "motion/react"
import { ChevronDown, Map as MapIcon, Plus, Trash2 } from "lucide-react"
import { FilterTable } from "../beautiful"
import { ACCENT, formatTripDate } from "../theme"
import { addItem, makeItem } from "../tripEdits"
import {
  chipBtnClass,
  compactInputClass,
  compactSelectClass,
  labelClass,
  mutedInkClass,
  quietBtnClass,
  secondaryBtnClass,
  staticValueClass,
  subtleInputClass,
  wrapAnywhereClass,
} from "../ui"
import type { EnhancementRun, ItemKind, ItineraryItem, Trip, TripDay } from "../types"
import { EnhanceButton } from "./EnhanceButton"
import { IconButton } from "./IconButton"
import { ItemRow } from "./ItemRow"
import { SuggestionsPanel } from "./SuggestionsPanel"
import { TripIngest } from "../TripIngest"
import type { DayOption } from "./editorUi"

const ADD_KINDS: Array<{ kind: ItemKind; label: string }> = [
  { kind: "place", label: "Place" },
  { kind: "note", label: "Note" },
  { kind: "section", label: "Section" },
]

interface DayCardProps {
  trip: Trip
  day: TripDay
  index: number
  timezone: string
  editable: boolean
  /** Enhance in flight: keep edit chrome mounted, just freeze it. */
  locked: boolean
  dayOptions: DayOption[]
  enhancing: boolean
  recentIds: Set<string>
  run: EnhancementRun | null
  onApplyRun: (ids: string[]) => void
  onDismissRun: () => void
  onChange: (fn: (days: TripDay[]) => TripDay[]) => void
  onOpenMap: (dayId: string) => void
  onEnhance: (dayId: string, prompt?: string) => void
  onDeleteItem: (dayId: string, item: ItineraryItem, index: number) => void
  onSelectionEnhance?: (text: string) => void
}

export const DayCard = memo(function DayCard({
  trip,
  day,
  index,
  timezone,
  editable,
  locked,
  dayOptions,
  enhancing,
  recentIds,
  run,
  onApplyRun,
  onDismissRun,
  onChange,
  onOpenMap,
  onEnhance,
  onDeleteItem,
  onSelectionEnhance,
}: DayCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [itemFilter, setItemFilter] = useState("all")
  const hasMappable = day.items.some((i) => i.location?.lat != null && i.location?.lng != null)
  const showTime = day.items.some((i) => i.kind !== "section" && Boolean(i.time))
  const patchDay = (p: Partial<TripDay>) => onChange((days) => days.map((d) => (d.id === day.id ? { ...d, ...p } : d)))
  const openMap = useCallback(() => onOpenMap(day.id), [onOpenMap, day.id])
  const enhance = useCallback((prompt?: string) => onEnhance(day.id, prompt), [onEnhance, day.id])

  return (
    <section
      id={day.id}
      aria-label={`Day ${index + 1}`}
      aria-busy={enhancing}
      className={`scroll-mt-32 rounded-2xl border bg-[var(--trips-surface)] p-5 transition-colors duration-300 lg:scroll-mt-24 dark:bg-stone-900/50 ${
        enhancing ? ACCENT.border : "border-stone-200/80 dark:border-stone-800"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className={`font-mono-trips text-[11px] uppercase tracking-[0.18em] ${ACCENT.text}`}>
            Day {index + 1} · {formatTripDate(day.date, timezone)}
            {day.city ? ` · ${day.city}` : ""}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5">
            {editable ? (
              <>
                <input
                  value={day.emoji ?? ""}
                  placeholder="✦"
                  maxLength={4}
                  aria-label={`Day ${index + 1} emoji`}
                  disabled={locked}
                  onChange={(e) => patchDay({ emoji: e.target.value || undefined })}
                  className={`w-11 shrink-0 text-center text-xl ${subtleInputClass}`}
                />
                <input
                  value={day.title ?? ""}
                  placeholder="Day theme…"
                  title={day.title || undefined}
                  aria-label={`Day ${index + 1} title`}
                  disabled={locked}
                  onChange={(e) => patchDay({ title: e.target.value })}
                  className={`w-full truncate text-lg font-semibold ${subtleInputClass}`}
                />
              </>
            ) : (
              <h2 className={`text-lg font-semibold ${staticValueClass} ${wrapAnywhereClass}`}>
                {day.emoji ? `${day.emoji} ` : ""}
                {day.title ?? ""}
              </h2>
            )}
          </div>
        </div>
        {/* Own row below `sm` so the title input keeps the full width. */}
        <div className="flex shrink-0 items-center gap-2">
          {editable && (
            <EnhanceButton
              label="Enhance day"
              busyLabel="Reviewing day…"
              busy={enhancing}
              disabled={locked}
              variant="outline"
              promptPlaceholder="Optional focus, e.g. “swap the museum for something outdoors”"
              onRun={enhance}
            />
          )}
          <button
            type="button"
            onClick={openMap}
            disabled={!hasMappable}
            title={hasMappable ? "Open Map Mode" : "No located places on this day yet"}
            className={chipBtnClass}
          >
            <MapIcon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            Map
          </button>
        </div>
      </div>

      {editable ? (
        <textarea
          value={day.notes ?? ""}
          placeholder="Day theme prose, the editorial line under the title on the trip page…"
          aria-label={`Day ${index + 1} theme`}
          rows={day.notes ? Math.min(4, day.notes.split("\n").length) : 1}
          disabled={locked}
          onChange={(e) => patchDay({ notes: e.target.value })}
          // `field-sizing-content` grows the box with wrapped prose; `rows` is
          // the fallback where it isn't supported.
          className={`mt-2 w-full resize-none field-sizing-content ${subtleInputClass}`}
        />
      ) : (
        day.notes && (
          <p className={`mt-2 whitespace-pre-line ${staticValueClass} ${wrapAnywhereClass}`}>{day.notes}</p>
        )
      )}

      {/* Day details: display metadata for the dossier pages */}
      {editable && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            aria-expanded={detailsOpen}
            className={secondaryBtnClass}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`}
              strokeWidth={1.5}
              aria-hidden
            />
            Details
          </button>
          {detailsOpen && (
            <fieldset
              disabled={locked}
              className="mt-2 m-0 min-w-0 space-y-3 rounded-xl border border-stone-200/80 p-3 dark:border-stone-800"
            >
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
                          patchDay({
                            callouts: (day.callouts ?? []).map((x, xi) =>
                              xi === ci ? { ...x, icon: e.target.value } : x,
                            ),
                          })
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
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <input
                        value={c.body}
                        aria-label="Callout text"
                        placeholder="Heads-up text…"
                        onChange={(e) =>
                          patchDay({
                            callouts: (day.callouts ?? []).map((x, xi) =>
                              xi === ci ? { ...x, body: e.target.value } : x,
                            ),
                          })
                        }
                        className={`min-w-0 flex-1 ${compactInputClass}`}
                      />
                      <IconButton
                        label="Remove callout"
                        destructive
                        onClick={() => patchDay({ callouts: (day.callouts ?? []).filter((_, xi) => xi !== ci) })}
                      >
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
                <p className={`text-xs ${mutedInkClass}`}>
                  Weather: {day.weather.highC}°C / {day.weather.lowC}°C · {day.weather.condition}. Auto-synced from
                  the live forecast on each Enhance run.
                </p>
              )}
            </fieldset>
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
            resolveItem={(s) => trip.days.find((d) => d.id === s.dayId)?.items.find((i) => i.id === s.itemId)}
          />
        )}
      </AnimatePresence>

      {day.items.length === 0 ? (
        <div
          className={`mt-3 rounded-xl border border-dashed border-stone-200 px-4 py-6 text-center text-sm dark:border-stone-700 ${mutedInkClass}`}
        >
          Nothing planned yet{editable ? ". Add a place, note, or section below." : "."}
        </div>
      ) : (
        <div className="mt-4">
          <FilterTable
            label={`Day ${index + 1} items`}
            filters={[
              { id: "all", label: "All", count: day.items.length },
              { id: "place", label: "Places", count: day.items.filter((i) => i.kind === "place").length },
              { id: "reservation", label: "Reservations", count: day.items.filter((i) => i.kind === "reservation").length },
              { id: "note", label: "Notes", count: day.items.filter((i) => i.kind === "note" || i.kind === "section").length },
            ]}
            active={itemFilter}
            onFilter={setItemFilter}
          >
            <ul className="relative space-y-2 pl-4 before:absolute before:bottom-3 before:left-[3px] before:top-3 before:w-px before:bg-stone-200 dark:before:bg-stone-800">
              <AnimatePresence initial={false}>
                {day.items.map((item, itemIdx) => {
                  const match =
                    itemFilter === "all" ||
                    item.kind === itemFilter ||
                    (itemFilter === "note" && (item.kind === "note" || item.kind === "section"))
                  if (!match) return null
                  return (
                    <ItemRow
                      key={item.id}
                      item={item}
                      dayId={day.id}
                      index={itemIdx}
                      isFirst={itemIdx === 0}
                      isLast={itemIdx === day.items.length - 1}
                      editable={editable}
                      locked={locked}
                      dayOptions={dayOptions}
                      highlight={recentIds.has(item.id)}
                      showTime={showTime}
                      onChange={onChange}
                      onDelete={onDeleteItem}
                      onSelectionEnhance={onSelectionEnhance}
                    />
                  )
                })}
              </AnimatePresence>
            </ul>
          </FilterTable>
        </div>
      )}

      {editable && (
        <div className="mt-3 flex flex-wrap gap-2">
          {ADD_KINDS.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              aria-label={`Add ${label.toLowerCase()}`}
              disabled={locked}
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

      {editable && <TripIngest trip={trip} dayId={day.id} locked={locked} onDaysChange={onChange} />}
    </section>
  )
})
