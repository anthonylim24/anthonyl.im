import { useMemo, useState } from 'react'
import { useViewTransitionNavigate } from '@/hooks/useViewTransition'
import { motion } from 'motion/react'
import { useHistoryStore } from '@/stores/historyStore'
import { useGamificationStore } from '@/stores/gamificationStore'
import { getLevelForXP, getXPForLevel, getLevelTitle } from '@/lib/gamification'
import { breathingProtocols, getProtocolCatalog } from '@/lib/breathingProtocols'
import {
  buildProtocolSessionPath,
  getDefaultProtocolGoal,
  getProtocolRecommendation,
  protocolGoalOptions,
  sessionWindowOptions,
  type ProtocolGoal,
  type SessionWindow,
} from '@/lib/protocolRecommendations'
import { formatTime, cn } from '@/lib/utils'
import { TechniqueGeometryIcon } from '@/components/ui/TechniqueGeometryIcon'
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
  if (dailyGoalMet && streak >= 30) return 'A month of consistency. Remarkable discipline.'
  if (dailyGoalMet && streak >= 14) return 'Two weeks strong. This is becoming part of you.'
  if (dailyGoalMet && streak >= 7) return 'A full week. Your body is learning.'
  if (dailyGoalMet && streak >= 3) return 'Building momentum. Keep showing up.'
  if (dailyGoalMet) return 'You\'ve completed today\'s goal'
  if (streak >= 7) return `${streak} day streak — don't break the chain`
  if (streak >= 3) return 'Your streak is growing. Ready for today?'
  return 'Ready for today\'s session?'
}

/* ── Component ─────────────────────────────────────── */

export function Home() {
  const navigate = useViewTransitionNavigate()
  const { stagger, fadeUp, transition: motionTransition, tap } = useEntranceMotion()
  const currentHour = useMemo(() => new Date().getHours(), [])
  const [selectedGoal, setSelectedGoal] = useState<ProtocolGoal>(() =>
    getDefaultProtocolGoal(currentHour)
  )
  const [selectedWindow, setSelectedWindow] = useState<SessionWindow>('standard')
  const { sessions, getStreak } = useHistoryStore()
  const { xp, dailySessionCount } = useGamificationStore()

  const streak = getStreak()

  const level = getLevelForXP(xp)
  const currentLevelXP = getXPForLevel(level)
  const nextLevelXP = getXPForLevel(level + 1)
  const xpInLevel = xp - currentLevelXP
  const xpNeeded = nextLevelXP - currentLevelXP
  const levelProgress = xpNeeded > 0 ? xpInLevel / xpNeeded : 1

  const totalPracticeTime = useMemo(
    () => sessions.reduce((sum, s) => sum + s.durationSeconds, 0),
    [sessions],
  )

  const dailyGoalMet = dailySessionCount >= 1

  const { trigger: haptic } = useHaptics()
  const isNewUser = sessions.length === 0
  const protocols = useMemo(() => getProtocolCatalog(), [])
  const recommendation = useMemo(
    () => getProtocolRecommendation({
      goal: selectedGoal,
      sessionWindow: selectedWindow,
      isNewUser,
      dailyGoalMet,
      currentHour,
    }),
    [currentHour, dailyGoalMet, isNewUser, selectedGoal, selectedWindow]
  )
  const suggestedProtocol = recommendation.primary.protocol
  const suggestedDuration = recommendation.primary.estimatedDuration
  const suggestedPath = buildProtocolSessionPath(
    suggestedProtocol.id,
    recommendation.primary.rounds
  )

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {/* ── Greeting ────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="pt-2 pb-8 md:pb-16">
        <p className="text-[10px] font-medium tracking-[0.07em] uppercase text-bw-secondary md:hidden">
          {getGreeting()}
        </p>
        <h1 className="font-display text-3xl md:text-5xl font-semibold text-bw leading-[0.95] mt-1 md:mt-0">
          <span className="md:hidden">Time to breathe</span>
          <span className="hidden md:inline">{getGreeting()}</span>
        </h1>
        <p className="text-xs text-bw-tertiary mt-2 md:mt-3 font-medium tracking-wide hidden md:block">
          {isNewUser
            ? 'Your first session takes about 5 minutes'
            : getStreakMessage(streak, dailyGoalMet)}
        </p>
      </motion.div>

      {isNewUser ? (
        /* ── Welcome State ──────────────────────────────── */
        <>
          {/* Mobile welcome */}
          <motion.div variants={fadeUp} className="pb-8 md:hidden">
            <p className="text-xs text-bw-tertiary leading-relaxed mb-6">
              Your first session takes about 5 minutes
            </p>
            <button
              onClick={() => { haptic('success'); navigate(suggestedPath) }}
              className="w-full flex items-center justify-center gap-2.5 border border-bw-accent bg-bw-accent py-4 font-medium text-bw-accent-foreground text-sm transition-all hover:opacity-90"
            >
              <Play className="h-4 w-4" />
              Start your first session
            </button>
            <button
              onClick={() => {
                haptic('light')
                document.getElementById('techniques-section')?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="w-full mt-3 text-xs text-bw-tertiary font-medium hover:text-bw-secondary transition-colors py-2"
            >
              Browse all techniques
            </button>
          </motion.div>

          {/* Desktop welcome */}
          <motion.div variants={fadeUp} className="hidden md:block pb-16 border-b border-bw-border">
            <button
              onClick={() => { haptic('success'); navigate(suggestedPath) }}
              className="flex items-center gap-3 border border-bw-accent bg-bw-accent px-8 py-4 font-medium text-bw-accent-foreground text-sm transition-all hover:opacity-90"
            >
              <Play className="h-4 w-4" />
              Start your first session
            </button>
            <button
              onClick={() => {
                haptic('light')
                document.getElementById('techniques-section')?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="mt-4 text-xs text-bw-tertiary font-medium hover:text-bw-secondary transition-colors"
            >
              Or browse all techniques
            </button>
          </motion.div>
        </>
      ) : (
        /* ── Returning User Stats ──────────────────────── */
        <>
          {/* Mobile: 3 compact bordered chips */}
          <motion.div variants={fadeUp} className="flex gap-2 pb-6 md:hidden">
            <div className="flex-1 border-t border-bw-border pt-3">
              <span className="font-mono text-sm font-normal text-bw tabular-nums leading-none">
                Lv {level}
              </span>
              <span className="block text-[10px] text-bw-tertiary font-medium tracking-[0.07em] uppercase mt-1">
                Level
              </span>
            </div>
            <div className="flex-1 border-t border-bw-border pt-3">
              <span className="font-mono text-sm font-normal text-bw tabular-nums leading-none">
                {streak}
              </span>
              <span className="block text-[10px] text-bw-tertiary font-medium tracking-[0.07em] uppercase mt-1">
                Streak
              </span>
            </div>
            <div className="flex-1 border-t border-bw-border pt-3">
              <span className="font-mono text-sm font-normal text-bw tabular-nums leading-none">
                {formatTime(totalPracticeTime)}
              </span>
              <span className="block text-[10px] text-bw-tertiary font-medium tracking-[0.07em] uppercase mt-1">
                Total
              </span>
            </div>
          </motion.div>

          {/* Desktop: editorial horizontal strip */}
          <motion.div variants={fadeUp} className="hidden md:flex items-baseline gap-16 pb-16 border-b border-bw-border">
            <div>
              <span className="font-display text-3xl font-semibold text-bw leading-none">
                {getLevelTitle(level)}
              </span>
              <span className="block text-[10px] text-bw-secondary font-medium tracking-[0.07em] uppercase mt-1.5">
                Level {level}
              </span>
            </div>
            <div>
              <span className="font-mono text-2xl font-normal text-bw tabular-nums leading-none">
                {streak}
              </span>
              <span className="block text-[10px] text-bw-secondary font-medium tracking-[0.07em] uppercase mt-1.5">
                Day streak
              </span>
            </div>
            <div>
              <span className="font-mono text-2xl font-normal text-bw tabular-nums leading-none">
                {dailySessionCount}
              </span>
              <span className="block text-[10px] text-bw-secondary font-medium tracking-[0.07em] uppercase mt-1.5">
                Today
              </span>
            </div>
            <div>
              <span className="font-mono text-2xl font-normal text-bw tabular-nums leading-none">
                {formatTime(totalPracticeTime)}
              </span>
              <span className="block text-[10px] text-bw-secondary font-medium tracking-[0.07em] uppercase mt-1.5">
                Total
              </span>
            </div>
          </motion.div>

          {/* ── XP Progress — inline, minimal ────────────────── */}
          <motion.div variants={fadeUp} className="py-5 sm:py-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-bw-secondary font-medium tracking-[0.07em] uppercase">
                Level {level} progress
              </span>
              <span className="text-[10px] text-bw-secondary font-medium tabular-nums">
                {xpInLevel} / {xpNeeded} XP
              </span>
            </div>
            <div className="h-px bg-bw-border overflow-hidden">
              <div
                className="h-full origin-left transition-transform duration-700 ease-out bg-bw-accent"
                style={{
                  transform: `translateZ(0) scaleX(${Math.round(levelProgress * 100) / 100})`,
                }}
              />
            </div>
          </motion.div>
        </>
      )}

      {/* ── Protocol Lab ───────────────────────────────── */}
      <motion.section variants={fadeUp} className="pt-3 md:pt-8" aria-labelledby="protocol-lab-heading">
        <div className="border-y border-bw-border py-5 md:py-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="protocol-lab-heading" className="text-[10px] font-medium tracking-[0.07em] uppercase text-bw-secondary">
                Protocol Lab
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

          <div className="mt-5">
            <div role="group" aria-label="Breathing goal" className="grid grid-cols-5 gap-1.5 sm:flex sm:w-max sm:gap-2">
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
                      'flex min-h-12 flex-col items-center justify-center gap-1 border px-1 text-[10px] font-medium transition-colors duration-200 sm:min-h-11 sm:flex-row sm:gap-2 sm:px-3 sm:text-xs',
                      selected
                        ? 'border-bw-accent bg-bw-active text-bw'
                        : 'border-bw-border text-bw-tertiary hover:bg-bw-hover hover:text-bw-secondary'
                    )}
                  >
                    <Icon className={cn('h-3.5 w-3.5', selected ? 'text-bw-accent' : 'text-bw-tertiary')} />
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

          <button
            onClick={() => { haptic('light'); navigate(suggestedPath) }}
            aria-label={`Start ${suggestedProtocol.name} for ${formatTime(suggestedDuration)}`}
            className="group mt-5 w-full border-t border-bw-border pt-5 text-left transition-colors duration-200 hover:bg-bw-hover"
          >
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 flex items-center justify-center shrink-0 border border-bw-border">
                <TechniqueGeometryIcon techniqueId={suggestedProtocol.id} className="text-bw-accent" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-bw-tertiary line-clamp-2">
                  {suggestedProtocol.purpose}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium uppercase tracking-[0.07em] text-bw-tertiary">
                  <span>{suggestedProtocol.evidence}</span>
                  <span>{suggestedProtocol.intensity}</span>
                  {suggestedProtocol.safetyChecklist?.length ? <span>Safety gated</span> : null}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-bw-tertiary shrink-0 group-hover:text-bw group-hover:translate-x-0.5 transition-all duration-200" />
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {recommendation.primary.reasons.map((reason) => (
                <span key={reason} className="border border-bw-border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.07em] text-bw-tertiary">
                  {reason}
                </span>
              ))}
            </div>
          </button>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {recommendation.alternatives.map((option) => (
              <button
                key={option.protocol.id}
                type="button"
                aria-label={`Start ${option.protocol.name} for ${formatTime(option.estimatedDuration)}`}
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
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-bw-tertiary" />
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
        <div className="md:hidden -mx-4 px-4 overflow-x-auto no-scrollbar" style={{ scrollSnapType: 'x mandatory', scrollPaddingLeft: '1rem' }}>
          <div className="flex gap-3 pl-4" style={{ width: 'max-content' }}>
            {protocols.map((p) => {
              const id = p.id
              return (
                <motion.button
                  key={id}
                  whileTap={tap(0.97)}
                  transition={motionTransition}
                  className="border-t border-bw-border pt-4 pb-2 text-left bg-transparent flex-shrink-0"
                  style={{ width: 'calc(50vw - 28px)', scrollSnapAlign: 'start' }}
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
                  <ArrowRight className="h-3.5 w-3.5 text-bw-tertiary shrink-0 group-hover:text-bw group-hover:translate-x-0.5 transition-all duration-200" />
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
              onClick={() => { haptic('selection'); navigate('/breathwork/progress') }}
              className="flex items-center gap-1 text-xs font-medium text-bw-tertiary hover:text-bw transition-colors"
            >
              All
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          <div className="divide-y divide-bw-border">
            {sessions.slice(0, 3).map((session) => {
              const protocol = breathingProtocols[session.techniqueId]
              return (
                <motion.button
                  key={session.id}
                  whileTap={tap(0.99)}
                  transition={motionTransition}
                  className="w-full flex items-center gap-4 py-4 text-left group hover:bg-bw-hover transition-colors duration-200"
                  onClick={() => { haptic('selection'); navigate('/breathwork/progress') }}
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
                      {session.maxHoldTime > 0 && ` \u00b7 ${session.maxHoldTime}s best hold`}
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-bw-tertiary shrink-0 group-hover:text-bw transition-colors" />
                </motion.button>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* Bottom breathing room */}
      <div className="h-8" />
    </motion.div>
  )
}
