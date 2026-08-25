import { styles } from './trips.stylex'
import { sx } from '@/lib/utils'
import { lazy, Suspense, useMemo } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { Globe2, Images, Map as MapIcon, Settings2 } from "lucide-react"
import { EntityIndexProvider } from "../Korea/entityIndex"
import { LinkifiedText } from "../Korea/LinkifiedText"
import { ACCENT, collaboratorSummary, daysUntilIn, formatTripDate, resolveAccent, todayIsoIn, visibleTags } from "./theme"
import { CoverDock } from "./components/CoverDock"
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
  skeletonClass,
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
  stampChipClass,
  typeDisplayClass,
  typeMetaClass,
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
      <div {...sx(gutterClass)} role="status" aria-label="Loading trip">
        <div {...sx(styles.h4, styles.w48, skeletonClass)} />
        <div {...sx(styles.skeletonMt8, styles.h16, styles.w2_3, styles.maxWXl, skeletonClass)} />
        <div {...sx(styles.mt10, styles.spaceY3)}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} {...sx(styles.h16, skeletonClass)} />
          ))}
        </div>
      </div>
    )
  }

  if (editor.state.status === "error" || !editor.trip) {
    if (editor.state.status === "error" && isMissingTripError(editor.state.message)) return <TripsNotFound />
    return (
      <div {...sx(gutterClass)}>
        <div {...sx(alertErrorClass)} role="alert">
          <p {...sx(styles.minW0, wrapAnywhereClass)}>
            Couldn’t open this trip. Check your connection, then try again.
            {editor.state.status === "error" ? ` (${editor.state.message})` : ""}
          </p>
          <Link to="/trips" {...sx(styles.linkSemiboldMt1, inlineLinkClass)}>
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
        <CoverDock title={trip.name} />
        <header {...sx('cover-band', coverBandClass)}>
          <div {...sx(styles.coverBandInner)}>
            <motion.div
              {...fadeUp(0)}
              {...sx(styles.flexWrapCenterGap3, styles.coverBandMetaRow)}
            >
              <span {...sx(styles.bandMetaRow, typeMetaClass)}>
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

            <motion.div {...fadeUp(1)} {...sx(styles.mt5)}>
              {editable ? (
                <>
                  <label {...sx(styles.srOnly)} htmlFor="trip-editor-name">
                    Trip name
                  </label>
                  <input
                    id="trip-editor-name"
                    disabled={editorLocked}
                    {...sx(
                      'trip-display-input',
                      typeDisplayClass,
                      styles.minH11,
                      styles.wFull,
                      styles.coverBandTitleInput,
                      focusRingClass,
                      wrapAnywhereClass,
                    )}
                    value={trip.name}
                    onChange={(e) => editor.scheduleSave({ ...trip, name: e.target.value })}
                  />
                </>
              ) : (
                <h1>
                  <span {...sx(styles.block, typeDisplayClass, wrapAnywhereClass)}>
                    {trip.name}
                  </span>
                </h1>
              )}
              <p {...sx('cover-extra', styles.coverDescBand, wrapAnywhereClass)}>
                {trip.destinations.join(" · ")}
                {" · "}
                {formatTripDate(trip.startDate, trip.timezone)} to {formatTripDate(trip.endDate, trip.timezone)}
                {trip.collaborators.length > 0 ? ` · ${collaboratorSummary(trip.collaborators)}` : ""}
              </p>
              {(trip.appearance?.subtitle || trip.appearance?.headline || trip.description) && (
                <p {...sx('cover-extra', styles.coverDescBandRelaxed, wrapAnywhereClass)}>
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
              <ul {...sx('cover-extra', styles.coverExtraTags)} aria-label="Tags">
                {tags.map((tag) => (
                  <li
                    key={tag}
                    {...sx(stampChipClass, styles.coverStampOnBand, wrapAnywhereClass)}
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            )}

            {mapHeroDay && (
              <motion.div {...fadeUp(3)} {...sx('cover-cta', styles.coverCtaRow)}>
                <button type="button" onClick={() => editor.openMap(mapHeroDay.id)} {...sx(bandBtnClass)}>
                  <MapIcon {...sx(styles.iconSm)} strokeWidth={1.5} aria-hidden />
                  Map Mode
                </button>
              </motion.div>
            )}
          </div>
        </header>

        <div {...sx(documentClass)}>
        <DayNavigation days={trip.days} timezone={trip.timezone} />
        <div {...sx(styles.coverActionsRow)}>
          <Link to={`/trips/${trip.slug ?? trip.id}/places`} {...sx(chipBtnClass)}>
            <Images {...sx(styles.iconXs)} strokeWidth={1.5} aria-hidden />
            Places
          </Link>
          {editable && trip.status === "draft" && (
            <button type="button" disabled={editorLocked} onClick={editor.publish} {...sx(inkBtnClass)}>
              <Globe2 {...sx(styles.iconSm)} strokeWidth={1.5} aria-hidden />
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
            <a href="#trip-settings" {...sx(chipBtnClass)}>
              <Settings2 {...sx(styles.iconXs)} strokeWidth={1.5} aria-hidden />
              Settings
            </a>
          )}
        </div>

        {todayDay && (
          <aside {...sx(styles.mt6, styles.roundedTrips, a.softBg)}>
            <Link
              to={`/trips/${trip.slug ?? trip.id}/day/${todayDay.id}`}
              {...sx('group', styles.todayAsideLink, overlayHoverClass, focusRingInsetClass)}
            >
              <div {...sx(styles.flexWrapBaselineGap4, styles.minW0)}>
                <p {...sx(typeMetaClass, a.text)}>
                  <span {...sx(styles.inlineBlock, styles.accentDotSm, a.dot)} aria-hidden />
                  Today · {formatTripDate(todayDay.date, trip.timezone)}
                </p>
                <p {...sx(styles.textSm, styles.fontSemibold, styles.inkPrimary, wrapAnywhereClass)}>
                  {todayDay.emoji && <span aria-hidden {...sx(styles.emojiGap)}>{todayDay.emoji}</span>}
                  Day {trip.days.indexOf(todayDay) + 1}
                  {todayDay.title ? `, ${todayDay.title}` : ""}
                </p>
              </div>
            </Link>
          </aside>
        )}

        {editable && trip.days.every((d) => d.items.length === 0) && (
          <div {...sx(styles.mt6)}>
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
          <div {...sx(styles.mt6)}>
            <SuggestionsPanel
              run={editor.activeRun}
              dayOptions={editor.dayOptions}
              onApply={editor.applyActiveRun}
              onDismiss={editor.dismissRun}
            />
          </div>
        )}

        {editable && (
          <div {...sx(styles.mt6)}>
            <ExtractedPlacesLibrary
              trip={trip}
              locked={editorLocked}
              defaultDayId={editor.routerLocation.hash.replace(/^#/, "") || undefined}
              onDaysChange={editor.setDays}
            />
          </div>
        )}

        <section {...sx(styles.sectionMt10)}>
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
            <div {...sx(styles.mt4, styles.emptyItinerary, mutedInkClass)}>
              This trip has no days yet.
            </div>
          ) : (
            <div>
              <div data-testid="trip-itinerary" {...sx(styles.minW0, styles.flex1, styles.itineraryStack)}>
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
          <section {...sx(styles.sectionMt12)}>
            <SectionHeading title="Stays" subtitle="Hotels and neighborhoods on this trip." />
            {hotels.length > 0 && (
              <ul {...sx(styles.mt4, styles.divideStone, 'trips-divide-stone')}>
                {hotels.map((item) => (
                  <li key={item.id} {...sx(styles.py3, styles.textSm, styles.inkSecondaryStone, wrapAnywhereClass)}>
                    {item.title}
                    {item.location?.address ? (
                      <span {...sx(styles.addressHintXs, mutedInkClass)}>{item.location.address}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {neighborhoods.length > 0 && (
              <p {...sx(styles.mt4, styles.textSm, mutedInkClass, wrapAnywhereClass)}>{neighborhoods.join(" · ")}</p>
            )}
          </section>
        )}

        <ReservationLedger trip={trip} today={today} past={past} />

        {editable && (
          <section id="trip-settings" aria-label="Trip settings" {...sx(styles.settingsSection)}>
            <p {...sx(styles.settingsHeading, mutedInkClass)}>Trip settings</p>
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
              <div {...sx(styles.minHScreenCenter)} role="status">
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
    <section id="reservations" {...sx(styles.reservationsSection)}>
      <SectionHeading title="Reservations" subtitle="Bookings across the trip." />
      <table {...sx(dataTableClass)}>
        <caption {...sx(styles.srOnly)}>Reservations</caption>
        <thead>
          <tr>
            <th scope="col" {...sx(dataThClass)}>
              Date
            </th>
            <th scope="col" {...sx(dataThClass)}>
              Time
            </th>
            <th scope="col" {...sx(dataThClass)}>
              Booking
            </th>
            <th scope="col" {...sx(dataThClass)}>
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ day, item }) => {
            const elapsed = day.date < today && !past
            return (
              <tr key={item.id} {...sx(elapsed ? styles.opacity60 : undefined)}>
                <td {...sx(styles.whitespaceNowrap, styles.tabularNums, dataTdClass, mutedInkClass)}>
                  {formatTripDate(day.date, trip.timezone, { weekday: undefined })}
                </td>
                <td {...sx(styles.whitespaceNowrap, styles.tabularNums, dataTdClass, mutedInkClass)}>
                  {item.time ?? "–"}
                </td>
                <td {...sx(dataTdClass)}>
                  <Link
                    to={`/trips/${trip.slug ?? trip.id}/day/${day.id}#item-${item.id}`}
                    {...sx(styles.fontMedium, focusRingClass, wrapAnywhereClass)}
                  >
                    {item.title}
                  </Link>
                  {item.notes && (
                    <p {...sx(styles.settingsLabel, mutedInkClass, wrapAnywhereClass)}>{item.notes}</p>
                  )}
                </td>
                <td {...sx(dataTdClass)}>
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
