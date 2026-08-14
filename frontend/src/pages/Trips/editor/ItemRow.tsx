import { memo, useEffect, useId, useRef, useState, type MouseEvent } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowDown, ArrowRightLeft, ArrowUp, ChevronDown, Copy, MapPin, Trash2 } from "lucide-react"
import { ACCENT } from "../theme"
import { useAnchorHighlight } from "../anchors"
import { AiChip, StatusChip } from "../components/StatusChip"
import { ItemIcon } from "../components/ItemIcon"
import { convertNoteToPlace, duplicateItem, moveItem, moveItemToDay, updateItem } from "../tripEdits"
import {
  EASE,
  compactInputClass,
  compactSelectClass,
  dangerChipBtnClass,
  faintInkClass,
  fieldLabelClass,
  iconBtnClass,
  mutedInkClass,
  rowPerfClass,
  staticFieldClass,
  staticValueClass,
  subtleInputClass,
  timeCellClass,
  wrapAnywhereClass,
} from "../ui"
import type { ItemStatus, ItineraryItem, TripDay } from "../types"
import { IconButton } from "./IconButton"
import { STATUS_OPTIONS, type DayOption } from "./editorUi"

interface ItemRowProps {
  item: ItineraryItem
  dayId: string
  index: number
  isFirst: boolean
  isLast: boolean
  editable: boolean
  locked?: boolean
  dayOptions: DayOption[]
  highlight: boolean
  /** True when any item in the day is timed - keeps the time gutter (and so
   *  every title) aligned without reserving it on untimed days. */
  showTime: boolean
  onChange: (fn: (days: TripDay[]) => TripDay[]) => void
  onDelete: (dayId: string, item: ItineraryItem, index: number) => void
}

/** Viewers get plain text with the input's box metrics: a `disabled` input is
 *  skipped by screen readers and renders below AA contrast. */
function ReadonlyOrInput({
  editable,
  locked,
  label,
  value,
  placeholder,
  onChange,
}: {
  editable: boolean
  locked?: boolean
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  if (!editable) {
    return (
      <div>
        <span className={fieldLabelClass}>{label}</span>
        <p className={staticFieldClass}>{value || "Not set"}</p>
      </div>
    )
  }
  return (
    <label className="block">
      <span className={fieldLabelClass}>{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        disabled={locked}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full ${compactInputClass}`}
      />
    </label>
  )
}

export const ItemRow = memo(function ItemRow({
  item,
  dayId,
  index,
  isFirst,
  isLast,
  editable,
  locked = false,
  dayOptions,
  highlight,
  showTime,
  onChange,
  onDelete,
}: ItemRowProps) {
  const reduce = useReducedMotion()
  const highlightClass = useAnchorHighlight(highlight)
  const [expanded, setExpanded] = useState(false)
  const rowRef = useRef<HTMLLIElement>(null)
  const uid = useId()
  const panelId = `${uid}-panel`
  const isSection = item.kind === "section"
  const isPlace = item.kind === "place" || item.kind === "reservation"
  const mapped = item.location?.lat != null && item.location?.lng != null
  const patch = (p: Partial<Omit<ItineraryItem, "id">>) => onChange((days) => updateItem(days, dayId, item.id, p))

  useEffect(() => {
    if (expanded) rowRef.current?.scrollIntoView({ block: "nearest" })
  }, [expanded])

  const toggleFromRow = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("input, select, textarea, button, a, label")) return
    setExpanded((v) => !v)
  }

  const locationName = item.location?.name?.trim()
  const metaLocation = locationName && locationName !== item.title.trim() ? locationName : null
  const needsPin = isPlace && !mapped
  const hasChips = item.createdBy === "ai" || item.status !== "none"
  const chips = (
    <>
      {item.createdBy === "ai" && <AiChip />}
      <StatusChip status={item.status} />
    </>
  )

  const disclosure = (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      aria-expanded={expanded}
      aria-controls={panelId}
      aria-label={expanded ? `Collapse ${item.title || "item"}` : `Expand ${item.title || "item"}`}
      className={iconBtnClass}
    >
      <ChevronDown
        className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
        strokeWidth={1.5}
        aria-hidden
      />
    </button>
  )

  return (
    <motion.li
      ref={rowRef}
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.22, ease: EASE }}
      className={`relative ${rowPerfClass} ${
        isSection
          ? "rounded-[var(--tr-r-control)] bg-[var(--tr-overlay)] px-3 py-1.5"
          : "rounded-[var(--tr-r-panel)] border border-[color:var(--tr-line)] bg-[var(--tr-surface)] px-3 py-2"
      } ${highlightClass}`}
    >
      {isSection ? (
        <div className="flex items-center gap-2" onClick={toggleFromRow}>
          {editable ? (
            <>
              <label className="sr-only" htmlFor={`${uid}-section`}>
                Section heading
              </label>
              <input
                id={`${uid}-section`}
                value={item.title}
                placeholder="Section heading"
                title={item.title || undefined}
                aria-label="Section heading"
                disabled={locked}
                onChange={(e) => patch({ title: e.target.value })}
                className={`min-w-0 flex-1 font-mono-trips text-[11px] uppercase tracking-[0.06em] sm:tracking-[0.16em] ${subtleInputClass}`}
              />
            </>
          ) : (
            <span
              className={`min-w-0 flex-1 px-1 py-1 font-mono-trips text-[11px] uppercase tracking-[0.06em] text-[color:var(--tr-ink)] sm:tracking-[0.16em] ${wrapAnywhereClass}`}
            >
              {item.title}
            </span>
          )}
          {item.time && <span className={`shrink-0 ${timeCellClass}`}>{item.time}</span>}
          {disclosure}
        </div>
      ) : (
        <div
          onClick={toggleFromRow}
          className={`grid items-center gap-x-2 gap-y-1 ${
            showTime
              ? "grid-cols-[1.25rem_1rem_minmax(0,1fr)_auto] sm:grid-cols-[1.25rem_3.5rem_1rem_minmax(0,1fr)_auto]"
              : "grid-cols-[1.25rem_1rem_minmax(0,1fr)_auto]"
          }`}
        >
          <span
            role="img"
            aria-label={mapped ? "On the map" : "No coordinates yet"}
            title={mapped ? "On the map" : "No coordinates yet"}
            className="flex h-5 w-5 items-center justify-center"
          >
            <MapPin
              className={`h-[15px] w-[15px] ${
                mapped ? "fill-[color:var(--ta-soft)] text-[color:var(--ta)]" : faintInkClass
              }`}
              strokeWidth={1.5}
              aria-hidden
            />
          </span>
          {showTime && (
            <span className={`hidden truncate text-right sm:block ${timeCellClass}`} title={item.endTime ? `${item.time} - ${item.endTime}` : undefined}>
              {item.time ?? ""}
            </span>
          )}
          <ItemIcon
            kind={item.kind}
            category={item.location?.category}
            reservationType={item.reservation?.type}
            className={`h-4 w-4 shrink-0 ${isPlace ? ACCENT.text : mutedInkClass}`}
          />
          {editable ? (
            <>
              <label className="sr-only" htmlFor={`${uid}-title`}>
                Item title
              </label>
              <input
                id={`${uid}-title`}
                value={item.title}
                placeholder="Title"
                title={item.title || undefined}
                aria-label="Item title"
                disabled={locked}
                onChange={(e) => patch({ title: e.target.value })}
                className={`w-full min-w-0 ${subtleInputClass} ${
                  item.status === "completed" ? `line-through ${mutedInkClass}` : ""
                }`}
              />
            </>
          ) : (
            <span
              className={`w-full min-w-0 ${staticValueClass} ${wrapAnywhereClass} ${
                item.status === "completed" ? `line-through ${mutedInkClass}` : ""
              }`}
            >
              {item.title}
            </span>
          )}
          <span className="flex items-center gap-1.5 justify-self-end">
            <span className="hidden items-center gap-1.5 sm:inline-flex">{chips}</span>
            {disclosure}
          </span>
          {(metaLocation || needsPin || hasChips || (showTime && item.time)) && (
            <div
              className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-2 text-xs ${mutedInkClass} ${
                showTime ? "col-span-2 col-start-3 sm:col-start-4" : "col-span-2 col-start-3"
              } ${metaLocation || needsPin ? "" : "sm:hidden"}`}
            >
              {showTime && item.time && (
                <span className={`sm:hidden ${timeCellClass}`}>
                  {item.endTime ? `${item.time}-${item.endTime}` : item.time}
                </span>
              )}
              {metaLocation && <span className={`min-w-0 ${wrapAnywhereClass}`}>{metaLocation}</span>}
              {needsPin && <span className="text-[color:var(--tr-warn)]">no pin yet</span>}
              {hasChips && <span className="flex items-center gap-1.5 sm:hidden">{chips}</span>}
            </div>
          )}
        </div>
      )}

      {expanded && (
        <div id={panelId} className="mt-3 space-y-3 border-t border-[color:var(--tr-line)] pt-3">
          {editable && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <span className={fieldLabelClass}>Times</span>
                <div className="mt-1 flex items-center gap-1.5">
                  <label className="sr-only" htmlFor={`${uid}-start`}>
                    Start time
                  </label>
                  <input
                    id={`${uid}-start`}
                    type="time"
                    value={item.time ?? ""}
                    aria-label="Start time"
                    disabled={locked}
                    onChange={(e) => patch({ time: e.target.value || undefined })}
                    className={`w-full tabular-nums ${compactInputClass}`}
                  />
                  <span className={`shrink-0 ${faintInkClass}`} aria-hidden>
                    -
                  </span>
                  <label className="sr-only" htmlFor={`${uid}-end`}>
                    End time
                  </label>
                  <input
                    id={`${uid}-end`}
                    type="time"
                    value={item.endTime ?? ""}
                    aria-label="End time"
                    disabled={locked}
                    onChange={(e) => patch({ endTime: e.target.value || undefined })}
                    className={`w-full tabular-nums ${compactInputClass}`}
                  />
                </div>
              </div>
              <div>
                <label className="block" htmlFor={`${uid}-status`}>
                  <span className={fieldLabelClass}>Status</span>
                  <select
                    id={`${uid}-status`}
                    value={item.status}
                    aria-label="Item status"
                    disabled={locked}
                    onChange={(e) => patch({ status: e.target.value as ItemStatus })}
                    className={`mt-1 w-full ${compactSelectClass}`}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}

          {editable ? (
            <label className="block" htmlFor={`${uid}-notes`}>
              <span className={fieldLabelClass}>Notes</span>
              <textarea
                id={`${uid}-notes`}
                value={item.notes ?? ""}
                placeholder="Notes, links, reminders"
                rows={3}
                disabled={locked}
                onChange={(e) => patch({ notes: e.target.value || undefined })}
                className={`mt-1 w-full resize-none ${compactInputClass}`}
              />
            </label>
          ) : (
            item.notes && (
              <div>
                <span className={fieldLabelClass}>Notes</span>
                <p className={`${staticFieldClass} whitespace-pre-line`}>{item.notes}</p>
              </div>
            )
          )}

          {isPlace && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ReadonlyOrInput
                editable={editable}
                locked={locked}
                label="Location name"
                value={item.location?.name ?? ""}
                placeholder="Place name"
                onChange={(next) =>
                  patch({ location: { ...(item.location ?? { source: "user" as const }), name: next } })
                }
              />
              <ReadonlyOrInput
                editable={editable}
                locked={locked}
                label="Address"
                value={item.location?.address ?? ""}
                placeholder="Address"
                onChange={(next) =>
                  patch({
                    location: {
                      ...(item.location ?? { name: item.title, source: "user" as const }),
                      address: next || undefined,
                    },
                  })
                }
              />
              {item.location?.lat != null && item.location?.lng != null ? (
                <p className={`col-span-full inline-flex items-center gap-1.5 text-xs ${mutedInkClass} ${wrapAnywhereClass}`}>
                  <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                  {item.location.lat.toFixed(4)}, {item.location.lng.toFixed(4)}
                  {item.location.confidence
                    ? ` (${item.location.confidence} confidence, appears in Map Mode)`
                    : " (appears in Map Mode)"}
                </p>
              ) : (
                <p className="col-span-full text-xs text-[color:var(--tr-warn)]">
                  No coordinates yet. Run Enhance day or add them so this place appears in Map Mode.
                </p>
              )}
            </div>
          )}

          {editable && (
            <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-[color:var(--tr-line)] pt-3">
              <div>
                <span className={fieldLabelClass}>Arrange</span>
                <div className="mt-0.5 flex items-center">
                  <IconButton
                    label="Move up"
                    disabled={isFirst || locked}
                    onClick={() => onChange((days) => moveItem(days, dayId, item.id, -1))}
                  >
                    <ArrowUp className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  </IconButton>
                  <IconButton
                    label="Move down"
                    disabled={isLast || locked}
                    onClick={() => onChange((days) => moveItem(days, dayId, item.id, 1))}
                  >
                    <ArrowDown className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  </IconButton>
                  <IconButton
                    label="Duplicate"
                    disabled={locked}
                    onClick={() => onChange((days) => duplicateItem(days, dayId, item.id))}
                  >
                    <Copy className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  </IconButton>
                  {item.kind === "note" && (
                    <IconButton
                      label="Convert to place"
                      disabled={locked}
                      onClick={() => onChange((days) => convertNoteToPlace(days, dayId, item.id))}
                    >
                      <MapPin className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                    </IconButton>
                  )}
                </div>
              </div>
              <label className="block" htmlFor={`${uid}-move-day`}>
                <span className={fieldLabelClass}>Move to day</span>
                <span className="mt-1 flex items-center gap-1.5">
                  <ArrowRightLeft className={`h-4 w-4 shrink-0 ${mutedInkClass}`} strokeWidth={1.5} aria-hidden />
                  <select
                    id={`${uid}-move-day`}
                    value={dayId}
                    disabled={locked}
                    onChange={(e) => onChange((days) => moveItemToDay(days, dayId, item.id, e.target.value))}
                    className={compactSelectClass}
                  >
                    {dayOptions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
              <button
                type="button"
                disabled={locked}
                onClick={() => onDelete(dayId, item, index)}
                className={`ml-auto ${dangerChipBtnClass}`}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </motion.li>
  )
})
