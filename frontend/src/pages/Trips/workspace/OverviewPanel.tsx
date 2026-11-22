import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, ChevronRight, ClipboardPaste, PenLine, Plus, Sparkles } from "lucide-react"
import { sx } from "@/styles/merge"
import { formatTripDate, STATUS_LABEL, titleCase, todayIsoIn } from "../meta"
import { dayRoute, distanceMeters, isLocated } from "../map/geo"
import { walkingStat } from "../reservationView"
import type { EnhancementRun, ItineraryItem, Trip } from "../types"
import { Menu, type MenuItem } from "../components/kit"
import { Presence } from "../components/presence"
import { ItemIcon } from "../ItemIcon"
import { AddBookingDialog } from "../bookings/AddBookingDialog"
import { bookingsInOrder } from "../bookings/addBookings"
import { BookingSummaryLines } from "../bookings/BookingSummary"
import { bk } from "../bookings/bookings.stylex"
import { bookingWhen } from "../bookings/lines"
import { Parts } from "./Parts"
import type { DayOption } from "../useTripEditor"
import { a } from "../atlas.stylex"
import { ws as s } from "../workspace.stylex"
import type { DayForecast } from "../forecast"
import type { TypicalDay } from "../climate"
import { ForecastChip } from "./ForecastChip"
import { NowCard, type UpdateDay } from "../live/NowCard"
import { AiBusy, BriefFields, EMPTY_BRIEF, LONG_DRAFT_HINT, SuggestionsReview, type DraftBrief, type ReviewProgress } from "./AiPanels"

/** The longest leg counted as walked. */
const WALKABLE_M = 1_600

export function OverviewPanel({
  trip,
  basePath,
  editable,
  locked,
  drafting,
  enhancing,
  progress,
  applying,
  run,
  skipReasons,
  dayOptions,
  onDraft,
  onHoverDay,
  onApplyRun,
  onDismissRun,
  onStopAi,
  forecast,
  typical,
  onAddBooking,
  onPasteBookings,
  onUpdateDay,
  onOpenRecap,
}: {
  trip: Trip
  /** dayId → live forecast, for days in the forecast window. */
  forecast?: ReadonlyMap<string, DayForecast>
  /** dayId → the weather typical of the date, for days past the forecast's reach. */
  typical?: ReadonlyMap<string, TypicalDay>
  basePath: string
  editable: boolean
  locked: boolean
  drafting: boolean
  /** A review is running, whichever part of the trip it covers. */
  enhancing: boolean
  /** Where that review is in the server's queue (`reviewProgress`); without it the busy line steps through its copy. */
  progress?: ReviewProgress
  applying: boolean
  run: EnhancementRun | null
  /** Why suggestions of `run` couldn’t be applied, by id. */
  skipReasons?: Readonly<Record<string, string>>
  dayOptions: DayOption[]
  onDraft: (brief: DraftBrief) => void
  /** Hovering a day row lifts that day's pin on the map. */
  onHoverDay: (dayId: string | null) => void
  onApplyRun: (ids: string[]) => void
  onDismissRun: () => void
  onStopAi: () => void
  /** "Enter by hand": add this booking to the day and open it in the day's editor. */
  onAddBooking?: (dayId: string, item: ItineraryItem) => void
  /** "Paste a confirmation": open the paste sheet. */
  onPasteBookings?: () => void
  /** The Now card's Done, Skip and Running late: change one day. */
  onUpdateDay?: UpdateDay
  /** The after-trip card's "See your recap". */
  onOpenRecap?: () => void
}) {
  const [brief, setBrief] = useState<DraftBrief>(EMPTY_BRIEF)
  const [handOpen, setHandOpen] = useState(false)
  const today = todayIsoIn(trip.timezone)
  const stats = useMemo(() => {
    let pinned = 0
    let stops = 0
    let bookings = 0
    let meters = 0
    for (const day of trip.days) {
      pinned += day.items.filter(isLocated).length
      bookings += day.items.filter((i) => i.kind === "reservation").length
      stops += day.items.filter((i) => i.kind !== "section" && i.kind !== "note").length
      // Only legs short enough to walk: a taxi, train or flight is not "on foot".
      const route = dayRoute(day)
      for (let i = 1; i < route.length; i++) {
        const leg = distanceMeters(route[i - 1]!, route[i]!)
        if (leg <= WALKABLE_M) meters += leg
      }
    }
    return { pinned, stops, bookings, meters }
  }, [trip.days])
  const cities = new Set(trip.days.map((d) => d.city).filter(Boolean)).size
  const multiCity = cities > 1
  const empty = trip.days.every((d) => d.items.length === 0)
  const bookings = useMemo(() => bookingsInOrder(trip.days), [trip.days])
  const addItems: MenuItem[] = [
    ...(onPasteBookings ? [{ label: "Paste a confirmation", icon: <ClipboardPaste size={16} strokeWidth={1.75} aria-hidden />, onSelect: onPasteBookings, disabled: locked }] : []),
    ...(onAddBooking ? [{ label: "Enter by hand", icon: <PenLine size={16} strokeWidth={1.75} aria-hidden />, onSelect: () => setHandOpen(true), disabled: locked }] : []),
  ]
  const canAdd = editable && addItems.length > 0
  const description = trip.appearance?.headline ?? trip.description ?? trip.appearance?.subtitle

  return (
    <div {...sx(s.content)}>
      <NowCard
        trip={trip}
        basePath={basePath}
        forecast={forecast}
        canEdit={editable && !locked}
        onUpdateDay={onUpdateDay}
        onOpenRecap={onOpenRecap}
      />
      {description && <p {...sx(a.body, a.wrap)}>{description}</p>}

      <dl {...sx(s.stats)}>
        {[
          { label: "Places", value: String(stats.stops), unit: "" },
          // Only worth a tile when some stops still need a pin.
          stats.pinned < stats.stops
            ? { label: "On the map", value: String(stats.pinned), unit: `of ${stats.stops}` }
            : cities > 1
              ? { label: "Cities", value: String(cities), unit: "" }
              : { label: "Days", value: String(trip.days.length), unit: "" },
          { label: "Bookings", value: String(stats.bookings), unit: "" },
          { label: "Walking", ...walkingStat(stats.meters) },
        ].map((stat, i) => (
          <div key={stat.label} {...sx(s.stat, i === 0 && s.statFirst, i === 2 && s.statRowStart, i >= 2 && s.statSecondRow)}>
            <dt {...sx(a.eyebrow)}>{stat.label}</dt>
            <dd {...sx(s.statValue)} style={{ margin: 0 }}>
              {stat.value}
              {stat.unit && <span {...sx(a.mono, a.muted)}> {stat.unit}</span>}
            </dd>
          </div>
        ))}
      </dl>

      {drafting && (
        <AiBusy
          steps={["Reading up on the area…", "Choosing places worth the detour…", "Arranging each day so the route flows…", "Pinning everything to the map…"]}
          hint={trip.days.length > 4 ? LONG_DRAFT_HINT : undefined}
          onStop={onStopAi}
        />
      )}
      {enhancing && (
        <AiBusy
          steps={["Reading the whole itinerary…", "Checking pacing and routes…", "Scouting what’s missing…", "Writing up suggestions…"]}
          progress={progress}
          onStop={onStopAi}
        />
      )}
      {run && !enhancing && (
        <SuggestionsReview run={run} trip={trip} skipReasons={skipReasons} dayOptions={dayOptions} applying={applying} onApply={onApplyRun} onDismiss={onDismissRun} />
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

      <section aria-labelledby="days-title">
        <div {...sx(s.sectionHead)}>
          <h2 id="days-title" {...sx(a.display, s.sectionTitle)}>
            Day by day
          </h2>
        </div>
        <ol {...sx(s.dayList)}>
          {trip.days.map((day, index) => {
            const stops = day.items.filter((i) => i.kind !== "section" && i.title)
            const preview = stops.slice(0, 3).map((i) => i.title)
            return (
              <li key={day.id}>
                <Link
                  to={`${basePath}/day/${day.id}`}
                  {...sx(s.dayRow)}
                  onMouseEnter={() => onHoverDay(day.id)}
                  onMouseLeave={() => onHoverDay(null)}
                  onFocus={() => onHoverDay(day.id)}
                  onBlur={() => onHoverDay(null)}
                >
                  <span {...sx(s.dayDate, day.date === today && s.dayDateToday)}>
                    <span {...sx(a.mono)} style={{ fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      {day.date === today ? "Today" : formatTripDate(day.date, trip.timezone, { weekday: "short", month: undefined, day: undefined })}
                    </span>
                    <span {...sx(s.dayDateNum)}>
                      {formatTripDate(day.date, trip.timezone, { weekday: undefined, month: undefined, day: "numeric" })}
                    </span>
                  </span>
                  <span {...sx(a.stack)} style={{ gap: "0.1875rem" }}>
                    <span {...sx(s.dayRowTitle, s.dayRowTitleClamp)}>{day.title || `Day ${index + 1}`}</span>
                    <span {...sx(a.small, a.truncate)}>
                      {preview.length > 0
                        ? `${preview.join(" · ")}${stops.length > preview.length ? ` · +${stops.length - preview.length}` : ""}`
                        : editable
                          ? "Nothing yet. Open to add stops."
                          : "Nothing planned"}
                    </span>
                  </span>
                  <span {...sx(a.row)}>
                    {(() => {
                      const live = forecast?.get(day.id)
                      if (live) return <ForecastChip forecast={live} />
                      const usual = typical?.get(day.id)
                      return usual ? <ForecastChip typical={usual} /> : null
                    })()}
                    {day.city && multiCity && <span {...sx(a.chip)}>{day.city}</span>}
                    <ChevronRight size={18} strokeWidth={1.75} aria-hidden {...sx(a.muted)} />
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      </section>

      {(bookings.length > 0 || canAdd) && (
        <section aria-labelledby="bookings-title">
          <div {...sx(s.sectionHead)}>
            <h2 id="bookings-title" {...sx(a.display, s.sectionTitle)}>
              Bookings
            </h2>
            <span {...sx(a.row)}>
              {bookings.length > 0 && <span {...sx(a.mono, a.muted)}>{bookings.length}</span>}
              {canAdd && (
                <Menu
                  label="Add booking"
                  items={addItems}
                  triggerStyle={[a.btn, a.btnSecondary, a.btnSm]}
                  trigger={
                    <>
                      <Plus size={14} strokeWidth={2} aria-hidden />
                      Add booking
                    </>
                  }
                />
              )}
            </span>
          </div>
          {bookings.length === 0 ? (
            <p {...sx(a.small, bk.empty)}>Flights, stays, cars and tables you’ve booked show up here, in the order they happen.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {bookings.map(({ day, item }) => (
                <li key={item.id}>
                  <Link to={`${basePath}/day/${day.id}#item-${item.id}`} {...sx(s.booking)}>
                    <span {...sx(s.iconTile)}>
                      <ItemIcon kind="reservation" reservationType={item.reservation?.type} size={16} strokeWidth={1.75} aria-hidden />
                    </span>
                    <span {...sx(bk.rowText)}>
                      <span {...sx(s.dayRowTitle, a.wrap)}>{item.title || "Untitled booking"}</span>
                      <span {...sx(bk.rowWhen)}>
                        <Parts parts={[...bookingWhen(item, day), item.reservation?.confirmation?.trim() ?? ""]} />
                      </span>
                      <BookingSummaryLines item={item} trip={trip} day={day} />
                    </span>
                    {/* The day list's status chip: mono outline, never green. */}
                    <span {...sx(a.chip, a.chipOutline, a.chipMono)}>
                      {item.reservation?.status === "confirmed" || item.status === "booked" ? STATUS_LABEL.booked : titleCase(item.reservation?.status ?? "pending")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <Presence when={handOpen}>{() => onAddBooking && <AddBookingDialog trip={trip} onClose={() => setHandOpen(false)} onAdd={onAddBooking} />}</Presence>
    </div>
  )
}
