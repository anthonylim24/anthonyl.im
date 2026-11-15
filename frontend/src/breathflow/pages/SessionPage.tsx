import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from 'react'
import { LayoutGroup, motion } from 'motion/react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronDown,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Square,
  X,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { PHASE_LABELS, TECHNIQUE_IDS } from '@/lib/constants'
import type { MoodValue } from '@/lib/mood'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useHistoryStore } from '@/stores/historyStore'
import { usePracticeStore } from '@/stores/practiceStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { playCue, unlockAudio } from '../engine/audio'
import { vibrate } from '../engine/haptics'
import {
  elapsedSessionSeconds,
  getCurrentPhase,
  getCurrentPhaseSeconds,
  type EngineConfig,
} from '../engine/sessionEngine'
import {
  freshLeadIn,
  sessionClock,
  SETUP,
  type Completion,
  type Saved,
  type Session,
  type SessionEvent,
} from '../engine/sessionMachine'
import { useSessionEngine, type OutputEffect } from '../engine/useSessionEngine'
import { useSoundscape } from '../engine/useSoundscape'
import { speak, stopSpeaking } from '../engine/voice'
import { levelForXP } from '../gamify/levels'
import { buildSessionInsight } from '../gamify/insights'
import { resolveOrbTheme } from '../gamify/orbThemes'
import { getJourney, nextStepIndex } from '../journeys/catalog'
import { useConstrainedViewport } from '../platform/constrainedViewport'
import { useImmersive } from '../platform/immersive'
import { useReducedMotion } from '../platform/useReducedMotion'
import { useScrollLock } from '../platform/useScrollLock'
import { useWakeLock } from '../platform/useWakeLock'
import { getProtocol, isAdvancedProtocol, PROTOCOLS } from '../protocols/catalog'
import {
  clampRounds,
  getMaxRounds,
  getPhaseSecondsForRound,
  plannedSessionSeconds,
  type CustomPhaseDurations,
} from '../protocols/cadence'
import { ADVANCED_SAFETY_CUE, getCoachingCue, LEAD_IN_CUE, READY_CUE } from '../protocols/coaching'
import type { BreathingProtocol } from '../protocols/types'
import { CONSTRAINED_VIEWPORT_MESSAGE, SAFETY_DISCLOSURE } from '../safety/disclosure'
import { useRecoveryStatus } from '../safety/useRecoveryStatus'
import { completeSession } from '../session/completeSession'
import { earnsJourneyStep, type JourneyOutcome } from '../session/journeyStep'
import { buildSessionSearch, parseSessionSearch } from '../session/urlParams'
import { CadenceEditor } from '../components/CadenceEditor'
import { LiveAnnouncer } from '../components/LiveAnnouncer'
import { MoodPicker } from '../components/MoodPicker'
import { PaintSplash } from '../components/PaintSplash'
import { PhaseStrip } from '../components/PhaseStrip'
import { SafetyChecklist } from '../components/SafetyChecklist'
import { SessionSummary } from '../components/SessionSummary'
import { btn } from '../components/buttonStyles.stylex'
import { sx } from '@/styles/merge'
import { bf } from '../styles/breathflow.stylex'
import { ss } from '../styles/session.stylex'
import { wc } from '../styles/watercolor.stylex'
import { formatClock, formatDuration } from '../components/format'
import { Notice } from '../motion/Notice'
import { chromeTransition, EASE_SETTLE, inkSpring, pressSpring } from '../motion/tokens'
import { sessionPigment, techniquePigment, type Pigment } from '../pigments'
import { getRoundSeconds } from '../protocols/cadence'
import { PaintingLoader } from '../components/PaintingLoader'
import { BloomAnchor } from '../scene/BloomAnchor'
import { BloomCanvas, type BloomCanvasHandle } from '../scene/BloomCanvas'
import { sampleBreath, useBreathReader, type BreathSample } from '../scene/breathDrive'

const CONTROLS_HIDE_MS = 3000

/** The cat waits fully exhaled through the lead-in, so the first inhale starts from empty. */
const REST_BREATH: BreathSample = { amplitude: 0, progress: 0, hold: false, cycle: 0 }
const readRest = () => REST_BREATH

type ActiveTag = 'leadIn' | 'running' | 'paused'
type ActiveSessionState = Extract<Session, { tag: ActiveTag }>

function isActive(session: Session): session is ActiveSessionState {
  return session.tag === 'leadIn' || session.tag === 'running' || session.tag === 'paused'
}

export function SessionPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useMemo(() => parseSessionSearch(location.search), [location.search])

  const protocol = getProtocol(params.techniqueId)
  const rounds = params.rounds
  const customDurations = params.customDurations
  const journeyRef = params.journey
  const journey = journeyRef ? getJourney(journeyRef.id) : null
  const advanced = isAdvancedProtocol(protocol)

  const [moodBefore, setMoodBefore] = useState<MoodValue | undefined>(undefined)
  const [moodAfter, setMoodAfter] = useState<MoodValue | undefined>(undefined)
  const [checkedSafety, setCheckedSafety] = useState<ReadonlySet<number>>(new Set())
  const [announcement, setAnnouncement] = useState('')

  const reducedMotion = useReducedMotion()
  const constrained = useConstrainedViewport()
  const recovery = useRecoveryStatus()

  const soundEnabled = useSettingsStore((s) => s.soundEnabled)
  const xp = useGamificationStore((s) => s.xp)
  const selectedTheme = useGamificationStore((s) => s.selectedTheme)
  const orbTheme = resolveOrbTheme(selectedTheme, levelForXP(xp))
  const pigment = sessionPigment(protocol.id, orbTheme)

  const engineConfig = useMemo<EngineConfig>(
    () => ({ protocol, rounds, customDurations }),
    [protocol, rounds, customDurations],
  )

  function perform(effect: OutputEffect) {
    const settings = useSettingsStore.getState()
    switch (effect.type) {
      case 'cue':
        playCue(effect.kind, { enabled: settings.soundEnabled, volume: settings.soundVolume })
        break
      case 'speak':
        speak(effect.text, { enabled: settings.soundEnabled && settings.voiceGuidance, volume: settings.soundVolume })
        break
      case 'hush':
        stopSpeaking()
        break
      case 'vibrate':
        vibrate(effect.kind, settings.hapticsEnabled)
        break
      case 'announce':
        setAnnouncement(effect.text)
        break
    }
  }

  function persist({ roundsCompleted, plannedRounds, holdTimes }: Completion): Saved {
    let journeyOutcome: JourneyOutcome | null = null
    if (journey && journeyRef) {
      const done = usePracticeStore.getState().journeys[journeyRef.id]?.done ?? []
      if (earnsJourneyStep({ journey, step: journeyRef.step, done, roundsCompleted, plannedRounds })) {
        const finished = usePracticeStore.getState().completeJourneyStep(journeyRef.id, journeyRef.step)
        const next = nextStepIndex(journey, usePracticeStore.getState().journeys[journeyRef.id]?.done ?? [])
        journeyOutcome = {
          name: journey.name,
          day: journeyRef.step + 1,
          total: journey.steps.length,
          finished,
          next: next === null ? null : journey.steps[next].title,
        }
      }
    }
    const result = completeSession({
      techniqueId: protocol.id,
      rounds: roundsCompleted,
      plannedRounds,
      customDurations,
      holdTimes,
      moodBefore,
      journeyFinished: journeyOutcome?.finished === true,
    })
    return { result, journey: journeyOutcome }
  }

  // Home's Begin CTA deep-links with autostart=1 and the lead-in begins at
  // once, except for safety-gated protocols, which always pass their checklist.
  const autostart = useMemo(
    () => new URLSearchParams(location.search).get('autostart') === '1',
    [location.search],
  )
  const { session, send } = useSessionEngine(
    engineConfig,
    { perform, persist },
    autostart && !advanced ? freshLeadIn() : SETUP,
  )
  const inSession = isActive(session)

  /** The last URL this page navigated to itself (setting changes, dropping autostart). */
  const ownNavigation = useRef<string | null>(null)
  const navigateHere = useCallback((search: string) => {
    const path = `/breathwork/session?${search}`
    ownNavigation.current = path
    navigate(path, { replace: true })
  }, [navigate])

  // Only the flag is left to drop from the URL; the lead-in is already counting.
  useEffect(() => {
    if (autostart) navigateHere(buildSessionSearch(params))
  }, [autostart, navigateHere, params])

  // Any other navigation to this page (the "Breathe" link from a summary,
  // back / forward) is a fresh visit: leave whatever was showing.
  const lastKey = useRef(location.key)
  useEffect(() => {
    if (lastKey.current === location.key) return
    lastKey.current = location.key
    if (ownNavigation.current === location.pathname + location.search) return
    send({ type: 'LEAVE' })
    setMoodBefore(undefined)
    setMoodAfter(undefined)
    setCheckedSafety(new Set())
  }, [location.key, location.pathname, location.search, send])

  useWakeLock(inSession)
  useScrollLock(inSession)
  useImmersive(inSession)

  // Advanced-session safety reminder joins the announcements once at start.
  const breathing = session.tag === 'running' || session.tag === 'paused'
  useEffect(() => {
    if (breathing && advanced) {
      const timeout = setTimeout(() => setAnnouncement(ADVANCED_SAFETY_CUE), 4000)
      return () => clearTimeout(timeout)
    }
  }, [breathing, advanced])

  // Focus follows the session out of the fullscreen view, never falling to the page body.
  const summaryHeadingRef = useRef<HTMLHeadingElement>(null)
  const startRef = useRef<HTMLButtonElement>(null)
  const previousTag = useRef(session.tag)
  useEffect(() => {
    const previous = previousTag.current
    previousTag.current = session.tag
    if (previous === session.tag) return
    if (session.tag === 'summary') summaryHeadingRef.current?.focus({ preventScroll: true })
    if (session.tag === 'setup' && previous !== 'summary') startRef.current?.focus({ preventScroll: true })
  }, [session.tag])

  function updateParams(next: {
    techniqueId?: typeof protocol.id
    rounds?: number
    customDurations?: CustomPhaseDurations | undefined
  }) {
    const techniqueId = next.techniqueId ?? protocol.id
    const nextProtocol = getProtocol(techniqueId)
    const isSwitch = techniqueId !== protocol.id
    navigateHere(buildSessionSearch({
      techniqueId,
      rounds: isSwitch ? nextProtocol.defaultRounds : (next.rounds ?? rounds),
      customDurations: isSwitch
        ? undefined
        : ('customDurations' in next ? next.customDurations : customDurations),
      // A journey step is a technique; choosing another one leaves the journey.
      journey: isSwitch ? undefined : journeyRef,
    }))
    if (isSwitch) setCheckedSafety(new Set())
  }

  const allSafetyChecked = (protocol.safetyChecklist ?? []).every((_, i) => checkedSafety.has(i))
  const blockedByRecovery = advanced && recovery.isActive
  const blockedByViewport = advanced && constrained
  const startDisabled = advanced && (!allSafetyChecked || blockedByRecovery || blockedByViewport)

  function handleStart() {
    if (startDisabled) return
    // Inside the tap, so iOS lets the first cue sound.
    unlockAudio()
    setMoodAfter(undefined)
    send({ type: 'START' })
  }

  function handleRepeat() {
    // Only reachable for non-advanced protocols (summary hides Repeat otherwise).
    unlockAudio()
    setMoodBefore(undefined)
    setMoodAfter(undefined)
    send({ type: 'REPEAT' })
  }

  function handleMoodAfter(value: MoodValue | undefined) {
    setMoodAfter(value)
    if (session.tag === 'summary') {
      useHistoryStore.getState().setSessionMood(session.result.session.id, { moodAfter: value })
    }
  }

  const summary = session.tag === 'summary' ? session : null
  const insight = useMemo(() => summary && buildSessionInsight({
    protocol,
    rounds: summary.result.session.rounds,
    durationSeconds: summary.result.session.durationSeconds,
    holdTimes: summary.result.session.holdTimes,
    isPersonalBest: summary.result.isPersonalBest,
    newBadgeCount: summary.result.newBadgeIds.length,
  }), [summary, protocol])

  return (
    <>
      <LiveAnnouncer message={announcement} />
      {summary && insight ? (
        <div {...sx(ss.summaryWrap)}>
          <PaintSplash
            pigment={pigment}
            big={summary.result.isPersonalBest || summary.result.newBadgeIds.length > 0 || summary.journey?.finished === true}
            reducedMotion={reducedMotion}
          />
          <SessionSummary
            protocol={protocol}
            result={summary.result}
            insight={insight}
            journey={summary.journey}
            pigment={pigment}
            moodAfter={moodAfter}
            onMoodAfter={handleMoodAfter}
            onRepeat={handleRepeat}
            headingRef={summaryHeadingRef}
          />
        </div>
      ) : isActive(session) ? (
        <ActiveSession
          session={session}
          config={engineConfig}
          send={send}
          totalSeconds={plannedSessionSeconds(protocol, rounds, customDurations)}
          advanced={advanced}
          reducedMotion={reducedMotion}
          pigment={pigment}
          soundEnabled={soundEnabled}
        />
      ) : session.tag === 'setup' ? (
        <div>
          <SessionSetup
            protocol={protocol}
            rounds={rounds}
            customDurations={customDurations}
            moodBefore={moodBefore}
            onMoodBefore={setMoodBefore}
            checkedSafety={checkedSafety}
            onToggleSafety={(index) => {
              setCheckedSafety((current) => {
                const next = new Set(current)
                if (next.has(index)) next.delete(index)
                else next.add(index)
                return next
              })
            }}
            blockedByRecovery={blockedByRecovery}
            recoveryRemaining={recovery.remainingSeconds}
            blockedByViewport={blockedByViewport}
            startDisabled={startDisabled}
            onUpdate={updateParams}
            onStart={handleStart}
            startRef={startRef}
            reducedMotion={reducedMotion}
            pigment={pigment}
            journeyLabel={journey && journeyRef
              ? `${journey.name} · day ${journeyRef.step + 1} of ${journey.steps.length}`
              : null}
            journeyNote={journey && journeyRef ? journey.steps[journeyRef.step].note : null}
          />
        </div>
      ) : null}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────

interface SessionSetupProps {
  protocol: BreathingProtocol
  rounds: number
  customDurations: CustomPhaseDurations | undefined
  moodBefore: MoodValue | undefined
  onMoodBefore: (value: MoodValue | undefined) => void
  checkedSafety: ReadonlySet<number>
  onToggleSafety: (index: number) => void
  blockedByRecovery: boolean
  recoveryRemaining: number
  blockedByViewport: boolean
  startDisabled: boolean
  onUpdate: (next: {
    techniqueId?: BreathingProtocol['id']
    rounds?: number
    customDurations?: CustomPhaseDurations | undefined
  }) => void
  onStart: () => void
  /** Start takes focus back when a session is cancelled or discarded. */
  startRef: Ref<HTMLButtonElement>
  reducedMotion: boolean
  pigment: Pigment
  /** "First week · day 3 of 7" when this session is a journey step. */
  journeyLabel: string | null
  journeyNote: string | null
}

function SessionSetup({
  protocol,
  rounds,
  customDurations,
  moodBefore,
  onMoodBefore,
  checkedSafety,
  onToggleSafety,
  blockedByRecovery,
  recoveryRemaining,
  blockedByViewport,
  startDisabled,
  onUpdate,
  onStart,
  startRef,
  reducedMotion,
  pigment,
  journeyLabel,
  journeyNote,
}: SessionSetupProps) {
  const maxRounds = getMaxRounds(protocol)
  const planned = plannedSessionSeconds(protocol, rounds, customDurations)
  const advanced = isAdvancedProtocol(protocol)
  const stageRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState(false)
  const [ready, setReady] = useState(false)
  // The preview bloom breathes this technique's actual cadence.
  const preview = useMemo(() => cadencePreview(protocol, customDurations, reducedMotion), [protocol, customDurations, reducedMotion])
  const vars = { '--bf-ink': pigment.mass, '--bf-mass': pigment.mass, '--bf-glaze': pigment.glaze } as CSSProperties

  return (
    <>
      {!ready && <PaintingLoader pigment={pigment} reducedMotion={reducedMotion} />}
      <div aria-busy={!ready} {...sx(ss.setup, wc.reveal, !ready && wc.holding)} style={vars}>
        <div {...sx(ss.setupStage)}>
          <div ref={stageRef} {...sx(ss.setupStageInner)}>
            <BloomCanvas
              anchorRef={anchorRef}
              pointerHostRef={stageRef}
              mode="play"
              pigment={pigment}
              read={preview}
              onLive={setLive}
              onReady={() => setReady(true)}
              style={ss.setupCanvas}
            />
            <div {...sx(ss.setupAnchorWrap)}>
              <BloomAnchor ref={anchorRef} pigment={pigment} read={preview} live={live} reducedMotion={reducedMotion} />
            </div>
          </div>
          <p {...sx(ss.setupCaption)}>
            <span {...sx('bf-display', wc.italic)}>{pigment.name}</span>
            <span aria-hidden="true"> · </span>
            <span>{reducedMotion ? 'one breath, at rest' : 'previewing one breath'}</span>
          </p>
        </div>

        <div {...sx(ss.setupPanel)}>
        <p {...sx(wc.eyebrow)}>{journeyLabel ?? 'Choose a breath'}</p>
        <h1 {...sx('bf-display', wc.pageTitle, ss.setupTitle)}>Breathe</h1>
        {journeyNote && <p {...sx(wc.lede, bf.mt3)}>{journeyNote}</p>}

        {/* Technique switch */}
        <LayoutGroup id="session-technique">
          <div {...sx(ss.palette)} role="group" aria-label="Technique">
            {PROTOCOLS.map((entry) => {
              const selected = entry.id === protocol.id
              const paint = techniquePigment(entry.id)
              return (
                <motion.button
                  key={entry.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onUpdate({ techniqueId: entry.id })}
                  whileTap={reducedMotion ? undefined : { scale: 0.98 }}
                  transition={pressSpring}
                  {...sx(ss.paletteBtn, selected ? ss.paletteBtnActive : ss.paletteBtnIdle)}
                  style={{ '--bf-mass': paint.mass, '--bf-glaze': paint.glaze } as CSSProperties}
                >
                  {selected ? (
                    reducedMotion ? (
                      <span aria-hidden="true" {...sx(ss.paletteInk)} />
                    ) : (
                      <motion.span
                        aria-hidden="true"
                        layoutId="session-technique-ink"
                        {...sx(ss.paletteInk)}
                        transition={inkSpring}
                      />
                    )
                  ) : null}
                  <span aria-hidden="true" {...sx('bf-dab', ss.paletteDab)} />
                  <span {...sx(bf.relative, bf.minW0)}>
                    <span {...sx(bf.block, bf.breakWords)}>{entry.name}</span>
                    <span {...sx(bf.block, bf.text11px, bf.capitalize, bf.textTertiary)}>
                      {entry.category}
                      {isAdvancedProtocol(entry) ? ' · safety check' : ''}
                    </span>
                  </span>
                </motion.button>
              )
            })}
          </div>
        </LayoutGroup>

        <div {...sx(ss.detail)}>
          <div {...sx(bf.flexBaselineBetween)}>
            <div {...sx(bf.minW0)}>
              <h2 {...sx('bf-display', ss.protocolName)}>{protocol.name}</h2>
              <p {...sx(bf.mt1, bf.textSm, bf.textSecondary)}>{protocol.description}</p>
            </div>
            <p {...sx('bf-display', ss.planned)}>{formatDuration(planned)}</p>
          </div>

          <PhaseStrip
            protocol={protocol}
            customDurations={customDurations}
            animated={!reducedMotion}
            pigment={pigment}
            style={bf.mt4}
          />

          {/* Rounds */}
          <div {...sx(bf.mt5, bf.flexBetween)}>
            <span {...sx(bf.textSm, bf.textBw)}>Rounds</span>
            <div {...sx(bf.flexItemsCenterGap1)}>
              <button
                type="button"
                {...sx(btn.icon)}
                aria-label="One round fewer"
                disabled={rounds <= 1}
                onClick={() => onUpdate({ rounds: clampRounds(protocol, rounds - 1) })}
              >
                <Minus size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <span {...sx(bf.w10, bf.textCenter, bf.textSm, bf.fontMedium, bf.tabularNums, bf.textBw)}>{rounds}</span>
              <button
                type="button"
                {...sx(btn.icon)}
                aria-label="One round more"
                disabled={rounds >= maxRounds}
                onClick={() => onUpdate({ rounds: clampRounds(protocol, rounds + 1) })}
              >
                <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Cadence */}
          <details {...sx('group', bf.detailsGroup)}>
            <summary {...sx(bf.detailsSummary)}>
              Cadence
              <span {...sx(bf.flexItemsCenterGap2)}>
                <span {...sx(bf.textXs, bf.textTertiary, bf.groupOpenHidden)}>
                  {customDurations ? 'Custom' : 'Default'}
                </span>
                <DetailsChevron />
              </span>
            </summary>
            <CadenceEditor
              protocol={protocol}
              rounds={rounds}
              customDurations={customDurations}
              onChange={(custom) => onUpdate({ customDurations: custom })}
            />
          </details>

          {/* Science */}
          <details {...sx('group', bf.detailsGroupFlush)}>
            <summary {...sx(bf.detailsSummary)}>
              <span>Why it works</span>
              <span {...sx(bf.flexItemsCenterGap2)}>
                <span {...sx(bf.textXs, bf.capitalize, bf.textTertiary, bf.groupOpenHidden)}>
                  {protocol.evidenceLevel} evidence
                </span>
                <DetailsChevron />
              </span>
            </summary>
            <div {...sx(bf.scienceBody)}>
              <p {...sx(bf.textSm, bf.leadingRelaxed, bf.textSecondary)}>{protocol.science}</p>
              <p {...sx(bf.mt2, bf.textXs, bf.textTertiary)}>
                {protocol.evidenceLabel} · {protocol.breathsPerMinute} breaths/min · best for{' '}
                {protocol.bestFor.join(', ').toLowerCase()}
              </p>
              {protocol.caution && (
                <p {...sx(bf.mt2, bf.textXs, bf.leadingRelaxed, bf.textSecondary)}>{protocol.caution}</p>
              )}
              <ul {...sx(bf.mt3, bf.spaceY15)}>
                {protocol.citations.map((citation) => (
                  <li key={citation.url} {...sx(bf.textXs, bf.leadingRelaxed, bf.textTertiary)}>
                    {citation.authors} ({citation.year}).{' '}
                    <a
                      href={citation.url}
                      target="_blank"
                      rel="noreferrer"
                      {...sx(bf.citationLink)}
                    >
                      {citation.title}
                    </a>{' '}
                    {citation.source}.
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </div>

        {/* Mood before */}
        <div {...sx(bf.mt6)}>
          <MoodPicker label="How do you feel right now? (optional)" value={moodBefore} onChange={onMoodBefore} />
        </div>

        {/* Safety gate */}
        {advanced && !blockedByViewport && (
          <div {...sx(bf.mt6)}>
            <SafetyChecklist protocol={protocol} checkedItems={checkedSafety} onToggle={onToggleSafety} />
          </div>
        )}

        {blockedByViewport && (
          <Notice role="alert" tone="danger" title="Not available here" style={bf.mt6}>
            {CONSTRAINED_VIEWPORT_MESSAGE}
          </Notice>
        )}

        {blockedByRecovery && !blockedByViewport && (
          <Notice title="Recovery in progress" style={bf.mt6} live={false}>
            <p {...sx(bf.tabularNums)}>
              Breathe easy for {recoveryRemaining}s before the next intense session.
            </p>
          </Notice>
        )}

        {/* Start */}
        <div {...sx(bf.startBlock)}>
          <p {...sx(bf.startCue)}>{READY_CUE}</p>
          <motion.button
            ref={startRef}
            type="button"
            {...sx(btn.base, btn.primary, btn.wFull)}
            disabled={startDisabled}
            onClick={onStart}
            whileTap={reducedMotion || startDisabled ? undefined : { scale: 0.98 }}
            transition={pressSpring}
          >
            Start
          </motion.button>
        </div>

        {/* Global disclosure */}
        <details {...sx('group', bf.mt8)}>
          <summary {...sx(bf.detailsSummaryTertiary)}>
            {SAFETY_DISCLOSURE.title}
            <DetailsChevron />
          </summary>
          <ul {...sx(bf.disclosureList)}>
            {SAFETY_DISCLOSURE.points.map((point) => (
              <li key={point} {...sx(bf.textXs, bf.leadingRelaxed, bf.textTertiary)}>{point}</li>
            ))}
          </ul>
        </details>
        </div>
      </div>
    </>
  )
}

/** A wall-clock reader that runs the protocol's first round on a loop. */
function cadencePreview(
  protocol: BreathingProtocol,
  customDurations: CustomPhaseDurations | undefined,
  still: boolean,
): () => BreathSample {
  const phases = protocol.phases.map(({ phase }) => ({
    phase,
    seconds: getPhaseSecondsForRound(protocol, phase, 0, customDurations),
  }))
  const cycle = Math.max(1, getRoundSeconds(protocol, 0, customDurations))
  return () => {
    // Under reduced motion, rest at the top of the inhale.
    let t = still ? phases[0].seconds : (performance.now() / 1000) % cycle
    let index = 0
    while (index < phases.length - 1 && t >= phases[index].seconds) {
      t -= phases[index].seconds
      index++
    }
    const phaseSeconds = phases[index].seconds
    return sampleBreath(
      { phases, phaseIndex: index, phaseSeconds, secondsLeftInPhase: phaseSeconds, status: 'running' },
      Math.min(t, phaseSeconds),
    )
  }
}


// ─────────────────────────────────────────────────────────────────
// Active session (fullscreen)
// ─────────────────────────────────────────────────────────────────

interface ActiveSessionProps {
  session: ActiveSessionState
  config: EngineConfig
  send: (event: SessionEvent) => void
  /** Planned length of the whole session. */
  totalSeconds: number
  advanced: boolean
  reducedMotion: boolean
  pigment: Pigment
  soundEnabled: boolean
}

/** What the fullscreen view is showing; `welcome` is the return from a background pause. */
type Mode = 'leadIn' | 'running' | 'paused' | 'welcome'

function modeOf(session: ActiveSessionState): Mode {
  if (session.tag === 'paused' && session.reason === 'background') return 'welcome'
  return session.tag
}

function ActiveSession({
  session,
  config,
  send,
  totalSeconds,
  advanced,
  reducedMotion,
  pigment,
  soundEnabled,
}: ActiveSessionProps) {
  const { protocol } = config
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled)
  const anchorRef = useRef<HTMLDivElement>(null)
  const bloomRef = useRef<BloomCanvasHandle>(null)
  const bloomButtonRef = useRef<HTMLButtonElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const [live, setLive] = useState(false)

  const mode = modeOf(session)
  const running = mode === 'running'
  const leadIn = session.tag === 'leadIn' ? session : null

  const clock = sessionClock(session)
  const cursor = clock?.cursor ?? null
  const phaseIndex = cursor?.phaseIndex ?? 0
  const phase = getCurrentPhase(config, { phaseIndex })
  const phaseSeconds = cursor ? getCurrentPhaseSeconds(config, cursor) : 0
  const seconds = cursor?.secondsLeftInPhase ?? 0
  const elapsed = cursor ? elapsedSessionSeconds(config, cursor) : 0
  const roundNumber = (cursor?.roundIndex ?? 0) + 1
  const roundsKept = roundNumber - 1
  const phaseLabel = PHASE_LABELS[phase]

  // Controls hide after a few seconds of breathing without interaction, and
  // stay while paused, under reduced motion, or while a keyboard user is in
  // the dock. Pointer moves only touch state when the dock is actually hidden.
  const [hidden, setHidden] = useState(false)
  const hiddenRef = useRef(false)
  const [keyboardInDock, setKeyboardInDock] = useState(false)
  const keyboardModality = useRef(false)
  const alwaysVisible = !running || reducedMotion || keyboardInDock
  const alwaysVisibleRef = useRef(alwaysVisible)
  const controlsVisible = alwaysVisible || !hidden
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setHiddenState = useCallback((next: boolean) => {
    if (hiddenRef.current === next) return
    hiddenRef.current = next
    setHidden(next)
  }, [])

  const armHide = useCallback(() => {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current)
    hideTimer.current = null
    if (alwaysVisibleRef.current) return
    hideTimer.current = setTimeout(() => {
      hideTimer.current = null
      // The dock is about to go inert: keep focus on the page, not the body.
      if (dockRef.current?.contains(document.activeElement)) bloomButtonRef.current?.focus({ preventScroll: true })
      setHiddenState(true)
    }, CONTROLS_HIDE_MS)
  }, [setHiddenState])

  useEffect(() => {
    alwaysVisibleRef.current = alwaysVisible
    armHide()
    return () => {
      if (hideTimer.current !== null) clearTimeout(hideTimer.current)
    }
  }, [alwaysVisible, armHide])

  const showControls = useCallback(() => {
    setHiddenState(false)
    armHide()
  }, [armHide, setHiddenState])

  // Focus moves with the session: Cancel through a lead-in, then the primary
  // control once breathing starts (Start and Cancel unmount under the focus).
  const previousMode = useRef<Mode | null>(null)
  useEffect(() => {
    const previous = previousMode.current
    previousMode.current = mode
    if (previous === mode) return
    if (mode === 'leadIn') cancelRef.current?.focus({ preventScroll: true })
    else if (previous === null || previous === 'leadIn') primaryRef.current?.focus({ preventScroll: true })
  }, [mode])

  const pause = useCallback(() => send({ type: 'PAUSE', now: performance.now() }), [send])
  const resume = useCallback(() => send({ type: 'RESUME', now: performance.now() }), [send])
  const restart = useCallback(() => send({ type: 'RESTART', now: performance.now() }), [send])
  const finish = useCallback(() => send({ type: 'FINISH' }), [send])
  const cancel = useCallback(() => send({ type: 'CANCEL' }), [send])

  // Space pauses and resumes from anywhere except a focused control, which
  // keeps its own native Space behaviour. Escape ends (or cancels the
  // lead-in) and M mutes.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      keyboardModality.current = true
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Escape') {
        event.preventDefault()
        if (mode === 'leadIn') cancel()
        else finish()
        return
      }
      if (event.key === 'm' || event.key === 'M') {
        showControls()
        setSoundEnabled(!useSettingsStore.getState().soundEnabled)
        return
      }
      if (event.code !== 'Space' || mode === 'leadIn') return
      const target = event.target as Element | null
      // The bloom is a button too, but Space on it should still pause.
      const control = target?.closest('button, a, input, textarea, select, summary, [contenteditable="true"]')
      if (control && !control.hasAttribute('data-bloom')) return
      event.preventDefault()
      showControls()
      if (running) pause()
      else resume()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, running, pause, resume, finish, cancel, setSoundEnabled, showControls])

  const engineRead = useBreathReader({
    phases: protocol.phases,
    phaseIndex,
    phaseSeconds,
    secondsLeftInPhase: seconds,
    status: clock?.status ?? 'idle',
    secondStartMs: clock?.secondStartMs ?? 0,
    carryMs: clock?.carryMs ?? 0,
  })
  const read = clock ? engineRead : readRest
  // The ambience fades in through the lead-in and rests while paused.
  useSoundscape(mode === 'leadIn' || running, read)
  const tick = leadIn ? `ready:${leadIn.secondsLeft}` : `${phaseIndex}:${seconds}:${mode}`
  const progress = leadIn || totalSeconds <= 0 ? 0 : Math.min(1, elapsed / totalSeconds)
  const secondsLeft = Math.max(0, totalSeconds - elapsed)
  const cue = getCoachingCue(protocol.id, phase)
  const isBox = protocol.id === TECHNIQUE_IDS.BOX_BREATHING
  const vars = { '--bf-ink': pigment.mass, '--bf-mass': pigment.mass, '--bf-glaze': pigment.glaze } as CSSProperties
  const returning = leadIn?.resumeAt != null

  const word = leadIn ? 'Get ready' : mode === 'welcome' ? 'Welcome back' : mode === 'paused' ? 'Paused' : phaseLabel
  const count = leadIn ? leadIn.secondsLeft : mode === 'welcome' ? null : seconds >= 60 ? formatClock(seconds) : seconds
  const line = leadIn
    ? (returning ? `${phaseLabel} again, from the beginning.` : LEAD_IN_CUE)
    : mode === 'welcome'
      ? `You stepped away, so we paused. ${phaseLabel} starts again from the beginning.`
      : mode === 'paused' ? 'Press Space or Resume when you are ready.' : cue
  const primaryLabel = running ? 'Pause' : mode === 'welcome' ? 'Continue' : 'Resume'

  return (
    <motion.div
      {...sx(ss.fullscreen)}
      style={vars}
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.7, ease: EASE_SETTLE }}
      onPointerMove={showControls}
      onPointerDown={() => {
        keyboardModality.current = false
        // A touch is a gesture iOS accepts for waking audio.
        unlockAudio()
        showControls()
      }}
    >
      <BloomCanvas
        ref={bloomRef}
        anchorRef={anchorRef}
        mode="calm"
        pigment={pigment}
        read={read}
        vignette
        tick={tick}
        onLive={setLive}
      />

      <div
        role="progressbar"
        aria-label="Session progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        {...sx(ss.progress)}
      >
        <div
          {...sx(ss.progressFill, (reducedMotion || !running) && ss.progressFillStill)}
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>

      {/* Round counter */}
      <div {...sx(bf.safeAreaTop, ss.top)}>
        <p {...sx('bf-display', ss.round)}>
          {leadIn && !returning ? protocol.name : (
            <>
              Round {roundNumber} of {config.rounds}
              <span {...sx(ss.timeLeft)}> · {formatClock(secondsLeft)} left</span>
            </>
          )}
        </p>
        {advanced && (
          <p {...sx(bf.recoveryCue)}>
            {ADVANCED_SAFETY_CUE}
          </p>
        )}
      </div>

      {/* The bloom + phase state */}
      <div {...sx(ss.centre)}>
        <button
          ref={bloomButtonRef}
          type="button"
          data-bloom=""
          aria-label={`${protocol.name} visualization`}
          onClick={(event) => {
            bloomRef.current?.poke(event.clientX, event.clientY)
          }}
          {...sx(ss.bloomBtn)}
        >
          <BloomAnchor
            ref={anchorRef}
            pigment={pigment}
            read={read}
            stroke={isBox ? 'box' : 'ring'}
            live={live}
            reducedMotion={reducedMotion}
            tick={tick}
          />
        </button>

        <div {...sx(ss.phaseBlock)}>
          <motion.p
            key={leadIn ? 'ready' : mode === 'running' ? `${phaseIndex}-${phase}` : mode}
            initial={reducedMotion ? false : { opacity: 0, y: 8, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.6, ease: EASE_SETTLE }}
            {...sx('bf-display', wc.italic, ss.phaseWord)}
          >
            {word}
            {/* The cat's face is the centrepiece, so the count sits beside the word. */}
            {count !== null && <span aria-hidden="true" {...sx(ss.count)}>{count}</span>}
          </motion.p>
          <motion.p
            key={`${leadIn ? 'ready' : mode === 'running' ? phase : mode}-cue`}
            initial={reducedMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={chromeTransition}
            {...sx(bf.phaseCue)}
          >
            {line}
          </motion.p>
        </div>
      </div>

      {/* Controls dock */}
      <motion.div
        ref={dockRef}
        id="session-controls"
        data-testid="session-controls"
        initial={false}
        animate={{
          opacity: controlsVisible ? 1 : 0,
          y: reducedMotion ? 0 : (controlsVisible ? 0 : 10),
        }}
        transition={chromeTransition}
        aria-hidden={!controlsVisible}
        inert={!controlsVisible ? true : undefined}
        {...sx(bf.safeAreaBottom, ss.dockWrap)}
        style={{ pointerEvents: controlsVisible ? 'auto' : 'none' }}
        onFocus={() => {
          if (keyboardModality.current) setKeyboardInDock(true)
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setKeyboardInDock(false)
          }
        }}
      >
        {leadIn ? (
          <div {...sx(ss.dock)}>
            <button ref={cancelRef} type="button" {...sx(btn.base, btn.secondary, btn.flex1)} onClick={cancel}>
              <X size={16} strokeWidth={1.75} aria-hidden="true" />
              Cancel
            </button>
          </div>
        ) : (
        <div {...sx(ss.dock)}>
          <button
            type="button"
            {...sx(btn.icon)}
            aria-label={soundEnabled ? 'Mute sound' : 'Unmute sound'}
            onClick={() => setSoundEnabled(!soundEnabled)}
          >
            {soundEnabled
              ? <Volume2 size={18} strokeWidth={1.75} aria-hidden="true" />
              : <VolumeX size={18} strokeWidth={1.75} aria-hidden="true" />}
          </button>
          <motion.button
            ref={primaryRef}
            type="button"
            {...sx(btn.base, btn.primary, btn.flex1)}
            onClick={running ? pause : resume}
            whileTap={reducedMotion ? undefined : { scale: 0.98 }}
            transition={pressSpring}
            aria-keyshortcuts="Space"
          >
            {running
              ? <Pause size={16} strokeWidth={1.75} aria-hidden="true" />
              : <Play size={16} strokeWidth={1.75} aria-hidden="true" />}
            {primaryLabel}
          </motion.button>
          <button
            type="button"
            {...sx(btn.icon)}
            aria-label="Restart session"
            onClick={restart}
          >
            <RotateCcw size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            {...sx(btn.icon)}
            aria-label={roundsKept > 0
              ? `End session and keep ${roundsKept} ${roundsKept === 1 ? 'round' : 'rounds'}`
              : 'End session'}
            aria-keyshortcuts="Escape"
            onClick={finish}
          >
            <Square size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        )}
        <p aria-hidden="true" {...sx(ss.keyHint)}>
          {leadIn ? 'Esc to cancel' : mode === 'welcome' ? 'Space to continue · Esc to end' : 'Space to pause · M to mute · Esc to end'}
        </p>
      </motion.div>
    </motion.div>
  )
}

function DetailsChevron() {
  return (
    <ChevronDown
      size={14}
      strokeWidth={1.75}
      aria-hidden="true"
      className={sx(bf.textTertiary, bf.groupOpenRotate180).className}
    />
  )
}
