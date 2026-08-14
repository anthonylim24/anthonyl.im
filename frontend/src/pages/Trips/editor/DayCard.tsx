import { memo, useCallback, useId, useState } from "react"
import { AnimatePresence } from "motion/react"
import { ChevronDown, Map as MapIcon, Plus, Trash2 } from "lucide-react"
import { ACCENT, formatTripDate, hasForecast } from "../theme"
import { addItem, makeItem } from "../tripEdits"
import {
  chipBtnClass,
  compactInputClass,
  compactSelectClass,
  fieldLabelClass,
  mutedInkClass,
  panelClass,
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
}: DayCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const uid = useId()
  const hasMappable = day.items.some((i) => i.location?.lat != null && i.location?.lng != null)
  const showTime = day.items.some((i) => i.kind !== "section" && Boolean(i.time))
  const patchDay = (p: Partial<TripDay>) => onChange((days) => days.map((d) => (d.id === day.id ? { ...d, ...p } : d)))
  const openMap = useCallback(() => onOpenMap(day.id), [onOpenMap, day.id])
  const enhance = useCallback((prompt?: string) => onEnhance(day.id, prompt), [onEnhance, day.id])
  const dateLabel = formatTripDate(day.date, timezone)

  return (
    <section
      id={day.id}
      aria-label={`Day ${index + 1}`}
      aria-busy={enhancing}
      className={`scroll-mt-[8.5rem] p-5 lg:scroll-mt-[8rem] ${panelClass} ${enhancing ? ACCENT.border : ""}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${mutedInkClass}`}>
            Day {index + 1}
            {day.city ? `, ${day.city}` : ""}
            <span className="mt-0.5 block font-mono-trips text-[12px] tabular-nums">{dateLabel}</span>
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            {editable ? (
              <>
                <label className="sr-only" htmlFor={`${uid}-emoji`}>
                  Day {index + 1} emoji
                </label>
                <input
                  id={`${uid}-emoji`}
                  value={day.emoji ?? ""}
                  placeholder="✦"
                  maxLength={4}
                  aria-label={`Day ${index + 1} emoji`}
                  disabled={locked}
                  onChange={(e) => patchDay({ emoji: e.target.value || undefined })}
                  className={`w-11 shrink-0 text-center text-xl ${subtleInputClass}`}
                />
                <label className="sr-only" htmlFor={`${uid}-title`}>
                  Day {index + 1} title
                </label>
                <input
                  id={`${uid}-title`}
                  value={day.title ?? ""}
                  placeholder="Day theme"
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
        <>
          <label className="sr-only" htmlFor={`${uid}-theme`}>
            Day {index + 1} theme
          </label>
          <textarea
            id={`${uid}-theme`}
            value={day.notes ?? ""}
            placeholder="Day theme prose, the editorial line under the title on the trip page"
            aria-label={`Day ${index + 1} theme`}
            rows={day.notes ? Math.min(4, day.notes.split("\n").length) : 1}
            disabled={locked}
            onChange={(e) => patchDay({ notes: e.target.value })}
            className={`mt-2 w-full resize-none field-sizing-content ${subtleInputClass}`}
          />
        </>
      ) : (
        day.notes && (
          <p className={`mt-2 whitespace-pre-line ${staticValueClass} ${wrapAnywhereClass}`}>{day.notes}</p>
        )
      )}

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
            <fieldset disabled={locked} className={`mt-2 m-0 min-w-0 space-y-3 p-3 ${panelClass}`}>
              <label className="block">
                <span className={fieldLabelClass}>Neighborhoods (comma-separated)</span>
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
                <span className={fieldLabelClass}>Callouts</span>
                <div className="mt-1 space-y-2">
                  {(day.callouts ?? []).map((c, ci) => (
                    <div key={ci} className="flex items-start gap-2">
                      <label className="sr-only" htmlFor={`${uid}-callout-icon-${ci}`}>
                        Callout icon
                      </label>
                      <input
                        id={`${uid}-callout-icon-${ci}`}
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
                      <label className="sr-only" htmlFor={`${uid}-callout-tone-${ci}`}>
                        Callout tone
                      </label>
                      <select
                        id={`${uid}-callout-tone-${ci}`}
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
                      <label className="sr-only" htmlFor={`${uid}-callout-body-${ci}`}>
                        Callout text
                      </label>
                      <input
                        id={`${uid}-callout-body-${ci}`}
                        value={c.body}
                        aria-label="Callout text"
                        placeholder="Heads-up text"
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
              {hasForecast(day.weather) && (
                <p className={`text-xs ${mutedInkClass}`}>
                  Weather: {day.weather.highC}°C / {day.weather.lowC}°C, {day.weather.condition}. Updated from the
                  live forecast each time you run Enhance.
                </p>
              )}
            </fieldset>
          )}
        </div>
      )}

      <AnimatePresence>
        {run && (
          <SuggestionsPanel run={run} dayOptions={dayOptions} onApply={onApplyRun} onDismiss={onDismissRun} />
        )}
      </AnimatePresence>

      {day.items.length === 0 ? (
        <div className={`mt-3 px-1 py-6 ${mutedInkClass}`}>
          <p className="text-sm font-medium text-[color:var(--tr-ink)]">Nothing planned</p>
          <p className="mt-1 text-sm leading-relaxed">
            {editable ? "Add a place, note, or section to start this day." : "This day has no stops yet."}
          </p>
        </div>
      ) : (
        <ul className="relative mt-4 space-y-2 pl-4 before:absolute before:bottom-3 before:left-[3px] before:top-3 before:w-px before:bg-[color:var(--tr-line)]">
          <AnimatePresence initial={false}>
            {day.items.map((item, itemIdx) => (
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
              />
            ))}
          </AnimatePresence>
        </ul>
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
