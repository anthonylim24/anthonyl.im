import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Reorder, useDragControls } from "motion/react"
import { ArrowLeft, ArrowRight, CloudSun, Eraser, Footprints, MapPin, MoreHorizontal, NotebookPen, Orbit, Sparkles } from "lucide-react"
import { sx } from "@/styles/merge"
import { formatTripDate, plural, todayIsoIn } from "../meta"
import { dayRoute, distanceMeters, isLocated, routeMeters, type LngLat } from "../map/geo"
import { formatDistance, formatWalkMinutes } from "../reservationView"
import { addItem } from "../tripEdits"
import type { EnhancementRun, ItineraryItem, Trip, TripDay } from "../types"
import type { DayOption } from "../useTripEditor"
import { a } from "../atlas.stylex"
import { ws as s } from "../workspace.stylex"
import { Menu, type MenuItem } from "../components/kit"
import { AddStop } from "./AddStop"
import { AiBusy, SuggestionsReview } from "./AiPanels"
import { ItemCard, type ItemCardProps } from "./ItemCard"

export interface DayPanelProps {
  trip: Trip
  day: TripDay
  dayIndex: number
  basePath: string
  editable: boolean
  locked: boolean
  enhancing: boolean
  applying: boolean
  run: EnhancementRun | null
  dayOptions: DayOption[]
  recentIds: ReadonlySet<string>
  hotId: string | null
  activeId: string | null
  near: LngLat | null
  onChange: (fn: (days: TripDay[]) => TripDay[]) => void
  onDelete: (dayId: string, item: ItineraryItem, index: number) => void
  onAdded: (id: string) => void
  onHover: (id: string | null) => void
  onLocate: (id: string) => void
  onAskAi: () => void
  onClear: () => void
  onApplyRun: (ids: string[]) => void
  onDismissRun: () => void
  /** Present when photoreal Map Mode is configured for this build. */
  onPhotoreal?: () => void
}

function Sortable(props: ItemCardProps & { leg: string | null }) {
  const controls = useDragControls()
  const { leg, ...card } = props
  return (
    <Reorder.Item
      as="li"
      value={props.item}
      dragListener={false}
      dragControls={controls}
      style={{ position: "relative", listStyle: "none" }}
      whileDrag={{ scale: 1.02, zIndex: 5 }}
    >
      <ItemCard {...card} onGrip={(event) => controls.start(event)} />
      {leg && (
        <div {...sx(s.item)} aria-hidden>
          <div {...sx(s.gutter)} style={{ paddingTop: 0 }}>
            <span {...sx(s.gutterLine)} />
          </div>
          <p {...sx(s.leg)}>
            <Footprints size={11} strokeWidth={2} />
            {leg}
          </p>
        </div>
      )}
    </Reorder.Item>
  )
}

export function DayPanel({
  trip,
  day,
  dayIndex,
  basePath,
  editable,
  locked,
  enhancing,
  applying,
  run,
  dayOptions,
  recentIds,
  hotId,
  activeId,
  near,
  onChange,
  onDelete,
  onAdded,
  onHover,
  onLocate,
  onAskAi,
  onClear,
  onApplyRun,
  onDismissRun,
  onPhotoreal,
}: DayPanelProps) {
  const [notesOpen, setNotesOpen] = useState(false)
  const isToday = day.date === todayIsoIn(trip.timezone)
  const prev = dayIndex > 0 ? trip.days[dayIndex - 1] : undefined
  const next = dayIndex < trip.days.length - 1 ? trip.days[dayIndex + 1] : undefined
  const route = useMemo(() => dayRoute(day), [day])
  const stops = day.items.filter((i) => i.kind !== "section" && i.kind !== "note").length
  const meters = routeMeters(route)

  const { labels, legs } = useMemo(() => {
    const labels = new Map<string, string>()
    const legs = new Map<string, string>()
    let n = 0
    let last: { id: string; at: LngLat } | null = null
    for (const item of day.items) {
      if (!isLocated(item)) continue
      n += 1
      labels.set(item.id, String(n))
      const at = { lat: item.location.lat, lng: item.location.lng }
      if (last) {
        const d = distanceMeters(last.at, at)
        if (d >= 40) legs.set(last.id, d < 4000 ? `${formatDistance(d)} · ${formatWalkMinutes(d)}` : `${formatDistance(d)} away`)
      }
      last = { id: item.id, at }
    }
    return { labels, legs }
  }, [day.items])

  const patchDay = (patch: Partial<TripDay>) =>
    onChange((days) => days.map((d) => (d.id === day.id ? { ...d, ...patch } : d)))

  const menu: MenuItem[] = [
    ...(editable
      ? [{ label: day.notes ? "Edit day notes" : "Add day notes", icon: <NotebookPen size={16} strokeWidth={1.75} aria-hidden />, onSelect: () => setNotesOpen(true) }]
      : []),
    ...(onPhotoreal && route.length > 0
      ? [{ label: "Explore in photoreal 3D", icon: <Orbit size={16} strokeWidth={1.75} aria-hidden />, onSelect: onPhotoreal }]
      : []),
    ...(editable && day.items.length > 0
      ? [
          {
            label: "Clear this day",
            icon: <Eraser size={16} strokeWidth={1.75} aria-hidden />,
            danger: true,
            separated: true,
            disabled: locked,
            onSelect: onClear,
          },
        ]
      : []),
  ]

  return (
    <div {...sx(s.content)} key={day.id}>
      <header {...sx(s.dayHead)}>
        <p {...sx(a.eyebrow)}>
          Day {dayIndex + 1} of {trip.days.length} · {formatTripDate(day.date, trip.timezone, { weekday: "long", month: "long" })}
          {isToday && <span {...sx(a.accentText)}> · Today</span>}
        </p>
        {editable ? (
          <textarea
            rows={1}
            aria-label="Day title"
            value={day.title ?? ""}
            placeholder={`Name day ${dayIndex + 1}`}
            disabled={locked}
            {...sx(s.titleInput, s.dayTitle)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                event.currentTarget.blur()
              }
            }}
            onChange={(event) => patchDay({ title: event.target.value.replace(/\s*\n\s*/g, " ") || undefined })}
          />
        ) : (
          <h2 {...sx(a.display, s.dayTitle, a.wrap)}>{day.title || `Day ${dayIndex + 1}`}</h2>
        )}
        <div {...sx(a.rowWrap)} style={{ columnGap: "0.875rem" }}>
          <span {...sx(a.row, a.small)} style={{ gap: "0.25rem" }}>
            <MapPin size={14} strokeWidth={1.75} aria-hidden />
            {editable ? (
              <input
                aria-label="City for this day"
                value={day.city ?? ""}
                placeholder="City"
                disabled={locked}
                {...sx(s.inlineInput)}
                onChange={(event) => patchDay({ city: event.target.value || undefined })}
              />
            ) : (
              (day.city ?? trip.destinations[0])
            )}
          </span>
          {day.weather && (
            <span {...sx(a.row, a.small)} style={{ gap: "0.375rem" }}>
              <CloudSun size={14} strokeWidth={1.75} aria-hidden />
              {Math.round(day.weather.highC)}° / {Math.round(day.weather.lowC)}° {day.weather.condition}
            </span>
          )}
          <span {...sx(a.mono, a.muted)}>
            {plural(stops, "stop")}
            {meters > 100 ? ` · ${formatDistance(meters)}` : ""}
          </span>
        </div>
        <div {...sx(a.rowWrap)} style={{ marginTop: "0.25rem" }}>
          {editable && (
            <button type="button" {...sx(a.btn, a.btnSoft, a.btnSm)} disabled={locked} onClick={onAskAi}>
              <Sparkles size={14} strokeWidth={1.75} aria-hidden />
              {day.items.length === 0 ? "Plan this day with AI" : "Ideas for this day"}
            </button>
          )}
          {menu.length > 0 && (
            <Menu
              label={`More for day ${dayIndex + 1}`}
              align="start"
              trigger={<MoreHorizontal size={18} strokeWidth={1.75} aria-hidden />}
              triggerStyle={[a.iconBtn, a.iconBtnSm]}
              items={menu}
            />
          )}
        </div>
      </header>

      {(notesOpen || day.notes) &&
        (editable ? (
          <textarea
            aria-label="Day notes"
            value={day.notes ?? ""}
            placeholder="Notes for the day"
            disabled={locked}
            autoFocus={notesOpen && !day.notes}
            {...sx(s.notes)}
            onBlur={() => !day.notes && setNotesOpen(false)}
            onChange={(event) => patchDay({ notes: event.target.value || undefined })}
          />
        ) : (
          <p {...sx(a.body, a.wrap)} style={{ whiteSpace: "pre-wrap" }}>
            {day.notes}
          </p>
        ))}

      {day.callouts?.map((callout, i) => (
        <div key={i} {...sx(s.callout)}>
          <span aria-hidden>{callout.icon}</span>
          <p {...sx(a.wrap)} style={{ margin: 0 }}>
            {callout.body}
          </p>
        </div>
      ))}

      {enhancing && <AiBusy label="AI is reading this day and scouting nearby places. This can take a minute." />}
      {run && !enhancing && (
        <SuggestionsReview run={run} dayOptions={dayOptions} applying={applying} onApply={onApplyRun} onDismiss={onDismissRun} />
      )}

      <section aria-label={`Day ${dayIndex + 1} plan`}>
        {day.items.length === 0 ? (
          <div {...sx(s.emptyDay)}>
            <p {...sx(a.body, a.ink)} style={{ fontWeight: 600 }}>
              Nothing planned yet
            </p>
            <p {...sx(a.small)}>
              {editable
                ? "Search for a place below and it drops onto the map, or let AI sketch the day."
                : "Whoever’s planning hasn’t added anything to this day."}
            </p>
          </div>
        ) : (
          <Reorder.Group
            as="ol"
            axis="y"
            values={day.items}
            onReorder={(items) => !locked && patchDay({ items })}
            {...sx(s.timeline)}
          >
            {day.items.map((item, index) => (
              <Sortable
                key={item.id}
                item={item}
                dayId={day.id}
                index={index}
                count={day.items.length}
                pinLabel={labels.get(item.id) ?? null}
                leg={legs.get(item.id) ?? null}
                editable={editable}
                locked={locked}
                hot={hotId === item.id}
                active={activeId === item.id}
                flash={recentIds.has(item.id)}
                near={near}
                dayOptions={dayOptions}
                onChange={onChange}
                onDelete={onDelete}
                onHover={onHover}
                onLocate={onLocate}
              />
            ))}
          </Reorder.Group>
        )}
      </section>

      {editable && (
        <AddStop
          near={near}
          disabled={locked}
          onAdd={(item) => {
            onChange((days) => addItem(days, day.id, item))
            onAdded(item.id)
          }}
        />
      )}

      <nav {...sx(s.pager)} aria-label="Other days">
        {prev && (
          <Link to={`${basePath}/day/${prev.id}`} rel="prev" {...sx(s.pagerLink)}>
            <span {...sx(a.eyebrow)}>
              <ArrowLeft size={11} strokeWidth={2} aria-hidden style={{ display: "inline", verticalAlign: "-1px", marginRight: 4 }} />
              Day {dayIndex}
            </span>
            <span {...sx(a.truncate, s.dayRowTitle)}>{prev.title || formatTripDate(prev.date, trip.timezone)}</span>
          </Link>
        )}
        {next && (
          <Link to={`${basePath}/day/${next.id}`} rel="next" {...sx(s.pagerLink, s.pagerNext)}>
            <span {...sx(a.eyebrow)}>
              Day {dayIndex + 2}
              <ArrowRight size={11} strokeWidth={2} aria-hidden style={{ display: "inline", verticalAlign: "-1px", marginLeft: 4 }} />
            </span>
            <span {...sx(a.truncate, s.dayRowTitle)}>{next.title || formatTripDate(next.date, trip.timezone)}</span>
          </Link>
        )}
      </nav>
    </div>
  )
}
