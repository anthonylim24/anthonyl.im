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
import { btnIcon, btnPrimary } from '../components/buttonStyles'
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
          setAnnouncement(`${protocol.name} started. Round 1 of ${rounds}. ${PHASE_LABELS[protocol.phases[0].phase]}.`)
          break
        case 'restart':
          playCue('start', audio)
          vibrate('light', haptics)
          setAnnouncement(`Restarted. Round 1 of ${rounds}.`)
          break
        case 'phase': {
          playCue(event.phase, audio)
          const cue = getCoachingCue(protocol.id, event.phase)
          setAnnouncement(
            `Round ${event.roundIndex + 1} of ${rounds}. ${PHASE_LABELS[event.phase]}. ${cue}`,
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
        <div className="py-6">
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
    <div className="pb-8">
      <h1 className="bf-display text-3xl tracking-tight text-bw">Breathe</h1>

      {/* Technique switch */}
      <LayoutGroup id="session-technique">
        <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3" role="group" aria-label="Technique">
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
                className={[
                  'relative min-h-11 px-3 py-2 text-left text-sm',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bw-accent',
                  selected ? 'font-medium text-bw' : 'text-bw-secondary hover:text-bw',
                ].join(' ')}
              >
                {selected ? (
                  reducedMotion ? (
                    <span aria-hidden="true" className="absolute inset-0 bg-bw-accent-subtle" />
                  ) : (
                    <motion.span
                      aria-hidden="true"
                      layoutId="session-technique-ink"
                      className="absolute inset-0 bg-bw-accent-subtle"
                      transition={inkSpring}
                    />
                  )
                ) : null}
                <span className="relative block truncate">{entry.name}</span>
                <span className="relative block text-[11px] capitalize text-bw-tertiary">
                  {entry.category}
                  {isAdvancedProtocol(entry) ? ' · safety check' : ''}
                </span>
              </motion.button>
            )
          })}
        </div>
      </LayoutGroup>

      <div className="mt-8 border-t border-bw-border pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <h2 className="bf-display text-xl tracking-tight text-bw">{protocol.name}</h2>
            <p className="mt-0.5 text-sm text-bw-secondary">{protocol.description}</p>
          </div>
          <p className="text-sm tabular-nums text-bw-secondary">{formatDuration(planned)}</p>
        </div>

        <PhaseStrip
          protocol={protocol}
          customDurations={customDurations}
          animated={!reducedMotion}
          className="mt-4"
        />

        {/* Rounds */}
        <div className="mt-5 flex items-center justify-between">
          <span className="text-sm text-bw">Rounds</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={btnIcon}
              aria-label="One round fewer"
              disabled={rounds <= 1}
              onClick={() => onUpdate({ rounds: clampRounds(protocol, rounds - 1) })}
            >
              <Minus size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <span className="w-10 text-center text-sm font-medium tabular-nums text-bw">{rounds}</span>
            <button
              type="button"
              className={btnIcon}
              aria-label="One round more"
              disabled={rounds >= maxRounds}
              onClick={() => onUpdate({ rounds: clampRounds(protocol, rounds + 1) })}
            >
              <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Cadence */}
        <details className="group mt-2 border-t border-bw-border-subtle pt-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm text-bw [&::-webkit-details-marker]:hidden">
            Cadence
            <span className="flex items-center gap-2">
              <span className="text-xs text-bw-tertiary group-open:hidden">
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
        <details className="group border-t border-bw-border-subtle pt-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm text-bw [&::-webkit-details-marker]:hidden">
            <span>Why it works</span>
            <span className="flex items-center gap-2">
              <span className="text-xs capitalize text-bw-tertiary group-open:hidden">
                {protocol.evidenceLevel} evidence
              </span>
              <DetailsChevron />
            </span>
          </summary>
          <div className="pb-2 pt-1">
            <p className="text-sm leading-relaxed text-bw-secondary">{protocol.science}</p>
            <p className="mt-2 text-xs text-bw-tertiary">
              {protocol.evidenceLabel} · {protocol.breathsPerMinute} breaths/min · best for{' '}
              {protocol.bestFor.join(', ').toLowerCase()}
            </p>
            {protocol.caution && (
              <p className="mt-2 text-xs leading-relaxed text-bw-secondary">{protocol.caution}</p>
            )}
            <ul className="mt-3 space-y-1.5">
              {protocol.citations.map((citation) => (
                <li key={citation.url} className="text-xs leading-relaxed text-bw-tertiary">
                  {citation.authors} ({citation.year}).{' '}
                  <a
                    href={citation.url}
                    target="_blank"
                    rel="noreferrer"
                    className="break-words text-bw-secondary underline decoration-bw-border underline-offset-2 hover:text-bw-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bw-accent"
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
      <div className="mt-6">
        <MoodPicker label="How do you feel right now? (optional)" value={moodBefore} onChange={onMoodBefore} />
      </div>

      {/* Safety gate */}
      {advanced && !blockedByViewport && (
        <div className="mt-6">
          <SafetyChecklist protocol={protocol} checkedItems={checkedSafety} onToggle={onToggleSafety} />
        </div>
      )}

      {blockedByViewport && (
        <Notice role="alert" tone="danger" title="Not available here" className="mt-6">
          {CONSTRAINED_VIEWPORT_MESSAGE}
        </Notice>
      )}

      {blockedByRecovery && !blockedByViewport && (
        <Notice title="Recovery in progress" className="mt-6" live={false}>
          <p className="tabular-nums">
            Breathe easy for {recoveryRemaining}s before the next intense session.
          </p>
        </Notice>
      )}

      {/* Start */}
      <div className="mt-7">
        <p className="mb-2.5 text-center text-sm text-bw-secondary">{READY_CUE}</p>
        <motion.button
          type="button"
          className={`${btnPrimary} w-full`}
          disabled={startDisabled}
          onClick={onStart}
          whileTap={reducedMotion || startDisabled ? undefined : { scale: 0.98 }}
          transition={pressSpring}
        >
          Start
        </motion.button>
      </div>

      {/* Global disclosure */}
      <details className="group mt-8">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between py-2 text-xs text-bw-tertiary [&::-webkit-details-marker]:hidden">
          {SAFETY_DISCLOSURE.title}
          <DetailsChevron />
        </summary>
        <ul className="mt-1 space-y-1.5">
          {SAFETY_DISCLOSURE.points.map((point) => (
            <li key={point} className="text-xs leading-relaxed text-bw-tertiary">{point}</li>
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
      className="fixed inset-0 z-50 flex flex-col bg-bw-canvas"
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={chromeTransition}
      onPointerMove={showControls}
      onPointerDown={showControls}
    >
      <BreathStarfield inline />
      {/* Round counter */}
      <div className="pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
        <p className="bf-display text-sm text-bw-secondary">
          Round {engine.roundNumber} of {engine.totalRounds}
        </p>
        {advanced && (
          <p className="mx-auto mt-1.5 max-w-xs px-4 text-xs leading-snug text-bw-tertiary">
            {ADVANCED_SAFETY_CUE}
          </p>
        )}
      </div>

      {/* Visualization + phase state */}
      <div className="flex flex-1 flex-col items-center justify-center gap-7 px-6">
        <button
          type="button"
          aria-label={`${protocol.name} visualization`}
          onClick={onVisualTap}
          className="cursor-default rounded-full focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-bw-accent"
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

        <div className="text-center">
          <motion.p
            key={paused ? 'paused' : engine.phase}
            initial={reducedMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={chromeTransition}
            className="text-xl font-medium tracking-tight text-bw"
          >
            {paused ? 'Paused' : PHASE_LABELS[engine.phase]}
          </motion.p>
          <p className="bf-display mt-2 text-5xl tracking-tight text-bw" aria-hidden="true">
            {formatClock(engine.secondsLeftInPhase)}
          </p>
          <motion.p
            key={`${paused ? 'paused' : engine.phase}-cue`}
            initial={reducedMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={chromeTransition}
            className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-bw-secondary"
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
        className="pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        style={{ pointerEvents: controlsVisible ? 'auto' : 'none' }}
        onFocus={() => setFocusWithin(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setFocusWithin(false)
          }
        }}
      >
        <div className="mx-auto flex max-w-sm items-center justify-center gap-2 px-6">
          <button
            type="button"
            className={btnIcon}
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
            className={`${btnPrimary} flex-1`}
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
            className={btnIcon}
            aria-label="Restart session"
            onClick={engine.restart}
            tabIndex={controlsVisible ? 0 : -1}
          >
            <RotateCcw size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={btnIcon}
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

function DetailsChevron() {
  return (
    <ChevronDown
      size={14}
      strokeWidth={1.75}
      aria-hidden="true"
      className="text-bw-tertiary transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-open:rotate-180 motion-reduce:transition-none"
    />
  )
}

