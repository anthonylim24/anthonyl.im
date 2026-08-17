import { lazy, Suspense, useMemo } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { Globe2, Images, Map as MapIcon, Settings2 } from "lucide-react"
import { EntityIndexProvider } from "../Korea/entityIndex"
import { LinkifiedText } from "../Korea/LinkifiedText"
import { ACCENT, collaboratorSummary, daysUntilIn, formatTripDate, resolveAccent, todayIsoIn, visibleTags } from "./theme"
import { DossierSectionHeader } from "./components/DossierSectionHeader"
import { ItemIcon } from "./components/ItemIcon"
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
import type { ItineraryItem, Trip, TripDay } from "./types"
import {
  EASE,
  REVEAL_DURATION,
  SERIF,
  alertErrorClass,
  chipBtnClass,
  focusRingClass,
  focusRingInsetClass,
  inkBtnClass,
  inlineLinkClass,
  mutedInkClass,
  overlayHoverClass,
  pageClass,
  revealDelay,
  successBtnClass,
  wrapAnywhereClass,
} from "./ui"

const MapModeOverlay = lazy(() =>
  import("../Korea/MapModeOverlay").then((m) => ({ default: m.MapModeOverlay })),
)

const gutterClass = pageClass()

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
        <header className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className={`absolute inset-0 ${a.bloomA} trip-bloom-drift`} />
            <div className={`absolute inset-0 ${a.bloomB}`} />
          </div>
          <div className="relative mx-auto max-w-6xl px-4 pb-6 pt-6 sm:px-6 sm:pb-10 sm:pt-10">
            <motion.p
              {...fadeUp(0)}
              className={`font-mono-trips text-[11px] uppercase tracking-[0.24em] ${mutedInkClass}`}
            >
              {trip.appearance?.eyebrow ?? "Itinerary"} · {dayCount} day{dayCount === 1 ? "" : "s"} ·{" "}
              {formatTripDate(trip.startDate, trip.timezone, { weekday: undefined })} →{" "}
              {formatTripDate(trip.endDate, trip.timezone, { weekday: undefined })}
            </motion.p>

            <motion.div {...fadeUp(1)} className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className={`inline-flex items-center gap-2 text-sm font-medium ${a.text}`}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${a.dot} trip-pulse`} aria-hidden />
                {statusLine}
              </span>
              <TripClock timezone={trip.timezone} />
              <TripStatusSelect
                status={trip.status}
                editable={editable}
                disabled={editorLocked}
                onChange={(status) => editor.scheduleSave({ ...trip, status })}
              />
            </motion.div>

            <motion.div {...fadeUp(2)} className="mt-4">
              {editable ? (
                <>
                  <label className="sr-only" htmlFor="trip-editor-name">
                    Trip name
                  </label>
                  <input
                    id="trip-editor-name"
                    disabled={editorLocked}
                    className={`trip-display-input min-h-11 w-full max-w-[16ch] bg-transparent font-display font-medium leading-[0.98] tracking-[-0.02em] text-stone-900 focus:outline-none dark:text-stone-100 ${focusRingClass} ${wrapAnywhereClass}`}
                    value={trip.name}
                    onChange={(e) => editor.scheduleSave({ ...trip, name: e.target.value })}
                    style={SERIF}
                  />
                </>
              ) : (
                <h1 className="text-stone-900 dark:text-stone-100" style={SERIF}>
                  <span
                    className={`block max-w-[16ch] font-display text-[clamp(2.5rem,7vw,4.25rem)] font-medium leading-[0.98] tracking-[-0.02em] ${wrapAnywhereClass}`}
                  >
                    {trip.name}
                  </span>
                </h1>
              )}
              {(trip.appearance?.subtitle || trip.appearance?.headline || trip.description) && (
                <p
                  className={`mt-4 max-w-[58ch] text-base leading-relaxed text-stone-700 sm:text-[1.05rem] dark:text-stone-300 ${wrapAnywhereClass}`}
                >
                  <LinkifiedText>
                    {trip.appearance?.headline ?? trip.appearance?.subtitle ?? trip.description ?? ""}
                  </LinkifiedText>
                </p>
              )}
            </motion.div>

            <motion.dl
              {...fadeUp(3)}
              className="mt-8 grid grid-cols-1 gap-x-10 gap-y-5 border-t border-stone-200/80 pt-5 sm:grid-cols-2 lg:grid-cols-3 dark:border-stone-800/80"
            >
              <MetaRow label="Destinations" value={trip.destinations.join(" · ")} />
              <MetaRow
                label="Dates"
                value={`${formatTripDate(trip.startDate, trip.timezone)} – ${formatTripDate(trip.endDate, trip.timezone)}`}
              />
              <MetaRow label="Time zone" value={trip.timezone} />
              {trip.collaborators.length > 0 && (
                <MetaRow label="Sharing" value={collaboratorSummary(trip.collaborators)} />
              )}
            </motion.dl>

            {tags.length > 0 && (
              <ul className="mt-5 flex flex-wrap gap-1.5" aria-label="Tags">
                {tags.map((tag) => (
                  <li
                    key={tag}
                    className={`rounded-md border border-stone-200/80 px-2 py-0.5 text-xs dark:border-stone-700 ${mutedInkClass} ${wrapAnywhereClass}`}
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            )}

            <motion.div {...fadeUp(4)} className="mt-7 flex flex-wrap items-center gap-2">
              {todayDay && (
                <button type="button" onClick={() => editor.openMap(todayDay.id)} className={inkBtnClass}>
                  <MapIcon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  Map Mode
                </button>
              )}
              <Link to={`/trips/${trip.slug ?? trip.id}/places`} className={chipBtnClass}>
                <Images className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                Places
              </Link>
              {editable && trip.status === "draft" && (
                <button type="button" disabled={editorLocked} onClick={editor.publish} className={successBtnClass}>
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
                  variant="solid"
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
            </motion.div>
          </div>
        </header>

        {todayDay && (
          <aside className={`border-y ${a.border} ${a.softBg}`}>
            <Link
              to={`/trips/${trip.slug ?? trip.id}/day/${todayDay.id}`}
              className={`group mx-auto flex max-w-6xl items-center gap-4 px-4 py-4 transition-colors sm:px-6 ${overlayHoverClass} ${focusRingInsetClass}`}
            >
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-5 gap-y-1">
                <p className={`flex items-center gap-2 font-mono-trips text-[11px] uppercase tracking-[0.2em] ${a.text}`}>
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden />
                  Today · {formatTripDate(todayDay.date, trip.timezone)}
                </p>
                <p
                  className={`font-display text-lg font-medium text-stone-900 sm:text-xl dark:text-stone-100 ${wrapAnywhereClass}`}
                  style={SERIF}
                >
                  {todayDay.emoji && <span aria-hidden className="mr-2">{todayDay.emoji}</span>}
                  Day {trip.days.indexOf(todayDay) + 1}
                  {todayDay.title ? `, ${todayDay.title}` : ""}
                </p>
              </div>
            </Link>
          </aside>
        )}

        {next && (
          <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
            <Link
              to={`/trips/${trip.slug ?? trip.id}/day/${next.day.id}#item-${next.item.id}`}
              className={`group flex items-start gap-4 border-b border-stone-200/80 px-1 py-4 transition-colors ${overlayHoverClass} ${focusRingClass} dark:border-stone-800`}
            >
              <ItemIcon
                kind={next.item.kind}
                category={next.item.location?.category}
                reservationType={next.item.reservation?.type}
                className="mt-0.5 h-4 w-4 shrink-0 text-stone-500"
              />
              <div className="min-w-0">
                <p className={`font-mono-trips text-[10px] uppercase tracking-[0.16em] ${a.text}`}>Up next</p>
                <p className={`mt-1 font-medium text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}>
                  {next.item.title}
                </p>
                <p className={`mt-0.5 text-sm ${mutedInkClass}`}>
                  {formatTripDate(next.day.date, trip.timezone)}
                  {next.item.time ? ` · ${next.item.time}` : ""}
                </p>
              </div>
            </Link>
          </div>
        )}

        {editable && (
          <section id="trip-settings" aria-label="Trip settings" className="mx-auto mt-8 max-w-6xl px-4 sm:px-6">
            <p className="font-mono-trips text-[11px] uppercase tracking-[0.2em] text-stone-500">Trip settings</p>
            <AppearancePanel
              trip={trip}
              locked={editorLocked}
              onChange={(appearance) => editor.scheduleSave({ ...trip, appearance })}
              onSlugChange={(slug) => editor.scheduleSave({ ...trip, slug })}
            />
          </section>
        )}

        {editable && trip.days.every((d) => d.items.length === 0) && (
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
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
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SuggestionsPanel
              run={editor.activeRun}
              dayOptions={editor.dayOptions}
              onApply={editor.applyActiveRun}
              onDismiss={editor.dismissRun}
            />
          </div>
        )}

        {editable && (
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <ExtractedPlacesLibrary
              trip={trip}
              locked={editorLocked}
              defaultDayId={editor.routerLocation.hash.replace(/^#/, "") || undefined}
              onDaysChange={editor.setDays}
            />
          </div>
        )}

        <section className="mx-auto mt-8 max-w-6xl px-4 sm:mt-12 sm:px-6">
          <DossierSectionHeader
            scale="page"
            animate
            num="01"
            eyebrow={`${dayCount} day${dayCount === 1 ? "" : "s"}`}
            title="Daily itinerary"
            subtitle={
              dayCount === 0
                ? "No days yet. Add dates in settings, then build the days."
                : editable
                  ? "Edit in place. Open a day for the in-trip view and Map Mode."
                  : "Open a day for reservations, places, and Map Mode."
            }
          />
          {dayCount === 0 ? (
            <div className={`mt-8 border border-dashed border-stone-300 px-5 py-10 text-sm dark:border-stone-700 ${mutedInkClass}`}>
              This trip has no days yet.
            </div>
          ) : (
            <div className="mt-6 lg:mt-8 lg:flex lg:items-start lg:gap-8">
              <DayNavigation days={trip.days} timezone={trip.timezone} />
              <div data-testid="trip-itinerary" className="min-w-0 flex-1 space-y-10">
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
          <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
            <DossierSectionHeader
              scale="page"
              animate
              num="02"
              eyebrow="Bases"
              title="Stays and neighborhoods"
              subtitle="Where the trip sleeps and walks."
            />
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

        <ReservationLedger trip={trip} today={today} past={past} reduce={!!reduce} />

        <EditorDock>
          <EditorNotice notice={editor.notice} onDismiss={() => editor.setNotice(null)} />
          <UndoToast undo={editor.deleted} onUndo={editor.undoDelete} />
          <FloatingSaveIndicator saveState={editor.saveState} />
        </EditorDock>

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

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className={`font-mono-trips text-[10px] uppercase tracking-[0.18em] ${mutedInkClass}`}>{label}</dt>
      <dd className={`mt-1 text-sm leading-snug text-stone-800 dark:text-stone-200 ${wrapAnywhereClass}`}>{value}</dd>
    </div>
  )
}

function ReservationLedger({
  trip,
  today,
  past,
  reduce,
}: {
  trip: Trip
  today: string
  past: boolean
  reduce: boolean
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
    <section id="reservations" className="mx-auto mt-16 max-w-6xl px-4 pb-16 sm:px-6">
      <DossierSectionHeader
        scale="page"
        animate
        num="03"
        eyebrow="Booked moments"
        title="Reservations"
        subtitle="Confirmed, pending, and tentative bookings across the trip."
      />
      <ol className="mt-2 divide-y divide-stone-200/80 dark:divide-stone-800/80">
        {rows.map(({ day, item }, i) => (
          <ReservationRow
            key={item.id}
            trip={trip}
            day={day}
            item={item}
            index={i}
            reduce={reduce}
            elapsed={day.date < today && !past}
          />
        ))}
      </ol>
    </section>
  )
}

function ReservationRow({
  trip,
  day,
  item,
  index,
  reduce,
  elapsed,
}: {
  trip: Trip
  day: TripDay
  item: ItineraryItem
  index: number
  reduce: boolean
  elapsed: boolean
}) {
  const dayNum = new Date(`${day.date}T12:00:00Z`).getUTCDate()
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: REVEAL_DURATION, ease: EASE, delay: revealDelay(index) }}
    >
      <Link
        to={`/trips/${trip.slug ?? trip.id}/day/${day.id}#item-${item.id}`}
        className={`group flex items-start gap-5 py-5 transition-colors hover:bg-stone-100/30 sm:gap-8 dark:hover:bg-stone-900/25 ${focusRingClass}`}
      >
        <div className="w-[5.5rem] shrink-0 sm:w-[7rem]">
          <p
            className={`font-display text-3xl font-light leading-none ${elapsed ? mutedInkClass : "text-stone-900 dark:text-stone-100"}`}
            style={SERIF}
          >
            {dayNum}
          </p>
          <p className={`mt-1 font-mono-trips text-[10px] lowercase tracking-[0.14em] ${mutedInkClass}`}>
            {formatTripDate(day.date, trip.timezone, { day: undefined })}
          </p>
          {item.time && <p className={`mt-0.5 font-mono-trips text-[11px] tabular-nums ${mutedInkClass}`}>{item.time}</p>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2.5">
            <ItemIcon
              kind={item.kind}
              category={item.location?.category}
              reservationType={item.reservation?.type}
              className="h-4 w-4 shrink-0 translate-y-0.5 text-stone-500 dark:text-stone-400"
            />
            <h3
              className={`font-display text-xl font-medium leading-snug text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}
              style={SERIF}
            >
              {item.title}
            </h3>
          </div>
          {item.notes && (
            <p className={`mt-1 text-[13px] leading-relaxed ${mutedInkClass} ${wrapAnywhereClass}`}>{item.notes}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-1.5">
          <StatusChip status={item.status} />
        </div>
      </Link>
    </motion.li>
  )
}
