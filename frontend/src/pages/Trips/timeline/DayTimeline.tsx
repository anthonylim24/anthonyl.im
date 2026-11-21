import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { Footprints, Plane, Route, TrainFront, TriangleAlert } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { ItemIcon } from "../ItemIcon"
import { splitDay } from "../map/geo"
import { plural, titleCase } from "../meta"
import type { ItineraryItem, Trip, TripDay } from "../types"
import { scrollBehavior } from "../workspace/scroll"
import {
  clockLabel,
  clockMinutes,
  layoutDay,
  stopNumbers,
  stopTitle,
  timeScale,
  yAt,
  type TimelineBlock,
  type TimelineConflict,
  type TimelineGap,
} from "./timeline"
import { tl } from "./timeline.stylex"
import { formatMinutes, type TravelMode } from "./travel"

export interface DayTimelineProps {
  trip: Trip
  day: TripDay
  activeId: string | null
  hotId: string | null
  onSelect: (itemId: string) => void
  onHover: (itemId: string | null) => void
  /** "HH:mm" in the trip's time zone, when the day is today: draws the now line. */
  now?: string
}

const PX_PER_MIN = 1.2
/** Blocks sit 1px inside their minutes so the hour rule between two shows. */
const INSET = 1
/** The smallest block is still a 44px target with a time and a title. */
const BLOCK_MIN_PX = 44
/** Stacked (beside an overlapping stop) the title sits under the badge row. */
const STACKED_MIN_PX = 52
const WARN_PX = 18
const GAP_LABEL_PX = 26
/** Free time worth pointing out. */
const FREE_LABEL_MIN = 45
/** Two hours or more is one of the day's big moments (serif title). */
const BIG_MOMENT_MIN = 120
/** Line boxes inside a block, in px (see timeline.stylex.ts). */
const LINE = { chrome: 12, time: 16, badge: 22, title: 18, big: 22, meta: 16, warn: 18 }

const DAY_MIN = 24 * 60
const STOP = "data-timeline-stop"

/** "9 AM", "12 PM": the ruler's hour labels. */
function hourLabel(minutes: number): string {
  const hour = Math.floor((((minutes % DAY_MIN) + DAY_MIN) % DAY_MIN) / 60)
  return `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? "AM" : "PM"}`
}

/** Screen readers say "almost equal to" for ≈; "about" is what is meant. */
const spoken = (text: string) => text.replace(/≈ /g, "about ")
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function category(item: ItineraryItem): string | null {
  const raw = item.kind === "reservation" ? (item.reservation?.type ?? "booking") : item.location?.category
  return raw?.trim().replace(/[_-]+/g, " ").toLowerCase() || null
}

const labelled = (gap: TimelineGap) => gap.to > gap.from && (gap.travel !== undefined || gap.free >= FREE_LABEL_MIN)

/** The glyph for a leg's mode; the list view's leg rows use it too. */
export function ModeIcon({ mode }: { mode: TravelMode }) {
  const props = { size: 12, strokeWidth: 2, "aria-hidden": true } as const
  switch (mode) {
    case "walk":
      return <Footprints {...props} />
    case "transit":
      return <TrainFront {...props} />
    case "road":
      return <Route {...props} />
    case "flight":
      return <Plane {...props} />
  }
}

function stopButtons(root: HTMLElement | null): HTMLElement[] {
  return Array.from(root?.querySelectorAll<HTMLElement>(`[${STOP}]`) ?? [])
}

/**
 * The day on a clock: a ruler of hours with each timed stop placed by the
 * minute, side by side where they overlap, the leg between them, the free
 * time worth knowing about and anything that doesn't fit. Stops with no time
 * (and places still to schedule) wait in an "Anytime" list underneath.
 */
export function DayTimeline({ trip, day, activeId, hotId, onSelect, onHover, now }: DayTimelineProps) {
  const rootRef = useRef<HTMLElement>(null)
  const baseId = useId()
  const [focusId, setFocusId] = useState<string | null>(null)

  const layout = useMemo(() => layoutDay(day), [day])
  const numbers = useMemo(() => stopNumbers(day), [day])
  const byId = useMemo(() => new Map(day.items.map((item) => [item.id, item])), [day.items])
  const parked = useMemo(() => new Set(splitDay(day).parked.map((item) => item.id)), [day])
  const dayNumber = trip.days.findIndex((d) => d.id === day.id) + 1

  // Each warning sits on the later stop: the one you would arrive late to.
  const warnings = useMemo(() => {
    const byStop = new Map<string, TimelineConflict[]>()
    for (const conflict of layout.conflicts) byStop.set(conflict.ids[1], [...(byStop.get(conflict.ids[1]) ?? []), conflict])
    return byStop
  }, [layout])
  const arrivals = useMemo(() => new Map(layout.gaps.map((gap) => [gap.beforeId, gap])), [layout])

  const scale = useMemo(
    () =>
      timeScale(layout.start, layout.end, PX_PER_MIN, [
        ...layout.blocks.map((block) => ({
          from: block.start,
          to: block.end,
          px: (block.lanes > 1 ? STACKED_MIN_PX : BLOCK_MIN_PX) + INSET * 2 + (warnings.has(block.itemId) ? WARN_PX : 0),
        })),
        ...layout.gaps.filter(labelled).map((gap) => ({ from: gap.from, to: gap.to, px: GAP_LABEL_PX })),
      ]),
    [layout, warnings],
  )

  // One tab stop for the whole timeline; arrows move within it (clock order, then Anytime).
  const order = useMemo(() => [...layout.blocks.map((block) => block.itemId), ...layout.untimed], [layout])
  const tabStop = (focusId && order.includes(focusId) ? focusId : activeId && order.includes(activeId) ? activeId : order[0]) ?? null

  useEffect(() => {
    if (!activeId) return
    const target = stopButtons(rootRef.current).find((el) => el.getAttribute(STOP) === activeId)
    target?.scrollIntoView?.({ block: "nearest", behavior: scrollBehavior() })
  }, [activeId])

  const nowAt = useMemo(() => {
    const minutes = clockMinutes(now)
    if (minutes === null) return null
    return [minutes, minutes + DAY_MIN].find((t) => t >= layout.start && t <= layout.end) ?? null
  }, [now, layout])

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const id = (event.target as HTMLElement).closest(`[${STOP}]`)?.getAttribute(STOP)
    if (!id) return
    if (event.key === "Enter") {
      // Handled here so the native click that would follow doesn't select twice.
      event.preventDefault()
      onSelect(id)
      return
    }
    const at = order.indexOf(id)
    const to =
      event.key === "ArrowDown" ? at + 1 : event.key === "ArrowUp" ? at - 1 : event.key === "Home" ? 0 : event.key === "End" ? order.length - 1 : null
    if (to === null) return
    event.preventDefault()
    const target = order[Math.max(0, Math.min(order.length - 1, to))]
    stopButtons(rootRef.current)
      .find((el) => el.getAttribute(STOP) === target)
      ?.focus()
  }

  const events = (id: string) => ({
    [STOP]: id,
    tabIndex: id === tabStop ? 0 : -1,
    onClick: () => onSelect(id),
    onFocus: () => {
      setFocusId(id)
      onHover(id)
    },
    onBlur: () => onHover(null),
    onMouseEnter: () => onHover(id),
    onMouseLeave: () => onHover(null),
  })

  const descriptions: Array<{ id: string; text: string }> = []
  const describe = (text: string) => {
    if (!text) return undefined
    const id = `${baseId}-d${descriptions.length}`
    descriptions.push({ id, text })
    return id
  }

  const hours: number[] = []
  for (let t = layout.start; t <= layout.end; t += 60) hours.push(t)
  const free = layout.gaps.reduce((sum, gap) => sum + gap.free, 0)
  const anytimeHeading = `${baseId}-anytime`

  const block = (b: TimelineBlock) => {
    const item = byId.get(b.itemId)
    if (!item) return null
    const number = numbers.get(item.id) ?? null
    const kind = category(item)
    const title = stopTitle(item)
    const stopWarnings = warnings.get(item.id) ?? []
    const arrival = arrivals.get(item.id)
    const from = arrival ? byId.get(arrival.afterId) : undefined
    const minutes = b.end - b.start
    const active = activeId === item.id
    const runsOn = b.end > layout.end

    const top = yAt(scale, b.start) + INSET
    const height = Math.max(0, yAt(scale, Math.min(b.end, layout.end)) - INSET - top)
    const stacked = b.lanes > 1
    const big = minutes >= BIG_MOMENT_MIN && !stacked
    const titleLine = big ? LINE.big : LINE.title
    const room = height - LINE.chrome - (stacked ? LINE.badge : LINE.time) - (stopWarnings.length > 0 ? LINE.warn : 0)
    const showMeta = kind !== null && room >= titleLine + LINE.meta
    const lines = Math.max(1, Math.min(3, Math.floor((room - (showMeta ? LINE.meta : 0)) / titleLine)))

    const name = [
      b.estimated ? clockLabel(b.start) : `${clockLabel(b.start)} to ${clockLabel(b.end)}`,
      title,
      kind,
      number ? `stop ${number}` : null,
    ]
      .filter(Boolean)
      .join(", ")
    const description = describe(
      [
        b.estimated ? `Length estimated, about ${formatMinutes(minutes)}` : null,
        arrival?.travel && from ? `${spoken(arrival.travel.label)} from ${stopTitle(from)}` : null,
        ...stopWarnings.map((warning) => spoken(warning.detail)),
      ]
        .filter((part): part is string => Boolean(part))
        .map(sentence)
        .join(". "),
    )

    return (
      <li
        key={item.id}
        {...sx(tl.slot, (active || hotId === item.id) && tl.slotRaised)}
        style={{
          top,
          height,
          left: `calc(${(b.lane / b.lanes) * 100}% + 2px)`,
          width: `calc(${100 / b.lanes}% - 4px)`,
        }}
      >
        <button
          type="button"
          aria-label={name}
          aria-describedby={description}
          aria-current={active || undefined}
          {...events(item.id)}
          {...sx(
            a.focusable,
            tl.block,
            stacked && tl.blockStacked,
            b.estimated && tl.blockEstimated,
            runsOn && tl.blockRunsOn,
            hotId === item.id && tl.blockHot,
            active && tl.blockActive,
          )}
        >
          {number ? (
            <span {...sx(tl.badge, stacked && tl.badgeStacked, active && tl.badgeActive)}>{number}</span>
          ) : (
            <span {...sx(tl.disc, stacked && tl.badgeStacked)}>
              <ItemIcon kind={item.kind} category={item.location?.category} reservationType={item.reservation?.type} size={12} strokeWidth={1.75} aria-hidden />
            </span>
          )}
          <span {...sx(tl.time)}>
            {clockLabel(b.start)}
            {b.estimated ? (
              <span {...sx(tl.estimate)} title="Estimated length">
                {" "}
                · ≈ {formatMinutes(minutes)}
              </span>
            ) : (
              ` – ${clockLabel(b.end)}`
            )}
          </span>
          <span {...sx(tl.title, big && tl.titleBig, stacked && tl.wide)} style={{ WebkitLineClamp: lines }}>
            {title}
          </span>
          {showMeta && (
            <span {...sx(tl.meta, stacked && tl.wide)}>
              {number && (
                <ItemIcon kind={item.kind} category={item.location?.category} reservationType={item.reservation?.type} size={12} strokeWidth={1.75} aria-hidden {...sx(tl.noShrink)} />
              )}
              {titleCase(kind)}
            </span>
          )}
          {stopWarnings.length > 0 && (
            <span {...sx(tl.warn, stacked && tl.wide)}>
              <TriangleAlert size={12} strokeWidth={2} aria-hidden {...sx(tl.noShrink)} />
              <span {...sx(tl.warnText)}>
                {stopWarnings[0]!.detail}
                {stopWarnings.length > 1 ? ` · +${stopWarnings.length - 1}` : ""}
              </span>
            </span>
          )}
        </button>
      </li>
    )
  }

  const gap = (g: TimelineGap) => {
    const top = yAt(scale, g.from)
    const tight = g.travel !== undefined && g.travel.minutes > g.to - g.from
    return (
      <div key={`${g.afterId}>${g.beforeId}`} {...sx(tl.gap)} style={{ top, height: yAt(scale, g.to) - top }}>
        <span {...sx(tl.gapLine, tight && tl.gapLineTight)} />
        <span {...sx(tl.gapLabel)}>
          {g.travel && (
            <span {...sx(tl.gapLeg, tight && tl.gapTight)}>
              {tight ? <TriangleAlert size={12} strokeWidth={2} aria-hidden /> : <ModeIcon mode={g.travel.mode} />}
              {g.travel.label}
            </span>
          )}
          {g.free >= FREE_LABEL_MIN && <span {...sx(tl.gapFree)}>{formatMinutes(g.free)} free</span>}
        </span>
      </div>
    )
  }

  const anytimeRow = (id: string) => {
    const item = byId.get(id)
    if (!item) return null
    const number = numbers.get(id) ?? null
    const kind = category(item)
    const toSchedule = parked.has(id)
    const active = activeId === id
    const when = toSchedule ? "To schedule" : "Anytime"
    const name = [when, stopTitle(item), kind, number ? `stop ${number}` : null].filter(Boolean).join(", ")
    return (
      <li key={id}>
        <button
          type="button"
          aria-label={name}
          aria-current={active || undefined}
          {...events(id)}
          {...sx(a.focusable, tl.block, tl.anyRow, hotId === id && tl.blockHot, active && tl.blockActive)}
        >
          {number ? (
            <span {...sx(tl.badge, active && tl.badgeActive)}>{number}</span>
          ) : (
            <span {...sx(tl.disc)}>
              <ItemIcon kind={item.kind} category={item.location?.category} reservationType={item.reservation?.type} size={12} strokeWidth={1.75} aria-hidden />
            </span>
          )}
          <span {...sx(tl.text)}>
            <span {...sx(tl.anyTitle)}>{stopTitle(item)}</span>
            {(kind || toSchedule) && (
              <span {...sx(tl.meta)}>
                {[kind ? titleCase(kind) : null, toSchedule ? "To schedule" : null].filter(Boolean).join(" · ")}
              </span>
            )}
          </span>
        </button>
      </li>
    )
  }

  const blocks = layout.blocks.map(block)
  const gaps = layout.gaps.filter(labelled).map(gap)

  return (
    <section ref={rootRef} aria-label={`Day ${dayNumber} timeline`} onKeyDown={onKeyDown} {...sx(tl.root)}>
      {layout.blocks.length === 0 ? (
        <p {...sx(tl.empty)}>
          {layout.untimed.length > 0
            ? "Stops with a start time appear on the timeline; the rest wait under Anytime."
            : "Nothing on the clock yet. Stops with a start time appear on the timeline."}
        </p>
      ) : (
        <>
          <p {...sx(tl.summary)}>
            <span>{plural(layout.blocks.length, "stop")} on the clock</span>
            {free > 0 && <span>{formatMinutes(free)} free</span>}
            {layout.conflicts.length > 0 && (
              <span {...sx(tl.summaryWarn)}>
                <TriangleAlert size={12} strokeWidth={2} aria-hidden />
                {layout.conflicts.length} to check
              </span>
            )}
            {nowAt !== null && <span {...sx(a.srOnly)}>Now {clockLabel(nowAt)}</span>}
          </p>
          <div {...sx(tl.ruler)}>
            <div {...sx(tl.canvas)} style={{ height: scale.height }}>
              {hours.map((t) => (
                <div key={t} aria-hidden>
                  <span {...sx(tl.hourRule)} style={{ top: yAt(scale, t) }} />
                  <span {...sx(tl.hourLabel)} style={{ top: yAt(scale, t) }}>
                    {hourLabel(t)}
                  </span>
                  {t + 30 < layout.end && <span {...sx(tl.halfTick)} style={{ top: yAt(scale, t + 30) }} />}
                </div>
              ))}
              <div {...sx(tl.track)} aria-hidden>
                {gaps}
              </div>
              <ol {...sx(tl.track)} aria-label={`${plural(layout.blocks.length, "stop")} on the clock`}>
                {blocks}
              </ol>
              {nowAt !== null && (
                <div aria-hidden>
                  <span {...sx(tl.now)} style={{ top: yAt(scale, nowAt) }} />
                  <span {...sx(tl.nowLabel)} style={{ top: yAt(scale, nowAt) }}>
                    Now
                  </span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {layout.untimed.length > 0 && (
        <section aria-labelledby={anytimeHeading} {...sx(tl.anytime)}>
          <h3 id={anytimeHeading} {...sx(a.eyebrow)}>
            Anytime
          </h3>
          <ul {...sx(tl.anyList)}>{layout.untimed.map(anytimeRow)}</ul>
        </section>
      )}

      <div hidden>
        {descriptions.map((d) => (
          <span key={d.id} id={d.id}>
            {d.text}
          </span>
        ))}
      </div>
    </section>
  )
}
