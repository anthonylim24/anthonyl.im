import { lazy, Suspense, useMemo } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { Globe2, Images, Map as MapIcon, Settings2 } from "lucide-react"
import { EntityIndexProvider } from "../Korea/entityIndex"
import { LinkifiedText } from "../Korea/LinkifiedText"
import { ACCENT, collaboratorSummary, daysUntilIn, formatTripDate, resolveAccent, todayIsoIn, visibleTags } from "./theme"
import { NextDeparture } from "./components/NextDeparture"
import { SectionHeading } from "./components/SectionHeading"
import { StatusChip } from "./components/StatusChip"
import { AppearancePanel } from "./editor/AppearancePanel"
import { DayCard } from "./editor/DayCard"
import { DayNavigation } from "./editor/DayNavigation"
import { EnhanceButton } from "./editor/EnhanceButton"
import { ExtractedPlacesLibrary } from "./ExtractedPlacesLibrary"
import { EditorDock, EditorNotice, FloatingSaveIndicator, UndoToast } from "./editor/FloatingSaveIndicator"
import { GeneratePanel } from "./editor/GeneratePanel"
import { SuggestionsPanel } from "./editor/SuggestionsPanel"
import { TripStatusSelect } from "./editor/TripStatusSelect"
import { TripClock } from "./components/TripClock"
import { upcomingReservations } from "./reservationView"
import { isMissingTripError, TripsNotFound } from "./TripsNotFound"
import { useTripEditor } from "./useTripEditor"
import type { Trip } from "./types"
import {
  EASE,
  REVEAL_DURATION,
  alertErrorClass,
  chipBtnClass,
  dataTableClass,
  dataTdClass,
  dataThClass,
  bandBtnClass,
  coverBandClass,
  documentClass,
  focusRingClass,
  focusRingInsetClass,
  inkBtnClass,
  inlineLinkClass,
  mutedInkClass,
  overlayHoverClass,
  revealDelay,
  wrapAnywhereClass,
} from "./ui"

const MapModeOverlay = lazy(() =>
  import("../Korea/MapModeOverlay").then((m) => ({ default: m.MapModeOverlay })),
)

const gutterClass = documentClass

export function TripOverview() {
  const editor = useTripEditor()
  const reduce = useReducedMotion()
  const [searchParams] = useSearchParams()
  const openIngest = searchParams.get("ingest") === "1"

  if (editor.state.status === "loading") {
    return (
      <div className={gutterClass} role="status" aria-label="Loading trip">
        <div className="h-4 w-48 animate-pulse rounded bg-stone-200/60 dark:bg-stone-900" />
        <div className="mt-8 h-16 w-3/4 max-w-xl animate-pulse rounded-2xl bg-stone-200/60 dark:bg-stone-900" />
        <div className="mt-10 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-stone-200/60 dark:bg-stone-900" />
          ))}
        </div>
      </div>
    )
  }

  if (editor.state.status === "error" || !editor.trip) {
    if (editor.state.status === "error" && isMissingTripError(editor.state.message)) return <TripsNotFound />
    return (
      <div className={gutterClass}>
        <div className={alertErrorClass} role="alert">
          <p className={`min-w-0 ${wrapAnywhereClass}`}>
            Couldn’t open this trip. Check your connection, then try again.
            {editor.state.status === "error" ? ` (${editor.state.message})` : ""}
          </p>
          <Link to="/trips" className={`mt-1 font-semibold ${inlineLinkClass}`}>
            Back to all trips
          </Link>
        </div>
      </div>
    )
  }

  const { trip, editable, editorLocked } = editor
  const a = ACCENT
  const today = todayIsoIn(trip.timezone)
  const todayDay = trip.days.find((d) => d.date === today)
  const mapHeroDay =
    todayDay ?? trip.days.find((d) => d.items.some((i) => i.location?.lat != null && i.location?.lng != null))
  const tMinus = daysUntilIn(trip.startDate, trip.timezone)
  const inTrip = today >= trip.startDate && today <= trip.endDate
  const past = today > trip.endDate
  const dayCount = trip.days.length
  const statusLine = inTrip
    ? `Day ${trip.days.findIndex((d) => d.date === today) + 1 || 1} of ${dayCount}`
    : past
      ? "Concluded"
      : tMinus === 0
        ? "Departing today"
        : tMinus === 1
          ? "1 day to go"
          : `${Math.max(tMinus, 0)} days to go`
  const next = upcomingReservations(trip.days, today)[0]
  const hotels = trip.days.flatMap((day) =>
    day.items.filter((i) => i.kind === "reservation" && i.reservation?.type === "hotel"),
  )
  const neighborhoods = [...new Set(trip.days.flatMap((d) => d.neighborhoods ?? []))]
  const tags = visibleTags(trip.tags)
  const mapDay = editor.mapDayId ? trip.days.find((d) => d.id === editor.mapDayId) : null
  const mapDayIndex = mapDay ? trip.days.findIndex((d) => d.id === mapDay.id) : -1
  const fadeUp = (step: number) => ({
    initial: reduce ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: REVEAL_DURATION, ease: EASE, delay: revealDelay(step) },
  })

  return (
    <EntityIndexProvider>
      <div data-trip-accent={resolveAccent(trip.appearance?.accent)}>
        <header className={coverBandClass}>
          <div className="mx-auto max-w-5xl">
            <motion.div {...fadeUp(0)} className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[color:var(--trips-band-ink)]/80">
              <span className="inline-flex items-center gap-2 text-[13px] font-medium text-[color:var(--trips-band-ink)]">
                {statusLine}
              </span>
              <TripClock timezone={trip.timezone} tone="band" />
              <TripStatusSelect
                status={trip.status}
                editable={editable}
                disabled={editorLocked}
                onChange={(status) => editor.scheduleSave({ ...trip, status })}
              />
            </motion.div>

            <motion.div {...fadeUp(1)} className="mt-5">
              {editable ? (
                <>
                  <label className="sr-only" htmlFor="trip-editor-name">
                    Trip name
                  </label>
                  <input
                    id="trip-editor-name"
                    disabled={editorLocked}
                    className={`font-display trip-display-input min-h-11 w-full bg-transparent text-4xl font-semibold leading-none tracking-tight text-[color:var(--trips-band-ink)] placeholder:text-[color:var(--trips-band-ink)]/40 focus:outline-none sm:text-6xl ${focusRingClass} ${wrapAnywhereClass}`}
                    value={trip.name}
                    onChange={(e) => editor.scheduleSave({ ...trip, name: e.target.value })}
                  />
                </>
              ) : (
                <h1>
                  <span className={`font-display block text-4xl font-semibold leading-none tracking-tight sm:text-6xl ${wrapAnywhereClass}`}>
                    {trip.name}
                  </span>
                </h1>
              )}
              <p className={`mt-3 max-w-[58ch] text-sm text-[color:var(--trips-band-ink)]/75 ${wrapAnywhereClass}`}>
                {trip.destinations.join(" · ")}
                {" · "}
                {formatTripDate(trip.startDate, trip.timezone)} to {formatTripDate(trip.endDate, trip.timezone)}
                {trip.collaborators.length > 0 ? ` · ${collaboratorSummary(trip.collaborators)}` : ""}
              </p>
              {(trip.appearance?.subtitle || trip.appearance?.headline || trip.description) && (
                <p className={`mt-3 max-w-[58ch] text-sm leading-relaxed text-[color:var(--trips-band-ink)]/75 ${wrapAnywhereClass}`}>
                  <LinkifiedText>
                    {trip.appearance?.headline ?? trip.appearance?.subtitle ?? trip.description ?? ""}
                  </LinkifiedText>
                </p>
              )}
            </motion.div>

            {next && (
              <motion.div {...fadeUp(2)}>
                <NextDeparture
                  item={next.item}
                  day={next.day}
                  timezone={trip.timezone}
                  to={`/trips/${trip.slug ?? trip.id}/day/${next.day.id}#item-${next.item.id}`}
                  tone="band"
                />
              </motion.div>
            )}

            {tags.length > 0 && (
              <ul className="mt-5 flex flex-wrap gap-1.5" aria-label="Tags">
                {tags.map((tag) => (
                  <li
                    key={tag}
                    className={`rounded-sm border border-[color:var(--trips-band-ink)]/25 px-2 py-0.5 text-xs text-[color:var(--trips-band-ink)]/80 ${wrapAnywhereClass}`}
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            )}

            {mapHeroDay && (
              <motion.div {...fadeUp(3)} className="mt-6">
                <button type="button" onClick={() => editor.openMap(mapHeroDay.id)} className={bandBtnClass}>
                  <MapIcon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  Map Mode
                </button>
              </motion.div>
            )}
          </div>
        </header>

        <div className={documentClass}>
        <DayNavigation days={trip.days} timezone={trip.timezone} />
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link to={`/trips/${trip.slug ?? trip.id}/places`} className={chipBtnClass}>
            <Images className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            Places
          </Link>
          {editable && trip.status === "draft" && (
            <button type="button" disabled={editorLocked} onClick={editor.publish} className={inkBtnClass}>
              <Globe2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Publish
            </button>
          )}
          {editable && (
            <EnhanceButton
              label="Enhance trip"
              busyLabel="Reviewing trip…"
              busy={editor.enhancingTarget === "trip"}
              disabled={editorLocked}
              variant="outline"
              promptPlaceholder="Optional focus, e.g. “tighten the pacing and add more local food”"
              onRun={(prompt) => void editor.runEnhance("trip", undefined, prompt)}
            />
          )}
          {editable && (
            <a href="#trip-settings" className={chipBtnClass}>
              <Settings2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
              Settings
            </a>
          )}
        </div>

        {todayDay && (
          <aside className={`mt-6 rounded-lg ${a.softBg}`}>
            <Link
              to={`/trips/${trip.slug ?? trip.id}/day/${todayDay.id}`}
              className={`group flex items-center gap-4 px-3 py-3 transition-colors ${overlayHoverClass} ${focusRingInsetClass}`}
            >
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
                <p className={`flex items-center gap-2 text-[13px] font-medium ${a.text}`}>
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden />
                  Today · {formatTripDate(todayDay.date, trip.timezone)}
                </p>
                <p className={`text-sm font-semibold text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}>
                  {todayDay.emoji && <span aria-hidden className="mr-1.5">{todayDay.emoji}</span>}
                  Day {trip.days.indexOf(todayDay) + 1}
                  {todayDay.title ? `, ${todayDay.title}` : ""}
                </p>
              </div>
            </Link>
          </aside>
        )}

        {editable && trip.days.every((d) => d.items.length === 0) && (
          <div className="mt-6">
            <GeneratePanel
              getToken={editor.readToken}
              tripId={trip.id}
              locked={editorLocked}
              initialPrompt={editor.navState?.retryGenerate?.prompt}
              preferences={editor.navState?.retryGenerate?.preferences}
              onGenerated={(nextTrip) => {
                editor.cancelPendingSave()
                editor.setTrip(nextTrip)
                editor.setSaveState("saved")
                editor.setNotice(null)
              }}
            />
          </div>
        )}

        {editor.activeRun && editor.activeRun.scope === "trip" && (
          <div className="mt-6">
            <SuggestionsPanel
              run={editor.activeRun}
              dayOptions={editor.dayOptions}
              onApply={editor.applyActiveRun}
              onDismiss={editor.dismissRun}
            />
          </div>
        )}

        {editable && (
          <div className="mt-6">
            <ExtractedPlacesLibrary
              trip={trip}
              locked={editorLocked}
              defaultDayId={editor.routerLocation.hash.replace(/^#/, "") || undefined}
              onDaysChange={editor.setDays}
            />
          </div>
        )}

        <section className="mt-10">
          <SectionHeading
            title="Itinerary"
            subtitle={
              dayCount === 0
                ? "No days yet. Add dates in settings, then build the days."
                : editable
                  ? "Edit in place. Open a day for the in-trip view and Map Mode."
                  : "Open a day for reservations, places, and Map Mode."
            }
          />
          {dayCount === 0 ? (
            <div className={`mt-4 border border-dashed border-stone-300 px-5 py-8 text-sm dark:border-stone-700 ${mutedInkClass}`}>
              This trip has no days yet.
            </div>
          ) : (
            <div>
              <div data-testid="trip-itinerary" className="min-w-0 flex-1 space-y-3">
                {trip.days.map((day, idx) => (
                  <DayCard
                    key={day.id}
                    trip={trip}
                    day={day}
                    index={idx}
                    timezone={trip.timezone}
                    editable={editable}
                    locked={editorLocked}
                    dayOptions={editor.dayOptions}
                    enhancing={editor.enhancingTarget === day.id}
                    recentIds={editor.recentIds}
                    run={
                      editor.activeRun && editor.activeRun.scope === "day" && editor.activeRun.dayId === day.id
                        ? editor.activeRun
                        : null
                    }
                    onApplyRun={editor.applyActiveRun}
                    onDismissRun={editor.dismissRun}
                    onChange={editor.setDays}
                    onOpenMap={editor.openMap}
                    onEnhance={editor.enhanceDay}
                    onDeleteItem={editor.deleteItem}
                    ingestAnchor={idx === 0}
                    ingestOpen={idx === 0 && openIngest}
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        {(hotels.length > 0 || neighborhoods.length > 0) && (
          <section className="mt-12">
            <SectionHeading title="Stays" subtitle="Hotels and neighborhoods on this trip." />
            {hotels.length > 0 && (
              <ul className="mt-4 divide-y divide-stone-200/80 dark:divide-stone-800/80">
                {hotels.map((item) => (
                  <li key={item.id} className={`py-3 text-sm text-stone-800 dark:text-stone-200 ${wrapAnywhereClass}`}>
                    {item.title}
                    {item.location?.address ? (
                      <span className={`mt-0.5 block text-xs ${mutedInkClass}`}>{item.location.address}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {neighborhoods.length > 0 && (
              <p className={`mt-4 text-sm ${mutedInkClass} ${wrapAnywhereClass}`}>{neighborhoods.join(" · ")}</p>
            )}
          </section>
        )}

        <ReservationLedger trip={trip} today={today} past={past} />

        {editable && (
          <section id="trip-settings" aria-label="Trip settings" className="mt-12 pb-2">
            <p className={`text-[13px] font-medium ${mutedInkClass}`}>Trip settings</p>
            <AppearancePanel
              trip={trip}
              locked={editorLocked}
              onChange={(appearance) => editor.scheduleSave({ ...trip, appearance })}
              onSlugChange={(slug) => editor.scheduleSave({ ...trip, slug })}
            />
          </section>
        )}

        <EditorDock>
          <EditorNotice notice={editor.notice} onDismiss={() => editor.setNotice(null)} />
          <UndoToast undo={editor.deleted} onUndo={editor.undoDelete} />
          <FloatingSaveIndicator saveState={editor.saveState} />
        </EditorDock>
        </div>

        {mapDay && (
          <Suspense
            fallback={
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 text-sm text-stone-300"
                role="status"
              >
                Loading map…
              </div>
            }
          >
            <MapModeOverlay
              daySlug={mapDay.id}
              dayTitle={mapDay.title ?? `Day ${mapDayIndex + 1}`}
              placesUrl={`/api/trips/${encodeURIComponent(trip.id)}/days/${encodeURIComponent(mapDay.id)}/places`}
              onClose={() => editor.setMapDayId(null)}
            />
          </Suspense>
        )}
      </div>
    </EntityIndexProvider>
  )
}

function ReservationLedger({
  trip,
  today,
  past,
}: {
  trip: Trip
  today: string
  past: boolean
}) {
  const rows = useMemo(
    () =>
      trip.days.flatMap((day) =>
        day.items.filter((i) => i.kind === "reservation").map((item) => ({ day, item })),
      ),
    [trip.days],
  )
  if (rows.length === 0) return null
  return (
    <section id="reservations" className="mt-12 pb-4">
      <SectionHeading title="Reservations" subtitle="Bookings across the trip." />
      <table className={dataTableClass}>
        <caption className="sr-only">Reservations</caption>
        <thead>
          <tr>
            <th scope="col" className={dataThClass}>
              Date
            </th>
            <th scope="col" className={dataThClass}>
              Time
            </th>
            <th scope="col" className={dataThClass}>
              Booking
            </th>
            <th scope="col" className={dataThClass}>
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ day, item }) => {
            const elapsed = day.date < today && !past
            return (
              <tr key={item.id} className={elapsed ? "opacity-60" : undefined}>
                <td className={`${dataTdClass} whitespace-nowrap tabular-nums ${mutedInkClass}`}>
                  {formatTripDate(day.date, trip.timezone, { weekday: undefined })}
                </td>
                <td className={`${dataTdClass} whitespace-nowrap font-display tabular-nums ${mutedInkClass}`}>
                  {item.time ?? "–"}
                </td>
                <td className={dataTdClass}>
                  <Link
                    to={`/trips/${trip.slug ?? trip.id}/day/${day.id}#item-${item.id}`}
                    className={`font-medium text-stone-900 dark:text-stone-100 ${focusRingClass} ${wrapAnywhereClass}`}
                  >
                    {item.title}
                  </Link>
                  {item.notes && (
                    <p className={`mt-0.5 text-[13px] ${mutedInkClass} ${wrapAnywhereClass}`}>{item.notes}</p>
                  )}
                </td>
                <td className={dataTdClass}>
                  <StatusChip status={item.status} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
