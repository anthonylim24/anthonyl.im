import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, ChevronRight, Sparkles } from "lucide-react"
import { sx } from "@/styles/merge"
import { formatClock, formatTripDate, itemIcon, plural, todayIsoIn } from "../meta"
import { dayRoute, isLocated, routeMeters } from "../map/geo"
import { formatDistance, upcomingReservations } from "../reservationView"
import type { EnhancementRun, Trip } from "../types"
import type { DayOption } from "../useTripEditor"
import { a } from "../atlas.stylex"
import { ws as s } from "../workspace.stylex"
import { AiBusy, BriefFields, EMPTY_BRIEF, SuggestionsReview, type DraftBrief } from "./AiPanels"

export function OverviewPanel({
  trip,
  basePath,
  editable,
  locked,
  drafting,
  enhancing,
  applying,
  run,
  dayOptions,
  onDraft,
  onApplyRun,
  onDismissRun,
}: {
  trip: Trip
  basePath: string
  editable: boolean
  locked: boolean
  drafting: boolean
  enhancing: boolean
  applying: boolean
  run: EnhancementRun | null
  dayOptions: DayOption[]
  onDraft: (brief: DraftBrief) => void
  onApplyRun: (ids: string[]) => void
  onDismissRun: () => void
}) {
  const [brief, setBrief] = useState<DraftBrief>(EMPTY_BRIEF)
  const today = todayIsoIn(trip.timezone)
  const stats = useMemo(() => {
    let pinned = 0
    let bookings = 0
    let meters = 0
    for (const day of trip.days) {
      pinned += day.items.filter(isLocated).length
      bookings += day.items.filter((i) => i.kind === "reservation").length
      const route = dayRoute(day)
      const length = routeMeters(route)
      // City-scale days only: a flight shouldn't count as "walking the route".
      if (length < 60_000) meters += length
    }
    return { pinned, bookings, meters }
  }, [trip.days])
  const empty = trip.days.every((d) => d.items.length === 0)
  const bookings = useMemo(
    () => trip.days.flatMap((day) => day.items.filter((i) => i.kind === "reservation").map((item) => ({ day, item }))),
    [trip.days],
  )
  const nextUp = today <= trip.endDate ? upcomingReservations(trip.days, today)[0] : undefined
  const description = trip.appearance?.headline ?? trip.description ?? trip.appearance?.subtitle

  return (
    <div {...sx(s.content)}>
      {description && <p {...sx(a.body, a.wrap)}>{description}</p>}

      <dl {...sx(s.stats)}>
        {[
          { label: "Days", value: String(trip.days.length) },
          { label: "Pinned", value: String(stats.pinned) },
          { label: "Bookings", value: String(stats.bookings) },
          { label: "On foot", value: stats.meters > 500 ? formatDistance(stats.meters).replace(" km", "") : "–", unit: stats.meters > 500 ? "km" : "" },
        ].map((stat, i) => (
          <div key={stat.label} {...sx(s.stat, i === 0 && s.statFirst)}>
            <dt {...sx(a.eyebrow)}>{stat.label}</dt>
            <dd {...sx(s.statValue)} style={{ margin: 0 }}>
              {stat.value}
              {stat.unit && <span {...sx(a.mono, a.muted)}> {stat.unit}</span>}
            </dd>
          </div>
        ))}
      </dl>

      {drafting && <AiBusy label="AI is drafting your itinerary: places, meals and a route for each day. About a minute." />}
      {enhancing && <AiBusy label="AI is reviewing the whole trip. This can take a minute or two." />}
      {run && !enhancing && (
        <SuggestionsReview run={run} dayOptions={dayOptions} applying={applying} onApply={onApplyRun} onDismiss={onDismissRun} />
      )}

      {empty && editable && !drafting && (
        <section {...sx(s.aiCard)} aria-labelledby="draft-title">
          <p {...sx(a.eyebrow, a.accentText)}>
            <Sparkles size={12} strokeWidth={2} aria-hidden style={{ display: "inline", verticalAlign: "-1px", marginRight: 6 }} />
            Start with a draft
          </p>
          <h2 id="draft-title" {...sx(a.display, s.aiTitle)}>
            Let AI sketch {trip.days.length === 1 ? "the day" : `all ${trip.days.length} days`}
          </h2>
          <p {...sx(a.body)}>
            You get real places pinned on the map, grouped so each day flows. Keep what you like, change the rest.
          </p>
          <BriefFields brief={brief} onChange={setBrief} disabled={locked} />
          <div {...sx(a.rowWrap)}>
            <button type="button" {...sx(a.btn, a.btnPrimary)} disabled={locked} onClick={() => onDraft(brief)}>
              <Sparkles size={16} strokeWidth={1.75} aria-hidden />
              Draft itinerary
            </button>
            {trip.days[0] && (
              <Link to={`${basePath}/day/${trip.days[0].id}`} {...sx(a.btn, a.btnGhost)}>
                I’ll add stops myself
                <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
              </Link>
            )}
          </div>
        </section>
      )}

      {nextUp && (
        <Link to={`${basePath}/day/${nextUp.day.id}#item-${nextUp.item.id}`} {...sx(s.dayRow)}>
          <span {...sx(s.dayDate)}>
            {(() => {
              const Icon = itemIcon("reservation", undefined, nextUp.item.reservation?.type)
              return <Icon size={20} strokeWidth={1.5} aria-hidden />
            })()}
          </span>
          <span {...sx(a.stack)} style={{ gap: "0.125rem" }}>
            <span {...sx(a.eyebrow, a.accentText)}>Next booking</span>
            <span {...sx(s.dayRowTitle, a.truncate)}>{nextUp.item.title}</span>
            <span {...sx(a.small)}>
              {formatTripDate(nextUp.day.date, trip.timezone)}
              {nextUp.item.time ? ` · ${formatClock(nextUp.item.time)}` : ""}
            </span>
          </span>
          <ChevronRight size={18} strokeWidth={1.75} aria-hidden {...sx(a.muted)} />
        </Link>
      )}

      <section aria-labelledby="days-title">
        <div {...sx(s.sectionHead)}>
          <h2 id="days-title" {...sx(a.display, s.sectionTitle)}>
            Day by day
          </h2>
          <span {...sx(a.mono, a.muted)}>{plural(trip.days.length, "day")}</span>
        </div>
        <ol {...sx(s.dayList)}>
          {trip.days.map((day, index) => {
            const stops = day.items.filter((i) => i.kind !== "section" && i.title)
            const preview = stops.slice(0, 3).map((i) => i.title)
            return (
              <li key={day.id}>
                <Link to={`${basePath}/day/${day.id}`} {...sx(s.dayRow)}>
                  <span {...sx(s.dayDate)}>
                    <span {...sx(a.mono)} style={{ fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      {formatTripDate(day.date, trip.timezone, { weekday: "short", month: undefined, day: undefined })}
                    </span>
                    <span {...sx(s.dayDateNum)}>
                      {formatTripDate(day.date, trip.timezone, { weekday: undefined, month: undefined, day: "numeric" })}
                    </span>
                  </span>
                  <span {...sx(a.stack)} style={{ gap: "0.1875rem" }}>
                    <span {...sx(s.dayRowTitle, a.truncate)}>
                      {day.title || `Day ${index + 1}`}
                      {day.date === today && <span {...sx(a.accentText)}> · Today</span>}
                    </span>
                    <span {...sx(a.small, a.truncate)}>
                      {preview.length > 0
                        ? `${preview.join(" · ")}${stops.length > preview.length ? ` · +${stops.length - preview.length}` : ""}`
                        : editable
                          ? "Nothing yet. Open to add stops."
                          : "Nothing planned"}
                    </span>
                  </span>
                  <span {...sx(a.row)}>
                    {day.city && <span {...sx(a.chip)}>{day.city}</span>}
                    <ChevronRight size={18} strokeWidth={1.75} aria-hidden {...sx(a.muted)} />
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      </section>

      {bookings.length > 0 && (
        <section aria-labelledby="bookings-title">
          <div {...sx(s.sectionHead)}>
            <h2 id="bookings-title" {...sx(a.display, s.sectionTitle)}>
              Bookings
            </h2>
            <span {...sx(a.mono, a.muted)}>{bookings.length}</span>
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {bookings.map(({ day, item }) => {
              const Icon = itemIcon("reservation", undefined, item.reservation?.type)
              return (
                <li key={item.id}>
                  <Link to={`${basePath}/day/${day.id}#item-${item.id}`} {...sx(s.booking)}>
                    <span {...sx(s.iconTile)}>
                      <Icon size={16} strokeWidth={1.75} aria-hidden />
                    </span>
                    <span {...sx(a.stack)} style={{ gap: "0.125rem" }}>
                      <span {...sx(s.dayRowTitle, a.truncate)}>{item.title || "Untitled booking"}</span>
                      <span {...sx(a.small, a.truncate)}>
                        {formatTripDate(day.date, trip.timezone)}
                        {item.time ? ` · ${formatClock(item.time)}` : ""}
                        {item.reservation?.confirmation ? ` · ${item.reservation.confirmation}` : ""}
                      </span>
                    </span>
                    <span {...sx(a.chip, item.reservation?.status === "confirmed" || item.status === "booked" ? a.chipOk : undefined)}>
                      {item.reservation?.status === "confirmed" || item.status === "booked" ? "Confirmed" : "Pending"}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
