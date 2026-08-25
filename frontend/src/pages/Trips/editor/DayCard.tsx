import { lazy, memo, Suspense, useCallback, useState } from "react"
import { AnimatePresence } from "motion/react"
import { ChevronDown, Map as MapIcon, Plus, Trash2 } from "lucide-react"
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
  subtleInputClass,
  wrapAnywhereClass,
} from "../ui"
import type { EnhancementRun, ItemKind, ItineraryItem, Trip, TripDay } from "../types"
import { EnhanceButton } from "./EnhanceButton"
import { IconButton } from "./IconButton"
import { ItemRow } from "./ItemRow"
import { SuggestionsPanel } from "./SuggestionsPanel"
import type { DayOption } from "./editorUi"
import { sx } from '@/lib/utils'
import { styles } from '../trips.stylex'

const TripIngest = lazy(() => import("../TripIngest").then((m) => ({ default: m.TripIngest })))

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
  ingestAnchor?: boolean
  ingestOpen?: boolean
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
  ingestAnchor = false,
  ingestOpen = false,
}: DayCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
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
      {...sx(styles.scrollMt32, styles.dayCardBorder, enhancing ? ACCENT.softBg : null)}
    >
      <div {...sx(styles.dayCardHeaderRow)}>
        <div {...sx(styles.dayCardLeft)}>
          <span aria-hidden {...sx(styles.dayCardNumber)}>
            {index + 1}
          </span>
          <div {...sx(styles.flex1, styles.minW0)}>
            <p {...sx(styles.textXs, styles.fontMedium, mutedInkClass)}>
              {formatTripDate(day.date, timezone)}
              {day.city ? ` · ${day.city}` : ""}
            </p>
            <div {...sx(styles.dayCardTitleRow)}>
              {editable ? (
                <>
                  <input
                    value={day.emoji ?? ""}
                    placeholder="✦"
                    maxLength={4}
                    aria-label={`Day ${index + 1} emoji`}
                    disabled={locked}
                    onChange={(e) => patchDay({ emoji: e.target.value || undefined })}
                    {...sx(styles.dayCardEmojiInput, subtleInputClass)}
                  />
                  <input
                    value={day.title ?? ""}
                    placeholder="Day theme…"
                    title={day.title || undefined}
                    aria-label={`Day ${index + 1} title`}
                    disabled={locked}
                    onChange={(e) => patchDay({ title: e.target.value })}
                    {...sx(styles.dayCardTitleInput, subtleInputClass)}
                  />
                </>
              ) : (
                <h2 {...sx(styles.dayCardTitleReadonly, wrapAnywhereClass)}>
                  {day.emoji ? `${day.emoji} ` : ""}
                  {day.title ?? ""}
                </h2>
              )}
            </div>
          </div>
        </div>
        <div {...sx(styles.dayCardActions)}>
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
            {...sx(chipBtnClass)}
          >
            <MapIcon {...sx(styles.icon35)} strokeWidth={1.5} aria-hidden />
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
          {...sx(styles.mt2, styles.wFull, styles.fieldSizingContent, subtleInputClass)}
        />
      ) : (
        day.notes && (
          <p {...sx(styles.mt2, styles.whitespacePreLine, styles.textSm, mutedInkClass, wrapAnywhereClass)}>{day.notes}</p>
        )
      )}

      {editable && (
        <div {...sx(styles.dayCardDetailsWrap)}>
          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            aria-expanded={detailsOpen}
            {...sx(secondaryBtnClass)}
          >
            <ChevronDown
              {...sx(styles.iconMd, styles.transitionTransform, detailsOpen ? styles.rotate180 : null)}
              strokeWidth={1.5}
              aria-hidden
            />
            Details
          </button>
          {detailsOpen && (
            <fieldset disabled={locked} {...sx(styles.dayCardDetailsFieldset)}>
              <label {...sx(styles.block)}>
                <span {...sx(labelClass)}>Neighborhoods (comma-separated)</span>
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
                  {...sx(styles.mt1, styles.wFull, compactInputClass)}
                />
              </label>
              <div>
                <span {...sx(labelClass)}>Callouts</span>
                <div {...sx(styles.mt1, styles.spaceY2)}>
                  {(day.callouts ?? []).map((c, ci) => (
                    <div key={ci} {...sx(styles.dayCardCalloutRow)}>
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
                        {...sx(styles.calloutIconInput, compactInputClass)}
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
                        {...sx(styles.shrink0, compactSelectClass)}
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
                        {...sx(styles.minW0, styles.flex1, compactInputClass)}
                      />
                      <IconButton
                        label="Remove callout"
                        destructive
                        onClick={() => patchDay({ callouts: (day.callouts ?? []).filter((_, xi) => xi !== ci) })}
                      >
                        <Trash2 {...sx(styles.iconSm)} strokeWidth={1.5} aria-hidden />
                      </IconButton>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => patchDay({ callouts: [...(day.callouts ?? []), { icon: "⚠️", tone: "warn", body: "" }] })}
                    {...sx(quietBtnClass)}
                  >
                    <Plus {...sx(styles.icon35)} strokeWidth={1.5} aria-hidden />
                    Add callout
                  </button>
                </div>
              </div>
              {day.weather && (
                <p {...sx(styles.textXs, mutedInkClass)}>
                  Weather: {day.weather.highC}°C / {day.weather.lowC}°C · {day.weather.condition}. Auto-synced from
                  the live forecast on each Enhance run.
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
        <p {...sx(styles.mt4, styles.py2, styles.textSm, mutedInkClass)}>
          Nothing planned yet{editable ? ". Add a place, note, or section below." : "."}
        </p>
      ) : (
        <ul {...sx(styles.dayCardItemList)}>
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
        <div {...sx(styles.dayCardAddRow)}>
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
              {...sx(quietBtnClass)}
            >
              <Plus {...sx(styles.icon35)} strokeWidth={1.5} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      )}

      {editable && (
        <Suspense
          fallback={
            <div role="status" aria-label="Loading Instagram importer" {...sx(styles.mt2, styles.textXs, mutedInkClass)}>
              Loading Instagram importer…
            </div>
          }
        >
          <TripIngest
            trip={trip}
            dayId={day.id}
            locked={locked}
            ingestAnchor={ingestAnchor}
            defaultOpen={ingestOpen}
            onDaysChange={onChange}
          />
        </Suspense>
      )}
    </section>
  )
})
