import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  Volume2,
  VolumeX,
} from 'lucide-react'
import { PHASE_LABELS, TECHNIQUE_IDS } from '@/lib/constants'
import type { MoodValue } from '@/lib/mood'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useHistoryStore } from '@/stores/historyStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { playCue } from '../engine/audio'
import { vibrate } from '../engine/haptics'
import type { EngineEvent } from '../engine/sessionEngine'
import { useSessionEngine } from '../engine/useSessionEngine'
import { levelForXP } from '../gamify/levels'
import { buildSessionInsight, type SessionInsight } from '../gamify/insights'
import { resolveOrbTheme } from '../gamify/orbThemes'
import { useConstrainedViewport } from '../platform/constrainedViewport'
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
import { ADVANCED_SAFETY_CUE, getCoachingCue, READY_CUE } from '../protocols/coaching'
import type { BreathingProtocol } from '../protocols/types'
import { CONSTRAINED_VIEWPORT_MESSAGE, SAFETY_DISCLOSURE } from '../safety/disclosure'
import { useRecoveryStatus } from '../safety/useRecoveryStatus'
import { completeSession, type CompletionResult } from '../session/completeSession'
import { buildSessionSearch, parseSessionSearch } from '../session/urlParams'
import { BoxVisualization } from '../components/BoxVisualization'
import { BreathStarfield } from '../components/BreathStarfield'
import { CadenceEditor } from '../components/CadenceEditor'
import { LiveAnnouncer } from '../components/LiveAnnouncer'
import { MoodPicker } from '../components/MoodPicker'
import { OrbVisualization } from '../components/OrbVisualization'
import { TideVisualization } from '../components/TideVisualization'
import { PhaseStrip } from '../components/PhaseStrip'
import { SafetyChecklist } from '../components/SafetyChecklist'
import { SessionSummary } from '../components/SessionSummary'
import { btn } from '../components/buttonStyles.stylex'
import { sx } from '@/styles/merge'
import { bf } from '../styles/breathflow.stylex'
import { formatClock, formatDuration } from '../components/format'
import { Notice } from '../motion/Notice'
import { chromeTransition, inkSpring, pressSpring } from '../motion/tokens'

const CONTROLS_HIDE_MS = 3000
const EASTER_EGG_TAPS = 5
const EASTER_EGG_WINDOW_MS = 2000

interface SummaryState {
  result: CompletionResult
  insight: SessionInsight
  protocol: BreathingProtocol
}

export function SessionPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useMemo(() => parseSessionSearch(location.search), [location.search])

  const protocol = getProtocol(params.techniqueId)
  const rounds = params.rounds
  const customDurations = params.customDurations
  const advanced = isAdvancedProtocol(protocol)

  const [moodBefore, setMoodBefore] = useState<MoodValue | undefined>(undefined)
  const [moodAfter, setMoodAfter] = useState<MoodValue | undefined>(undefined)
  const [checkedSafety, setCheckedSafety] = useState<ReadonlySet<number>>(new Set())
  const [summary, setSummary] = useState<SummaryState | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [altVisual, setAltVisual] = useState(false)

  const reducedMotion = useReducedMotion()
  const constrained = useConstrainedViewport()
  const recovery = useRecoveryStatus()

  const soundEnabled = useSettingsStore((s) => s.soundEnabled)
  const xp = useGamificationStore((s) => s.xp)
  const selectedTheme = useGamificationStore((s) => s.selectedTheme)
  const orbTheme = resolveOrbTheme(selectedTheme, levelForXP(xp))

  const completedRef = useRef(false)
  const tapTimesRef = useRef<number[]>([])

  const engineConfig = useMemo(
    () => ({ protocol, rounds, customDurations }),
    [protocol, rounds, customDurations],
  )

  const handleEngineEvent = useCallback(
    (event: EngineEvent | { type: 'start' | 'pause' | 'resume' | 'stop' | 'restart' }) => {
      const settings = useSettingsStore.getState()
      const audio = { enabled: settings.soundEnabled, volume: settings.soundVolume }
      const haptics = settings.hapticsEnabled

      switch (event.type) {
        case 'start':
          playCue('start', audio)
          vibrate('success', haptics)
          setAnnouncement(
            `${protocol.name} started. Round 1 of ${rounds}. ${PHASE_LABELS[protocol.phases[0].phase]} for ${formatPhaseSeconds(getPhaseSecondsForRound(protocol, protocol.phases[0].phase, 0, customDurations))}.`,
          )
          break
        case 'restart':
          playCue('start', audio)
          vibrate('light', haptics)
          setAnnouncement(`Restarted. Round 1 of ${rounds}.`)
          break
        case 'phase': {
          playCue(event.phase, audio)
          const cue = getCoachingCue(protocol.id, event.phase)
          const seconds = getPhaseSecondsForRound(protocol, event.phase, event.roundIndex, customDurations)
          setAnnouncement(
            `Round ${event.roundIndex + 1} of ${rounds}. ${PHASE_LABELS[event.phase]} for ${formatPhaseSeconds(seconds)}. ${cue}`,
          )
          break
        }
        case 'pause':
          vibrate('light', haptics)
          setAnnouncement('Paused.')
          break
        case 'resume':
          vibrate('light', haptics)
          setAnnouncement('Resumed.')
          break
        case 'stop':
          vibrate('error', haptics)
          setAnnouncement('Session stopped. Nothing was saved.')
          break
        case 'complete': {
          if (completedRef.current) break
          completedRef.current = true
          playCue('complete', audio)

          const result = completeSession({
            techniqueId: protocol.id,
            rounds,
            customDurations,
            holdTimes: event.holdTimes,
            moodBefore,
          })
          const insight = buildSessionInsight({
            protocol,
            rounds,
            durationSeconds: result.session.durationSeconds,
            holdTimes: result.session.holdTimes,
            isPersonalBest: result.isPersonalBest,
            newBadgeCount: result.newBadgeIds.length,
          })
          vibrate(result.isPersonalBest || result.newBadgeIds.length > 0 ? 'celebration' : 'success', haptics)
          setSummary({ result, insight, protocol })
          setAnnouncement(`Session complete. ${protocol.name}, ${rounds} rounds. ${result.xpEarned} XP earned.`)
          break
        }
      }
    },
    [protocol, rounds, customDurations, moodBefore],
  )

  const engine = useSessionEngine(engineConfig, handleEngineEvent)
  const isActive = engine.status === 'running' || engine.status === 'paused'

  // Home's Begin CTA deep-links with autostart=1: start immediately for
  // non-safety-gated protocols, then drop the flag from the URL.
  const autostart = useMemo(
    () => new URLSearchParams(location.search).get('autostart') === '1',
    [location.search],
  )
  const autostartHandledRef = useRef(false)
  useEffect(() => {
    if (!autostart || autostartHandledRef.current) return
    autostartHandledRef.current = true
    navigate(`/breathwork/session?${buildSessionSearch(params)}`, { replace: true })
    if (!advanced && engine.status === 'idle') {
      completedRef.current = false
      engine.start()
    }
  }, [autostart, advanced, engine, navigate, params])

  useWakeLock(isActive)
  useScrollLock(isActive)

  // Advanced-session safety reminder joins the announcements once at start.
  useEffect(() => {
    if (isActive && advanced) {
      const timeout = setTimeout(() => setAnnouncement(ADVANCED_SAFETY_CUE), 4000)
      return () => clearTimeout(timeout)
    }
  }, [isActive, advanced])

  function updateParams(next: {
    techniqueId?: typeof protocol.id
    rounds?: number
    customDurations?: CustomPhaseDurations | undefined
  }) {
    const techniqueId = next.techniqueId ?? protocol.id
    const nextProtocol = getProtocol(techniqueId)
    const isSwitch = techniqueId !== protocol.id
    const search = buildSessionSearch({
      techniqueId,
      rounds: isSwitch ? nextProtocol.defaultRounds : (next.rounds ?? rounds),
      customDurations: isSwitch
        ? undefined
        : ('customDurations' in next ? next.customDurations : customDurations),
    })
    navigate(`/breathwork/session?${search}`, { replace: true })
    if (isSwitch) setCheckedSafety(new Set())
  }

  const allSafetyChecked = (protocol.safetyChecklist ?? []).every((_, i) => checkedSafety.has(i))
  const blockedByRecovery = advanced && recovery.isActive
  const blockedByViewport = advanced && constrained
  const startDisabled = advanced && (!allSafetyChecked || blockedByRecovery || blockedByViewport)

  function handleStart() {
    if (startDisabled) return
    completedRef.current = false
    setMoodAfter(undefined)
    setSummary(null)
    engine.start()
  }

  function handleRepeat() {
    // Only reachable for non-advanced protocols (summary hides Repeat otherwise).
    completedRef.current = false
    setSummary(null)
    setMoodBefore(undefined)
    setMoodAfter(undefined)
    engine.restart()
  }

  function handleMoodAfter(value: MoodValue | undefined) {
    setMoodAfter(value)
    if (summary) {
      useHistoryStore.getState().setSessionMood(summary.result.session.id, { moodAfter: value })
    }
  }

  function handleVisualTap() {
    if (reducedMotion) return
    const now = Date.now()
    tapTimesRef.current = [...tapTimesRef.current, now].filter(
      (t) => now - t <= EASTER_EGG_WINDOW_MS,
    )
    if (tapTimesRef.current.length >= EASTER_EGG_TAPS) {
      tapTimesRef.current = []
      setAltVisual((value) => !value)
    }
  }

  return (
    <>
      <LiveAnnouncer message={announcement} />
      {summary ? (
        <div {...sx(bf.sessionSummaryWrap)}>
          <SessionSummary
            protocol={summary.protocol}
            result={summary.result}
            insight={summary.insight}
            moodAfter={moodAfter}
            onMoodAfter={handleMoodAfter}
            onRepeat={handleRepeat}
          />
        </div>
      ) : isActive ? (
        <ActiveSession
          protocol={protocol}
          engine={engine}
          advanced={advanced}
          reducedMotion={reducedMotion}
          altVisual={altVisual}
          orbColors={orbTheme.colors}
          soundEnabled={soundEnabled}
          onVisualTap={handleVisualTap}
        />
      ) : (
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
            reducedMotion={reducedMotion}
          />
        </div>
      )}
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
  reducedMotion: boolean
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
  reducedMotion,
}: SessionSetupProps) {
  const maxRounds = getMaxRounds(protocol)
  const planned = plannedSessionSeconds(protocol, rounds, customDurations)
  const advanced = isAdvancedProtocol(protocol)

  return (
    <div {...sx(bf.pb8)}>
      <h1 {...sx('bf-display', bf.text3xl, bf.trackingTight, bf.textBw)}>Breathe</h1>

      {/* Technique switch */}
      <LayoutGroup id="session-technique">
        <div {...sx(bf.mt5, bf.techniqueGrid)} role="group" aria-label="Technique">
          {PROTOCOLS.map((entry) => {
            const selected = entry.id === protocol.id
            return (
              <motion.button
                key={entry.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onUpdate({ techniqueId: entry.id })}
                whileTap={reducedMotion ? undefined : { scale: 0.99 }}
                transition={pressSpring}
                {...sx(
                  bf.techniqueBtn,
                  selected ? bf.techniqueBtnActive : bf.techniqueBtnInactive,
                )}
              >
                {selected ? (
                  reducedMotion ? (
                    <span aria-hidden="true" {...sx(bf.techniqueInk)} />
                  ) : (
                    <motion.span
                      aria-hidden="true"
                      layoutId="session-technique-ink"
                      {...sx(bf.techniqueInk)}
                      transition={inkSpring}
                    />
                  )
                ) : null}
                <span {...sx(bf.relative, bf.block, bf.truncate)}>{entry.name}</span>
                <span {...sx(bf.relative, bf.block, bf.text11px, bf.capitalize, bf.textTertiary)}>
                  {entry.category}
                  {isAdvancedProtocol(entry) ? ' · safety check' : ''}
                </span>
              </motion.button>
            )
          })}
        </div>
      </LayoutGroup>

      <div {...sx(bf.mt8, bf.borderTop, bf.pt5)}>
        <div {...sx(bf.flexBaselineBetween)}>
          <div {...sx(bf.minW0)}>
            <h2 {...sx('bf-display', bf.textXl, bf.trackingTight, bf.textBw)}>{protocol.name}</h2>
            <p {...sx(bf.mt05, bf.textSm, bf.textSecondary)}>{protocol.description}</p>
          </div>
          <p {...sx(bf.textSm, bf.tabularNums, bf.textSecondary)}>{formatDuration(planned)}</p>
        </div>

        <PhaseStrip
          protocol={protocol}
          customDurations={customDurations}
          animated={!reducedMotion}
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
  )
}

// ─────────────────────────────────────────────────────────────────
// Active session (fullscreen)
// ─────────────────────────────────────────────────────────────────

interface ActiveSessionProps {
  protocol: BreathingProtocol
  engine: ReturnType<typeof useSessionEngine>
  advanced: boolean
  reducedMotion: boolean
  altVisual: boolean
  orbColors: [string, string]
  soundEnabled: boolean
  onVisualTap: () => void
}

function ActiveSession({
  protocol,
  engine,
  advanced,
  reducedMotion,
  altVisual,
  orbColors,
  soundEnabled,
  onVisualTap,
}: ActiveSessionProps) {
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled)

  const running = engine.status === 'running'
  const paused = engine.status === 'paused'
  // Controls stay visible when paused, focused, or under reduced motion.
  const [hidden, setHidden] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const [interactionStamp, setInteractionStamp] = useState(0)
  const alwaysVisible = paused || reducedMotion || focusWithin
  const controlsVisible = alwaysVisible || !hidden

  const showControls = useCallback(() => {
    setHidden(false)
    setInteractionStamp(Date.now())
  }, [])

  // Auto-hide after 3s of running without interaction. The timeout callback
  // is the only place hiding happens, so pausing/focus never races it.
  useEffect(() => {
    if (alwaysVisible) return
    const timeout = setTimeout(() => setHidden(true), CONTROLS_HIDE_MS)
    return () => clearTimeout(timeout)
  }, [alwaysVisible, interactionStamp])

  const phaseIndex = engine.phaseIndex
  const cue = getCoachingCue(protocol.id, engine.phase)
  const isBox = protocol.id === TECHNIQUE_IDS.BOX_BREATHING

  return (
    <motion.div
      {...sx(bf.sessionFullscreen)}
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={chromeTransition}
      onPointerMove={showControls}
      onPointerDown={showControls}
    >
      <BreathStarfield inline />
      {/* Round counter */}
      <div {...sx(bf.safeAreaTop, bf.textCenterBlock)}>
        <p {...sx('bf-display', bf.textSm, bf.textSecondary)}>
          Round {engine.roundNumber} of {engine.totalRounds}
        </p>
        {advanced && (
          <p {...sx(bf.recoveryCue)}>
            {ADVANCED_SAFETY_CUE}
          </p>
        )}
      </div>

      {/* Visualization + phase state */}
      <div {...sx(bf.flexColCenter, bf.gap7, bf.px6)}>
        <button
          type="button"
          aria-label={`${protocol.name} visualization`}
          onClick={onVisualTap}
          {...sx(bf.visualTapBtn)}
        >
          {altVisual && !reducedMotion ? (
            <TideVisualization
              phases={protocol.phases}
              phaseIndex={phaseIndex}
              phaseSeconds={engine.phaseSeconds}
              secondsLeftInPhase={engine.secondsLeftInPhase}
              status={engine.status}
              colors={orbColors}
            />
          ) : isBox ? (
            <BoxVisualization
              phaseIndex={phaseIndex}
              phaseSeconds={engine.phaseSeconds}
              secondsLeftInPhase={engine.secondsLeftInPhase}
              roundIndex={engine.roundNumber - 1}
              status={engine.status}
              accentColor={orbColors[0]}
              reducedMotion={reducedMotion}
            />
          ) : (
            <OrbVisualization
              phases={protocol.phases}
              phaseIndex={phaseIndex}
              phaseSeconds={engine.phaseSeconds}
              secondsLeftInPhase={engine.secondsLeftInPhase}
              status={engine.status}
              colors={orbColors}
              reducedMotion={reducedMotion}
            />
          )}
        </button>

        <div {...sx(bf.textCenterBlock)}>
          <motion.p
            key={paused ? 'paused' : engine.phase}
            initial={reducedMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={chromeTransition}
            {...sx(bf.phaseLabel)}
          >
            {paused ? 'Paused' : PHASE_LABELS[engine.phase]}
          </motion.p>
          <p {...sx('bf-display', bf.mt2, bf.text5xl, bf.trackingTight, bf.textBw)} aria-hidden="true">
            {formatClock(engine.secondsLeftInPhase)}
          </p>
          <motion.p
            key={`${paused ? 'paused' : engine.phase}-cue`}
            initial={reducedMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={chromeTransition}
            {...sx(bf.phaseCue)}
          >
            {cue}
          </motion.p>
        </div>
      </div>

      {/* Controls dock */}
      <motion.div
        id="session-controls"
        data-testid="session-controls"
        initial={false}
        animate={{
          opacity: controlsVisible ? 1 : 0,
          y: reducedMotion ? 0 : (controlsVisible ? 0 : 8),
        }}
        transition={chromeTransition}
        aria-hidden={!controlsVisible}
        inert={!controlsVisible ? true : undefined}
        {...sx(bf.safeAreaBottom)}
        style={{ pointerEvents: controlsVisible ? 'auto' : 'none' }}
        onFocus={() => setFocusWithin(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setFocusWithin(false)
          }
        }}
      >
        <div {...sx(bf.controlsDock)}>
          <button
            type="button"
            {...sx(btn.icon)}
            aria-label={soundEnabled ? 'Mute sound' : 'Unmute sound'}
            onClick={() => setSoundEnabled(!soundEnabled)}
            tabIndex={controlsVisible ? 0 : -1}
          >
            {soundEnabled
              ? <Volume2 size={18} strokeWidth={1.75} aria-hidden="true" />
              : <VolumeX size={18} strokeWidth={1.75} aria-hidden="true" />}
          </button>
          <motion.button
            type="button"
            {...sx(btn.base, btn.primary, btn.flex1)}
            onClick={running ? engine.pause : engine.resume}
            whileTap={reducedMotion ? undefined : { scale: 0.98 }}
            transition={pressSpring}
            tabIndex={controlsVisible ? 0 : -1}
          >
            {running
              ? <Pause size={16} strokeWidth={1.75} aria-hidden="true" />
              : <Play size={16} strokeWidth={1.75} aria-hidden="true" />}
            {running ? 'Pause' : 'Resume'}
          </motion.button>
          <button
            type="button"
            {...sx(btn.icon)}
            aria-label="Restart session"
            onClick={engine.restart}
            tabIndex={controlsVisible ? 0 : -1}
          >
            <RotateCcw size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            {...sx(btn.icon)}
            aria-label="Stop and discard session"
            onClick={engine.stop}
            tabIndex={controlsVisible ? 0 : -1}
          >
            <Square size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function formatPhaseSeconds(seconds: number): string {
  return seconds === 1 ? '1 second' : `${seconds} seconds`
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

