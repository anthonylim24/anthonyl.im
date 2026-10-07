import { sx } from '@/lib/utils'
import { styles } from './trips.stylex'
import { pack as pk } from './toy.stylex'
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronDown, Loader2, type LucideIcon, PenLine, Sparkles } from "lucide-react"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { useGetToken } from "@/lib/safeAuth"
import { createTrip, generateItinerary } from "./tripsApi"
import { CoverDock } from "./components/CoverDock"
import { DateRangeField } from "./components/DateRangeField"
import { TimezoneField } from "./components/TimezoneField"
import { TripsGlobe, type GlobePin } from "./scene/TripsGlobe"
import { TOY, lookupPlace, type LatLng } from "./scene/worldMap"
import { DEFAULT_ITINERARY_PROMPT, type GeneratePreferences } from "./types"
import {
  EASE,
  REVEAL_DURATION,
  accentIconClass,
  alertErrorClass,
  coverBandClass,
  ghostBtnClass,
  hintClass,
  inputClass,
  labelClass,
  pageClass,
  primaryBtnClass,
  secondaryBtnClass,
  segmentOptionClass,
  segmentTrackClass,
  sheetRuleClass,
  spinnerClass,
  stampChipClass,
  wrapAnywhereClass,
  displayInputClass,
} from "./ui"

const SHEET = pageClass("form")

type FieldKey = "name" | "destinations" | "dates" | "timezone"

interface FieldProblem {
  field: FieldKey
  summary: string
  message: string
}

function FieldError({
  problem,
  id,
  className = styles.fieldError,
}: {
  problem: FieldProblem | null
  id: string
  className?: Parameters<typeof sx>[0]
}) {
  if (!problem) return null
  return (
    <p id={id} {...sx(className)}>
      {problem.message}
    </p>
  )
}

const PREFERENCE_FIELDS: Array<{ key: keyof GeneratePreferences; label: string; placeholder: string }> = [
  { key: "pace", label: "Pace", placeholder: "Relaxed mornings, busy afternoons" },
  { key: "budget", label: "Budget", placeholder: "Mid-range, splurge on 2 dinners" },
  { key: "interests", label: "Interests", placeholder: "Food, architecture, vintage shopping" },
  { key: "food", label: "Food", placeholder: "No raw fish; loves noodles" },
  { key: "mobility", label: "Mobility", placeholder: "Lots of walking OK; avoid stairs" },
  { key: "mustSee", label: "Must-see", placeholder: "Teamlab, a sumo match" },
  { key: "avoid", label: "Avoid", placeholder: "Long museum days, tourist traps" },
  { key: "lodging", label: "Hotel / base", placeholder: "Park Hyatt, Shinjuku" },
  { key: "transport", label: "Transport", placeholder: "Trains + walking, no rental car" },
]

interface ModeOption {
  id: "ai" | "blank"
  title: string
  body: string
  Icon: LucideIcon
  recommended?: boolean
}

const MODE_OPTIONS: ModeOption[] = [
  {
    id: "ai",
    title: "AI draft",
    body: "Structured days and places you can edit.",
    Icon: Sparkles,
    recommended: true,
  },
  {
    id: "blank",
    title: "Blank days",
    body: "Empty days for each date. Build it yourself.",
    Icon: PenLine,
  },
]

function parseList(raw: string): string[] {
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function TripCreate() {
  const getToken = useGetToken()
  const readToken = useLatestCallback(getToken)
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [params] = useSearchParams()
  const initialMode = params.get("mode") === "blank" ? "blank" : "ai"

  const [name, setName] = useState("")
  const [destinations, setDestinations] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")
  const [tags, setTags] = useState("")
  const [description, setDescription] = useState("")
  const [mode, setMode] = useState<"blank" | "ai">(initialMode)
  const [prompt, setPrompt] = useState("")
  const [prefs, setPrefs] = useState<GeneratePreferences>({})
  const [showPrefs, setShowPrefs] = useState(false)
  const [showCoverDetails, setShowCoverDetails] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [phase, setPhase] = useState<"creating" | "generating">("creating")
  const busy: "idle" | "creating" | "generating" = isPending ? phase : "idle"
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  const groupRefs = useRef<Record<FieldKey, HTMLDivElement | null>>({
    name: null,
    destinations: null,
    dates: null,
    timezone: null,
  })

  const destinationList = useMemo(() => parseList(destinations), [destinations])
  const problems = useMemo<FieldProblem[]>(() => {
    const list: FieldProblem[] = []
    if (!name.trim()) list.push({ field: "name", summary: "a trip name", message: "Give the trip a name." })
    if (destinationList.length === 0)
      list.push({
        field: "destinations",
        summary: "at least one destination",
        message: "Name at least one destination.",
      })
    if (!startDate || !endDate)
      list.push({ field: "dates", summary: "dates", message: "Pick the first and last day." })
    else if (endDate < startDate)
      list.push({
        field: "dates",
        summary: "an end date on or after the start",
        message: "The last day can’t be before the first.",
      })
    if (!timezone.trim()) list.push({ field: "timezone", summary: "a time zone", message: "Pick a time zone." })
    return list
  }, [name, destinationList, startDate, endDate, timezone])

  const valid = problems.length === 0
  // Errors stay silent until the first submit attempt, then follow the fields.
  const shown = touched ? problems : []
  const errorFor = (field: FieldKey) => shown.find((p) => p.field === field) ?? null
  const errorId = (field: FieldKey) => `trip-${field}-error`

  const focusField = (field: FieldKey) => {
    groupRefs.current[field]?.querySelector<HTMLElement>("input, button, textarea, select")?.focus()
  }

  const generating = busy === "generating"
  const selectedMode = MODE_OPTIONS.find((opt) => opt.id === mode)

  useEffect(() => {
    if (!generating || reduce) return
    const startedAt = Date.now()
    const id = window.setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [generating, reduce])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (isPending) return
    if (!valid) {
      focusField(problems[0].field)
      return
    }
    setError(null)
    startTransition(async () => {
      setPhase("creating")
      try {
        const trip = await createTrip(readToken, {
          name: name.trim(),
          destinations: destinationList,
          startDate,
          endDate,
          timezone,
          tags: parseList(tags),
          description: description.trim() || undefined,
        })
        if (mode === "ai") {
          setElapsed(0)
          setPhase("generating")
          const preferences = Object.fromEntries(
            Object.entries(prefs).filter(([, v]) => v && v.trim()),
          ) as GeneratePreferences
          try {
            const generated = await generateItinerary(readToken, trip.id, {
              prompt: prompt.trim() || undefined,
              preferences: Object.keys(preferences).length ? preferences : undefined,
            })
            const empty = generated.trip.days.every((d) => d.items.length === 0)
            if (empty) {
              navigate(`/trips/${trip.id}`, {
                state: {
                  notice: "The AI draft came back empty. Your days are ready; run Generate to try again.",
                  retryGenerate: { prompt: prompt.trim() || undefined, preferences },
                },
              })
              return
            }
          } catch (err) {
            navigate(`/trips/${trip.id}`, {
              state: {
                notice: `Trip created, but the AI draft didn’t finish. Your days are empty; run Generate to try again. (${err instanceof Error ? err.message : String(err)})`,
                retryGenerate: { prompt: prompt.trim() || undefined, preferences },
              },
            })
            return
          }
          navigate(`/trips/${trip.id}`)
          return
        }
        navigate(`/trips/${trip.id}`)
      } catch (err) {
        setError(
          `Couldn’t create the trip. Nothing was saved, so you can submit again. (${err instanceof Error ? err.message : String(err)})`,
        )
      }
    })
  }

  return (
    <form onSubmit={onSubmit} {...sx(styles.createForm)} noValidate>
      <CoverDock title={name.trim() || "New trip"} measure="form" />
      <header {...sx('cover-band', coverBandClass, styles.coverBandHero)}>
        <div {...sx(pk.headerGrid)}>
          <div {...sx(pk.headerCopy)}>
          <p {...sx(pk.stamp, 'cover-extra')}>New trip</p>
          <h1 {...sx(pk.title, 'cover-extra')}>Pack your bag</h1>
          <div {...sx(styles.createNameGroup)} ref={(el) => void (groupRefs.current.name = el)}>
            <label htmlFor="trip-name" {...sx(styles.srOnly)}>
              Trip name
            </label>
            <input
              id="trip-name"
              {...sx('trip-display-input', displayInputClass, styles.createBandNameInput, wrapAnywhereClass)}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tokyo Long Weekend"
              required
              autoComplete="off"
              aria-invalid={errorFor("name") ? true : undefined}
              aria-describedby={errorFor("name") ? errorId("name") : undefined}
            />
            <FieldError problem={errorFor("name")} id={errorId("name")} className={styles.bandFieldError} />
          </div>
          </div>
          <PackedSuitcase destinations={destinationList} />
        </div>
      </header>

      <div {...sx(SHEET)}>
        <div {...sx(styles.createFieldsStack)}>
          <div ref={(el) => void (groupRefs.current.destinations = el)}>
            <label htmlFor="trip-dest" {...sx(labelClass)}>
              Destinations
            </label>
            <input
              id="trip-dest"
              {...sx(styles.inputMt2, inputClass)}
              value={destinations}
              onChange={(e) => setDestinations(e.target.value)}
              placeholder="Tokyo, Hakone"
              required
              aria-invalid={errorFor("destinations") ? true : undefined}
              aria-describedby={
                errorFor("destinations") ? `${errorId("destinations")} trip-dest-hint` : "trip-dest-hint"
              }
            />
            <FieldError problem={errorFor("destinations")} id={errorId("destinations")} />
            <p id="trip-dest-hint" {...sx(hintClass)}>
              Comma-separated. First destination usually sets the planning center of gravity.
            </p>
            {destinationList.length > 0 && (
              <ul {...sx(styles.createTagList)} aria-label="Parsed destinations">
                {destinationList.map((d) => (
                  <li
                    key={d}
                    {...sx(stampChipClass, styles.createTagChip, wrapAnywhereClass)}
                  >
                    {d}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div {...sx(styles.gridColsDateRange, sheetRuleClass)}>
            <div ref={(el) => void (groupRefs.current.dates = el)}>
              <span {...sx(labelClass)} id="trip-dates-label">
                Dates
              </span>
              <div {...sx(styles.createFieldGap)}>
                <DateRangeField
                  startDate={startDate}
                  endDate={endDate}
                  invalid={errorFor("dates") !== null}
                  describedBy={errorFor("dates") ? errorId("dates") : undefined}
                  onChange={(s, e) => {
                    setStartDate(s)
                    setEndDate(e)
                  }}
                />
              </div>
              <FieldError problem={errorFor("dates")} id={errorId("dates")} />
            </div>
            <div ref={(el) => void (groupRefs.current.timezone = el)}>
              <span {...sx(labelClass)} id="trip-tz-label">
                Time zone
              </span>
              <div {...sx(styles.createFieldGap)}>
                <TimezoneField
                  value={timezone}
                  onChange={setTimezone}
                  invalid={errorFor("timezone") !== null}
                  describedBy={errorFor("timezone") ? errorId("timezone") : undefined}
                />
              </div>
              <FieldError problem={errorFor("timezone")} id={errorId("timezone")} />
              <p {...sx(hintClass)}>Use the destination’s time zone.</p>
            </div>
          </div>

          <div {...sx(sheetRuleClass)}>
            <button
              type="button"
              onClick={() => setShowCoverDetails((s) => !s)}
              {...sx(secondaryBtnClass)}
              aria-expanded={showCoverDetails}
              aria-controls="trip-cover-details"
            >
              {showCoverDetails ? "Hide cover details" : "More cover details"}
              <ChevronDown
                {...sx(
                  styles.chevronDisclosure,
                  styles.motionReduceTransitionNone,
                  showCoverDetails ? styles.rotate180 : undefined,
                )}
                strokeWidth={1.5}
                aria-hidden
              />
            </button>
            <div id="trip-cover-details" hidden={!showCoverDetails}>
              <div {...sx(styles.gridCols2SmGap4, styles.mt5)}>
                <div>
                  <label htmlFor="trip-tags" {...sx(labelClass)}>
                    Tags <span {...sx(styles.optionalLabel)}>(optional)</span>
                  </label>
                  <input
                    id="trip-tags"
                    {...sx(styles.inputMt2, inputClass)}
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="anniversary, food"
                  />
                </div>
                <div>
                  <label htmlFor="trip-desc" {...sx(labelClass)}>
                    Notes <span {...sx(styles.optionalLabel)}>(optional)</span>
                  </label>
                  <textarea
                    id="trip-desc"
                    rows={2}
                    {...sx(styles.inputMt2, inputClass)}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Occasion, constraints, or anchors collaborators should know."
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <fieldset {...sx(styles.fieldsetMt8, sheetRuleClass)}>
          <legend {...sx(labelClass)}>How should we start it?</legend>
          <div {...sx(styles.segmentTrackMt3, segmentTrackClass)}>
            {MODE_OPTIONS.map((opt) => {
              const selected = mode === opt.id
              return (
                <label key={opt.id} {...sx(styles.cursorPointer, segmentOptionClass(selected))}>
                  <input
                    type="radio"
                    name="mode"
                    value={opt.id}
                    checked={selected}
                    onChange={() => setMode(opt.id)}
                    {...sx(styles.srOnly)}
                  />
                  <opt.Icon
                    {...sx(styles.iconSm, styles.shrink0, selected && opt.recommended ? accentIconClass : undefined)}
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  {opt.title}
                  {opt.recommended ? <span {...sx(styles.srOnly)}>, recommended</span> : null}
                </label>
              )
            })}
          </div>
          {selectedMode ? (
            <p {...sx(hintClass)}>
              {selectedMode.recommended ? "Recommended. " : ""}
              {selectedMode.body}
            </p>
          ) : null}
        </fieldset>

        {mode === "ai" && (
          <motion.div
            {...sx(styles.aiPanelMt5, sheetRuleClass)}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: REVEAL_DURATION, ease: EASE }}
          >
            <div>
              <label htmlFor="trip-prompt" {...sx(labelClass)}>
                AI brief <span {...sx(styles.optionalLabel)}>(optional)</span>
              </label>
              <textarea
                id="trip-prompt"
                rows={3}
                {...sx(styles.inputMt2, inputClass)}
                value={prompt}
                placeholder={DEFAULT_ITINERARY_PROMPT}
                onChange={(e) => setPrompt(e.target.value)}
                aria-describedby="trip-prompt-hint"
              />
              <p id="trip-prompt-hint" {...sx(hintClass)}>
                Leave blank to use the balanced default shown here.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPrefs((s) => !s)}
              {...sx(secondaryBtnClass)}
              aria-expanded={showPrefs}
              aria-controls="trip-prefs"
            >
              {showPrefs ? "Hide traveler preferences" : "Add traveler preferences"}
              <ChevronDown
                {...sx(
                  styles.chevronDisclosure,
                  styles.motionReduceTransitionNone,
                  showPrefs ? styles.rotate180 : undefined,
                )}
                strokeWidth={1.5}
                aria-hidden
              />
            </button>
            {showPrefs && (
              <div id="trip-prefs" {...sx(styles.createPrefsGrid)}>
                {PREFERENCE_FIELDS.map((f) => (
                  <div key={f.key}>
                    <label htmlFor={`pref-${f.key}`} {...sx(labelClass)}>
                      {f.label}
                    </label>
                    <input
                      id={`pref-${f.key}`}
                      {...sx(styles.inputMt2, inputClass)}
                      value={prefs[f.key] ?? ""}
                      placeholder={f.placeholder}
                      onChange={(e) => setPrefs((p) => ({ ...p, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {error && (
          <div {...sx(styles.alertMt5, alertErrorClass)} role="alert">
            {error}
          </div>
        )}

        <p {...sx(styles.createStatusLine, shown.length === 0 ? styles.createStatusEmpty : undefined)} role="status">
          {shown.length > 0 ? `Still need ${shown.map((p) => p.summary).join(", ")}.` : ""}
        </p>
      </div>

      <div {...sx(styles.createStickyFooter)}>
        <div {...sx(styles.mxAuto, styles.createStickyBar)}>
          <button type="submit" disabled={busy !== "idle"} {...sx(primaryBtnClass)}>
            {busy === "idle" ? (
              mode === "ai" ? (
                <>
                  <Sparkles {...sx(styles.iconSm)} strokeWidth={1.5} aria-hidden />
                  Create & generate
                </>
              ) : (
                "Create trip"
              )
            ) : (
              <>
                <Loader2 {...sx(styles.iconSm, spinnerClass)} strokeWidth={1.5} aria-hidden />
                {busy === "creating" ? "Creating trip…" : "Generating itinerary…"}
              </>
            )}
          </button>
          <button type="button" onClick={() => navigate("/trips")} {...sx(ghostBtnClass)} disabled={busy !== "idle"}>
            Cancel
          </button>
          {generating && (
            <p
              {...sx(styles.createGeneratingNote)}
              role="status"
              aria-live="polite"
            >
              <span {...sx(styles.srOnly)}>
                Generating your itinerary. This usually takes 20 to 40 seconds. Stay on this page.
              </span>
              <span aria-hidden {...sx(styles.fontMonoTrips, styles.tabularNums)}>
                {reduce ? "Usually 20 to 40s. Stay on this page." : `Generating… ${elapsed}s · usually 20 to 40s`}
              </span>
            </p>
          )}
        </div>
      </div>
      <AnimatePresence>
        {generating && <GeneratingOverlay key="generating" destinations={destinationList} elapsed={elapsed} />}
      </AnimatePresence>
    </form>
  )
}

const STICKER_SPOTS = [
  { left: "9%", top: "20%", rotate: -10 },
  { left: "52%", top: "12%", rotate: 8 },
  { left: "28%", top: "50%", rotate: 4 },
  { left: "60%", top: "56%", rotate: -7 },
  { left: "6%", top: "70%", rotate: 9 },
  { left: "38%", top: "28%", rotate: -4 },
]
const STICKER_FILLS = [TOY.butter, TOY.mint, TOY.ocean, TOY.lilac, TOY.rose, TOY.paper]

/** A clay suitcase that collects a sticker for every destination you type. */
function PackedSuitcase({ destinations }: { destinations: string[] }) {
  const reduce = useReducedMotion()
  const shown = destinations.slice(0, STICKER_SPOTS.length)
  return (
    <div {...sx(pk.suitcase)} aria-hidden>
      <span {...sx(pk.handle)} />
      <div {...sx(pk.body)}>
        <span {...sx(pk.strap, pk.strapLeft)} />
        <span {...sx(pk.strap, pk.strapRight)} />
        {shown.length === 0 && <span {...sx(pk.bodyHint)}>Add a destination for a sticker</span>}
        <AnimatePresence>
          {shown.map((d, i) => {
            const spot = STICKER_SPOTS[i]!
            return (
              <motion.span
                key={`${d}-${i}`}
                {...sx(pk.sticker, i % 3 === 1 && pk.stickerRound)}
                style={{ left: spot.left, top: spot.top, backgroundColor: STICKER_FILLS[i % STICKER_FILLS.length] }}
                initial={reduce ? false : { scale: 0.2, rotate: spot.rotate - 40, opacity: 0 }}
                animate={{ scale: 1, rotate: spot.rotate, opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { scale: 0.3, rotate: spot.rotate + 30, opacity: 0 }}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 15 }}
              >
                {d}
              </motion.span>
            )
          })}
        </AnimatePresence>
      </div>
      <span {...sx(pk.wheel, pk.wheelLeft)} />
      <span {...sx(pk.wheel, pk.wheelRight)} />
    </div>
  )
}

const GEN_LINES = [
  "Folding the paper plane…",
  "Checking opening hours…",
  "Pinning neighborhoods…",
  "Plotting walking routes…",
  "Picking dinner spots…",
  "Packing the days…",
]
const GEN_FILLS = [TOY.rose, TOY.butter, TOY.mint, TOY.lilac, TOY.peach]
const MAX_GEN_PINS = 12

/** While the draft generates: the plane loops the globe and pins drop around the destinations. */
function GeneratingOverlay({ destinations, elapsed }: { destinations: string[]; elapsed: number }) {
  const reduce = useReducedMotion()
  const key = destinations.join("|")
  const anchors = useMemo(
    () =>
      key
        .split("|")
        .map((name) => ({ name, at: lookupPlace(name) }))
        .filter((a): a is { name: string; at: LatLng } => a.at !== null),
    [key],
  )
  const [count, setCount] = useState(1)
  useEffect(() => {
    if (reduce) return
    const id = window.setInterval(() => setCount((n) => Math.min(MAX_GEN_PINS, n + 1)), 2500)
    return () => window.clearInterval(id)
  }, [reduce])
  const pins = useMemo<GlobePin[]>(() => {
    const base = anchors.length ? anchors : [{ name: "Somewhere new", at: { lat: 30, lng: 135 } }]
    const n = reduce ? base.length : count
    return Array.from({ length: n }, (_, i) => {
      const a = base[i % base.length]!
      const spread = i < base.length ? 0 : 2 + (i % 3)
      return {
        id: `gen-${i}`,
        lat: a.at.lat + Math.sin(i * 2.3) * spread,
        lng: a.at.lng + Math.cos(i * 1.7) * spread * 1.4,
        fill: GEN_FILLS[i % GEN_FILLS.length]!,
        label: a.name,
      }
    })
  }, [anchors, count, reduce])

  return (
    <motion.div
      {...sx(pk.overlay)}
      aria-hidden
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      <div {...sx(pk.overlayCard)}>
        <div {...sx(pk.overlayGlobe)}>
          <TripsGlobe mode="world" pins={pins} focus={anchors[0]?.at ?? null} description="" />
        </div>
        <p {...sx(pk.overlayTitle)}>Packing your itinerary</p>
        <p {...sx(pk.overlayLine)}>{reduce ? "Usually 20 to 40 seconds." : GEN_LINES[Math.floor(elapsed / 4) % GEN_LINES.length]}</p>
        <p {...sx(pk.overlayClock)}>
          {reduce ? "Stay on this page." : `${elapsed}s · usually 20 to 40s · stay on this page`}
        </p>
      </div>
    </motion.div>
  )
}
