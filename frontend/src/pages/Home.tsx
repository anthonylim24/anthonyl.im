import { useMemo, useState } from 'react'
import { useViewTransitionNavigate } from '@/hooks/useViewTransition'
import { motion } from 'motion/react'
import { useHistoryStore } from '@/stores/historyStore'
import { useGamificationStore } from '@/stores/gamificationStore'
import { breathingProtocols, getProtocolCatalog } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS } from '@/lib/constants'
import {
  buildProtocolSessionPath,
  getDefaultProtocolGoal,
  getProtocolRecommendation,
  protocolGoalOptions,
  sessionWindowOptions,
  type ProtocolGoal,
  type SessionWindow,
} from '@/lib/protocolRecommendations'
import {
  getAdvancedProtocolRecoveryStatus,
  isAdvancedBreathingProtocol,
} from '@/lib/advancedProtocolRecovery'
import { buildSessionRoutePath } from '@/lib/sessionRoutes'
import { formatTime, cn } from '@/lib/utils'
import { TechniqueGeometryIcon } from '@/components/ui/TechniqueGeometryIcon'
import { BreathFlowMark } from '@/components/ui/BreathFlowMark'
import { withViteBase } from '@/lib/routerBasename'
import { BreathPatternStrip } from '@/components/breathing/BreathPatternStrip'
import {
  ChevronRight,
  ArrowRight,
  Play,
  Wind,
  Moon,
  Target,
  HeartPulse,
  Zap,
} from 'lucide-react'
import { useHaptics } from '@/hooks/useHaptics'
import { useEntranceMotion } from '@/lib/motionPresets'

const goalIcons = {
  calm: Wind,
  sleep: Moon,
  focus: Target,
  recovery: HeartPulse,
  performance: Zap,
} satisfies Record<ProtocolGoal, typeof Wind>

/* ── Helpers ───────────────────────────────────────── */

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function getStreakMessage(streak: number, dailyGoalMet: boolean): string {
  if (dailyGoalMet && streak >= 30) return '30-day streak.'
  if (dailyGoalMet && streak >= 14) return '14-day streak.'
  if (dailyGoalMet && streak >= 7) return '7-day streak.'
  if (dailyGoalMet) return 'Logged today.'
  if (streak >= 7) return `${streak} days this week.`
  if (streak >= 3) return `${streak}-day streak.`
  return 'Next session.'
}

function formatDurationLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  const parts: string[] = []

  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`)
  }

  if (remainingSeconds > 0) {
    parts.push(`${remainingSeconds} ${remainingSeconds === 1 ? 'second' : 'seconds'}`)
  }

  return parts.join(' ') || '0 seconds'
}

function buildProtocolDetailLabel(
  protocolName: string,
  durationSeconds: number,
  rounds: number,
) {
  const roundLabel = rounds === 1 ? 'round' : 'rounds'
  return `${protocolName}, ${formatDurationLabel(durationSeconds)}, ${rounds} ${roundLabel}`
}

function buildStartProtocolLabel(protocolName: string, durationSeconds: number, rounds: number) {
  return `Start ${buildProtocolDetailLabel(protocolName, durationSeconds, rounds)}`
}

function buildRepeatSessionLabel(
  protocolName: string,
  durationSeconds: number,
  rounds: number,
  hasCustomCadence: boolean,
  requiresSafetyCheck: boolean,
) {
  const sessionDetail = `${buildProtocolDetailLabel(protocolName, durationSeconds, rounds)}${
    hasCustomCadence ? ', custom cadence' : ''
  }`

  if (requiresSafetyCheck) {
    return `Review safety check before repeating ${sessionDetail}`
  }

  return `Repeat ${sessionDetail}`
}

/* ── Component ─────────────────────────────────────── */

export function Home() {
  const navigate = useViewTransitionNavigate()
  const {
    reducedMotion,
    stagger,
    fadeUp,
    transition: motionTransition,
    tap,
  } = useEntranceMotion()
  const currentHour = useMemo(() => new Date().getHours(), [])
  const [selectedGoal, setSelectedGoal] = useState<ProtocolGoal>(() =>
    getDefaultProtocolGoal(currentHour)
  )
  const [selectedWindow, setSelectedWindow] = useState<SessionWindow>('standard')
  const { sessions, getStreak } = useHistoryStore()
  const { dailySessionCount } = useGamificationStore()

  const streak = getStreak()

  const dailyGoalMet = dailySessionCount >= 1

  const { trigger: haptic } = useHaptics()
  const isNewUser = sessions.length === 0
  const protocols = useMemo(() => getProtocolCatalog(), [])
  const advancedRecoveryStatus = useMemo(
    () => getAdvancedProtocolRecoveryStatus(sessions, TECHNIQUE_IDS.CO2_TOLERANCE),
    [sessions],
  )
  const recoveryBlockedTechniqueIds = useMemo(
    () =>
      advancedRecoveryStatus.isActive
        ? protocols
            .filter((protocol) => isAdvancedBreathingProtocol(protocol.id))
            .map((protocol) => protocol.id)
        : [],
    [advancedRecoveryStatus.isActive, protocols],
  )
  const recommendation = useMemo(
    () => getProtocolRecommendation({
      goal: selectedGoal,
      sessionWindow: selectedWindow,
      isNewUser,
      dailyGoalMet,
      currentHour,
      blockedTechniqueIds: recoveryBlockedTechniqueIds,
    }),
    [currentHour, dailyGoalMet, isNewUser, recoveryBlockedTechniqueIds, selectedGoal, selectedWindow]
  )
  const suggestedProtocol = recommendation.primary.protocol
  const suggestedDuration = recommendation.primary.estimatedDuration
  const suggestedPath = buildProtocolSessionPath(
    suggestedProtocol.id,
    recommendation.primary.rounds
  )
  const handleBrowseTechniques = () => {
    haptic('light')
    document.getElementById('techniques-section')?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
  }

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={fadeUp} className="breath-hero relative -mx-5 mb-5 overflow-hidden sm:-mx-8 lg:-mx-12" aria-hidden="true">
        <img
          src={withViteBase('/breathflow-hero-orb.webp')}
          alt=""
          width={1600}
          height={900}
          fetchPriority="high"
          decoding="async"
          className="h-44 w-full object-cover object-[center_42%] sm:h-56 md:h-64 dark:hidden"
        />
        <img
          src={withViteBase('/breathflow-orb-dark.webp')}
          alt=""
          width={768}
          height={768}
          decoding="async"
          className="hidden h-44 w-full object-cover object-center sm:h-56 md:h-64 dark:block"
        />
        <div className="breath-hero-fade pointer-events-none absolute inset-x-0 bottom-0 h-16" />
      </motion.div>

      {/* ── Greeting: one line of context, then the action ── */}
      <motion.div variants={fadeUp} className="pt-1 pb-4 md:pb-5">
        <p className="text-[10px] font-medium tracking-[0.07em] uppercase text-bw-secondary">
          {isNewUser
            ? 'About 5 minutes'
            : getStreakMessage(streak, dailyGoalMet)}
        </p>
        <div className="mt-1 flex items-end gap-3">
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-bw leading-[0.95]">
            {getGreeting()}
          </h1>
          <BreathFlowMark size={36} className="mb-0.5 h-9 w-9 opacity-90" />
        </div>
      </motion.div>

      {isNewUser ? (
        <motion.div variants={fadeUp} className="pb-5">
          <button
            type="button"
            aria-label={`Begin, ${buildProtocolDetailLabel(
              suggestedProtocol.name,
              suggestedDuration,
              recommendation.primary.rounds,
            )}`}
            onClick={() => { haptic('success'); navigate(suggestedPath) }}
            className="flex min-h-11 w-full items-center justify-center gap-2.5 border border-bw-accent bg-bw-accent py-3.5 font-medium text-bw-accent-foreground text-sm transition-opacity hover:opacity-90 md:w-auto md:px-8"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            Begin
          </button>
          <button
            type="button"
            onClick={handleBrowseTechniques}
            className="mt-1 flex min-h-11 w-full items-center justify-center py-2 text-xs font-medium text-bw-tertiary transition-colors hover:text-bw-secondary md:mt-0 md:inline-flex md:w-auto md:px-1"
          >
            All techniques
          </button>
        </motion.div>
      ) : null}

      {/* ── Recommended session ────────────────────────── */}
      <motion.section variants={fadeUp} className="pt-0" aria-labelledby="recommended-heading">
        <div className="border-y border-bw-border py-5 md:py-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="recommended-heading" className="text-[10px] font-medium tracking-[0.07em] uppercase text-bw-secondary">
                Recommended
              </h2>
              <div className="font-display text-2xl md:text-3xl font-semibold text-bw mt-1 leading-none">
                {suggestedProtocol.name}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm text-bw tabular-nums">
                {formatTime(suggestedDuration)}
              </div>
              <div className="text-[10px] text-bw-tertiary font-medium uppercase tracking-[0.07em] mt-1">
                {recommendation.primary.rounds} rounds
              </div>
            </div>
          </div>

          {/* Primary CTA — pulled up under the header so it lives above the fold on small viewports.
              Goal + window adjustments live below the button as "tune your session." */}
          <button
            type="button"
            onClick={() => { haptic('light'); navigate(suggestedPath) }}
            aria-label={buildStartProtocolLabel(
              suggestedProtocol.name,
              suggestedDuration,
              recommendation.primary.rounds,
            )}
            className="group mt-4 flex min-h-12 w-full items-center justify-between gap-4 border border-bw-accent bg-bw-accent px-4 py-3 text-left text-bw-accent-foreground transition-opacity duration-200 hover:opacity-90"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-[color:var(--bw-accent-foreground)]">
                <TechniqueGeometryIcon techniqueId={suggestedProtocol.id} className="text-bw-accent-foreground" />
              </div>
              <div className="min-w-0">
                <span className="block text-[10px] font-medium uppercase tracking-[0.07em] opacity-75">
                  Start
                </span>
                <span className="mt-0.5 block truncate text-sm font-semibold">
                  {suggestedProtocol.name}
                </span>
              </div>
            </div>
            <ArrowRight
              className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </button>

          {/* Tune the recommendation — secondary controls, below the primary CTA */}
          <div className="mt-5 border-t border-bw-border pt-4">
            <h3 className="text-[10px] font-medium tracking-[0.07em] uppercase text-bw-secondary">
              Adjust
            </h3>
            <div className="mt-3">
              <div role="group" aria-label="Breathing goal" className="flex max-w-full gap-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x no-scrollbar sm:w-max sm:overflow-visible">
                {protocolGoalOptions.map((option) => {
                  const Icon = goalIcons[option.id]
                  const selected = selectedGoal === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        haptic('selection')
                        setSelectedGoal(option.id)
                      }}
                      className={cn(
                        'flex min-h-12 min-w-[4.5rem] shrink-0 flex-col items-center justify-center gap-1 border px-2.5 text-[10px] font-medium transition-colors duration-200 sm:min-h-11 sm:min-w-0 sm:flex-row sm:gap-2 sm:px-3 sm:text-xs',
                        selected
                          ? 'border-bw-accent bg-bw-active text-bw'
                          : 'border-bw-border text-bw-tertiary hover:bg-bw-hover hover:text-bw-secondary'
                      )}
                    >
                      <Icon
                        className={cn('h-3.5 w-3.5', selected ? 'text-bw-accent' : 'text-bw-tertiary')}
                        aria-hidden="true"
                      />
                      <span>{option.shortLabel}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div role="group" aria-label="Session length" className="mt-3 grid grid-cols-3 border border-bw-border">
              {sessionWindowOptions.map((option) => {
                const selected = selectedWindow === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      haptic('selection')
                      setSelectedWindow(option.id)
                    }}
                    className={cn(
                      'min-h-11 border-r border-bw-border px-3 text-left transition-colors duration-200 last:border-r-0',
                      selected ? 'bg-bw-active text-bw' : 'text-bw-tertiary hover:bg-bw-hover hover:text-bw-secondary'
                    )}
                  >
                    <span className="block text-xs font-medium">{option.label}</span>
                    <span className="block text-[10px] font-medium uppercase tracking-[0.07em] text-bw-tertiary">
                      {option.shortLabel}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <BreathPatternStrip
            protocol={suggestedProtocol}
            className="mt-5"
            animated
          />

          {advancedRecoveryStatus.isActive && selectedGoal === 'performance' ? (
            <div
              role="status"
              aria-live="polite"
              data-testid="protocol-lab-recovery-window"
              className="mt-4 border-y border-bw-border py-3"
            >
              <div className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary">
                Recovery
              </div>
              <p className="mt-1 text-xs leading-relaxed text-bw-tertiary">
                Moderate protocol for {formatTime(advancedRecoveryStatus.remainingSeconds)} after {advancedRecoveryStatus.lastProtocolName}.
              </p>
            </div>
          ) : null}

          <div className="mt-4 text-xs leading-relaxed text-bw-tertiary">
            {suggestedProtocol.purpose}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium uppercase tracking-[0.07em] text-bw-tertiary">
            <span>{suggestedProtocol.evidence}</span>
            <span>{suggestedProtocol.intensity}</span>
            {suggestedProtocol.safetyChecklist?.length ? <span>Safety check</span> : null}
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {recommendation.alternatives.map((option) => (
              <button
                key={option.protocol.id}
                type="button"
                aria-label={buildStartProtocolLabel(
                  option.protocol.name,
                  option.estimatedDuration,
                  option.rounds,
                )}
                onClick={() => {
                  haptic('selection')
                  navigate(buildProtocolSessionPath(option.protocol.id, option.rounds))
                }}
                className="flex min-h-11 items-center justify-between gap-3 border-t border-bw-border py-3 text-left transition-colors duration-200 hover:bg-bw-hover sm:border sm:px-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-bw">{option.protocol.shortName}</span>
                  <span className="block text-[10px] font-medium uppercase tracking-[0.07em] text-bw-tertiary">
                    {formatTime(option.estimatedDuration)} · {option.protocol.evidenceLevel}
                  </span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-bw-tertiary" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ── Techniques ──────────────────────────────────── */}
      <motion.div variants={fadeUp} className="pt-10 md:pt-16" id="techniques-section">
        <h2 className="text-[10px] font-medium tracking-[0.07em] uppercase text-bw-secondary mb-5 md:mb-8">
          Techniques
        </h2>

        {/* Mobile: horizontal scroll carousel — 2 cards visible */}
        <div
          className="scroll-snap-x md:hidden max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x no-scrollbar"
          style={{ scrollPaddingLeft: '1rem' }}
        >
          <div
            className="grid grid-flow-col gap-3"
            style={{ gridAutoColumns: 'minmax(9rem, calc((100% - 0.75rem) / 2))' }}
          >
            {protocols.map((p) => {
              const id = p.id
              return (
                <motion.button
                  key={id}
                  type="button"
                  aria-label={`Start ${p.name}`}
                  whileTap={tap(0.97)}
                  transition={motionTransition}
                  className="min-h-11 border-t border-bw-border pt-4 pb-2 text-left bg-transparent"
                  style={{ scrollSnapAlign: 'start' }}
                  onClick={() => { haptic('light'); navigate(`/breathwork/session?technique=${id}`) }}
                >
                  <div
                    className="h-8 w-8 flex items-center justify-center mb-3 border border-bw-border"
                    style={{ viewTransitionName: `technique-icon-${id}` } as React.CSSProperties}
                  >
                    <TechniqueGeometryIcon techniqueId={id} className="text-bw-secondary" />
                  </div>
                  <h3
                    className="font-medium text-sm text-bw leading-tight"
                    style={{ viewTransitionName: `technique-name-${id}` } as React.CSSProperties}
                  >
                    {p.name}
                  </h3>
                  <div className="flex items-center gap-1 mt-2 flex-wrap">
                    {p.phases.map((phase, i) => (
                      <span key={i} className="flex items-center gap-0.5">
                        <span className="text-[10px] font-mono text-bw-tertiary">{phase.duration}s</span>
                        {i < p.phases.length - 1 && (
                          <span className="text-bw-tertiary text-[10px]">{'\u2192'}</span>
                        )}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 text-[10px] text-bw-tertiary font-medium uppercase tracking-[0.07em]">
                    {p.category}
                  </div>
                </motion.button>
              )
            })}
          </div>
        </div>

        {/* Desktop: border-separated technique rows */}
        <div className="hidden md:block">
          <div className="divide-y divide-bw-border">
            {protocols.map((protocol) => {
              const id = protocol.id
              return (
                <motion.button
                  key={id}
                  type="button"
                  aria-label={`Start ${protocol.name}`}
                  whileTap={tap(0.99)}
                  transition={motionTransition}
                  className="w-full flex items-center gap-4 py-5 text-left group hover:bg-bw-hover transition-colors duration-200"
                  onClick={() => { haptic('light'); navigate(`/breathwork/session?technique=${id}`) }}
                >
                  <div
                    className="h-8 w-8 flex items-center justify-center shrink-0 border border-bw-border"
                    style={{ viewTransitionName: `technique-icon-${id}` } as React.CSSProperties}
                  >
                    <TechniqueGeometryIcon techniqueId={id} className="text-bw-secondary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3
                      className="font-medium text-base text-bw leading-tight"
                      style={{ viewTransitionName: `technique-name-${id}` } as React.CSSProperties}
                    >
                      {protocol.name}
                    </h3>
                    <p className="text-xs text-bw-tertiary mt-0.5 line-clamp-1">
                      {protocol.purpose} · {protocol.bestFor[0]}
                    </p>
                  </div>
                  <div className="hidden lg:flex items-center gap-3 shrink-0 text-[10px] font-medium uppercase tracking-[0.07em] text-bw-tertiary">
                    <span>{protocol.evidence}</span>
                    <span>{protocol.intensity}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {protocol.phases.map((phase, i) => (
                      <span key={i} className="flex items-center gap-0.5">
                        <span className="text-[10px] font-mono text-bw-tertiary">{phase.duration}s</span>
                        {i < protocol.phases.length - 1 && (
                          <span className="text-bw-tertiary text-[10px]">{'\u2192'}</span>
                        )}
                      </span>
                    ))}
                  </div>
                  <ArrowRight
                    className="h-3.5 w-3.5 text-bw-tertiary shrink-0 group-hover:text-bw group-hover:translate-x-0.5 transition-all duration-200"
                    aria-hidden="true"
                  />
                </motion.button>
              )
            })}
          </div>
        </div>
      </motion.div>

      {/* ── Recent Sessions ──────────────────────────────── */}
      {sessions.length > 0 && (
        <motion.div variants={fadeUp} className="pt-16 sm:pt-20">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[10px] font-medium tracking-[0.07em] uppercase text-bw-secondary">Recent</h2>
            <button
              type="button"
              aria-label="View all sessions"
              onClick={() => { haptic('selection'); navigate('/breathwork/progress') }}
              className="flex min-h-11 items-center gap-1 text-xs font-medium text-bw-tertiary transition-colors hover:text-bw"
            >
              All
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>

          <div className="divide-y divide-bw-border">
            {sessions.slice(0, 3).map((session) => {
              const protocol = breathingProtocols[session.techniqueId]
              const requiresSafetyCheck = Boolean(protocol.safetyChecklist?.length)
              return (
                <motion.button
                  key={session.id}
                  type="button"
                  whileTap={tap(0.99)}
                  transition={motionTransition}
                  aria-label={buildRepeatSessionLabel(
                    protocol.name,
                    session.durationSeconds,
                    session.rounds,
                    Boolean(session.customPhaseDurations),
                    requiresSafetyCheck,
                  )}
                  className="w-full flex items-center gap-4 py-4 text-left group hover:bg-bw-hover transition-colors duration-200"
                  onClick={() => { haptic('selection'); navigate(buildSessionRoutePath(session)) }}
                >
                  <div className="h-8 w-8 flex items-center justify-center shrink-0 border border-bw-border">
                    <TechniqueGeometryIcon techniqueId={session.techniqueId} className="text-bw-secondary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-bw truncate">
                      {protocol.name}
                    </div>
                    <div className="text-[10px] text-bw-tertiary mt-0.5">
                      {session.rounds} rounds
                      {session.customPhaseDurations && ' · custom cadence'}
                      {session.maxHoldTime > 0 && ` \u00b7 ${session.maxHoldTime}s best hold`}
                      {requiresSafetyCheck && ' · safety check'}
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-bw-tertiary shrink-0 group-hover:text-bw transition-colors" />
                </motion.button>
              )
            })}
          </div>
        </motion.div>
      )}

    </motion.div>
  )
}
