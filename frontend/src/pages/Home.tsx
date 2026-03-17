import { useMemo } from 'react'
import { useViewTransitionNavigate } from '@/hooks/useViewTransition'
import { motion } from 'motion/react'
import { useHistoryStore } from '@/stores/historyStore'
import { useGamificationStore } from '@/stores/gamificationStore'
import { getLevelForXP, getXPForLevel, getLevelTitle } from '@/lib/gamification'
import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatTime } from '@/lib/utils'
import { TechniqueGeometryIcon } from '@/components/ui/TechniqueGeometryIcon'
import { TECHNIQUE_RING_COLORS } from '@/lib/palette'
import {
  ChevronRight,
  ArrowRight,
  Play,
} from 'lucide-react'
import { useHaptics } from '@/hooks/useHaptics'

/* ── Animation ─────────────────────────────────────── */

const motionTransition = { type: 'tween' as const, duration: 0.6, ease: [0.33, 0, 0, 1] as const }

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: motionTransition },
}

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
  const { sessions, getStreak } = useHistoryStore()
  const { xp, dailySessionCount } = useGamificationStore()

  const streak = useMemo(() => getStreak(), [sessions])

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

  const techniques = [
    TECHNIQUE_IDS.BOX_BREATHING,
    TECHNIQUE_IDS.CO2_TOLERANCE,
    TECHNIQUE_IDS.POWER_BREATHING,
    TECHNIQUE_IDS.CYCLIC_SIGHING,
  ] as TechniqueId[]

  // Feature the first technique as hero, rest as list
  const heroTechnique = techniques[0]
  const heroProtocol = breathingProtocols[heroTechnique]
  const restTechniques = techniques.slice(1)

  const { trigger: haptic } = useHaptics()
  const isNewUser = sessions.length === 0

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {/* ── Greeting ────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="pt-2 pb-8 md:pb-24">
        <p className="text-sm text-bw-tertiary font-medium tracking-wide md:hidden">
          {getGreeting()}
        </p>
        <h1 className="font-display text-[clamp(1.75rem,6vw,2rem)] md:text-[clamp(3.5rem,9vw,5.5rem)] font-light text-bw tracking-[0.02em] leading-[0.90] mt-1 md:mt-0">
          <span className="md:hidden">Time to breathe</span>
          <span className="hidden md:inline">{getGreeting()}</span>
        </h1>
        <p className="text-sm md:text-base text-bw-tertiary mt-2 md:mt-4 font-medium tracking-wide hidden md:block">
          {isNewUser
            ? 'Your first session takes just 4 minutes'
            : getStreakMessage(streak, dailyGoalMet)}
        </p>
      </motion.div>

      {isNewUser ? (
        /* ── Welcome State ──────────────────────────────── */
        <>
          {/* Mobile welcome */}
          <motion.div variants={fadeUp} className="pb-8 md:hidden">
            <p className="text-sm text-bw-tertiary leading-relaxed mb-6">
              Your first session takes just 4 minutes
            </p>
            <button
              onClick={() => { haptic('success'); navigate('/breathwork/session?technique=box_breathing') }}
              className="w-full flex items-center justify-center gap-2.5 rounded-2xl py-4 font-display font-light text-white text-base transition-all hover:brightness-110"
              style={{ backgroundColor: 'var(--bw-accent)', boxShadow: '0 4px 20px rgba(184, 134, 11, 0.2)' }}
            >
              <Play className="h-4 w-4" />
              Start your first session
            </button>
            <button
              onClick={() => {
                haptic('light')
                document.getElementById('techniques-section')?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="w-full mt-3 text-sm text-bw-tertiary font-medium hover:text-bw-secondary transition-colors py-2"
            >
              Browse all techniques
            </button>
          </motion.div>

          {/* Desktop welcome */}
          <motion.div variants={fadeUp} className="hidden md:block pb-24 border-b border-bw-border-subtle">
            <button
              onClick={() => { haptic('success'); navigate('/breathwork/session?technique=box_breathing') }}
              className="flex items-center gap-3 rounded-2xl px-10 py-5 font-display font-light text-white text-lg transition-all hover:brightness-110"
              style={{ backgroundColor: 'var(--bw-accent)', boxShadow: '0 6px 24px rgba(184, 134, 11, 0.2)' }}
            >
              <Play className="h-5 w-5" />
              Start your first session
            </button>
            <button
              onClick={() => {
                haptic('light')
                document.getElementById('techniques-section')?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="mt-4 text-sm text-bw-tertiary font-medium hover:text-bw-secondary transition-colors"
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
            <div className="flex-1 rounded-xl border border-bw-border px-3 py-2.5">
              <span className="font-display text-lg font-light text-bw tabular-nums leading-none">
                Lv {level}
              </span>
              <span className="block text-[10px] text-bw-tertiary font-medium tracking-[0.08em] uppercase mt-1">
                Level
              </span>
            </div>
            <div className="flex-1 rounded-xl border border-bw-border px-3 py-2.5">
              <span className="font-display text-lg font-light text-bw tabular-nums leading-none">
                {streak}
              </span>
              <span className="block text-[10px] text-bw-tertiary font-medium tracking-[0.08em] uppercase mt-1">
                Streak
              </span>
            </div>
            <div className="flex-1 rounded-xl border border-bw-border px-3 py-2.5">
              <span className="font-display text-lg font-light text-bw tabular-nums leading-none">
                {formatTime(totalPracticeTime)}
              </span>
              <span className="block text-[10px] text-bw-tertiary font-medium tracking-[0.08em] uppercase mt-1">
                Total
              </span>
            </div>
          </motion.div>

          {/* Desktop: editorial horizontal strip */}
          <motion.div variants={fadeUp} className="hidden md:flex items-baseline gap-16 pb-24 border-b border-bw-border-subtle">
            <div>
              <span className="font-display text-5xl font-light text-bw tabular-nums leading-none">
                {getLevelTitle(level)}
              </span>
              <span className="block text-[11px] text-bw-faint font-medium tracking-[0.08em] uppercase mt-1.5">
                Level {level}
              </span>
            </div>
            <div>
              <span className="font-display text-5xl font-light text-bw tabular-nums leading-none">
                {streak}
              </span>
              <span className="block text-[11px] text-bw-faint font-medium tracking-[0.08em] uppercase mt-1.5">
                Day streak
              </span>
            </div>
            <div>
              <span className="font-display text-5xl font-light text-bw tabular-nums leading-none">
                {dailySessionCount}
              </span>
              <span className="block text-[11px] text-bw-faint font-medium tracking-[0.08em] uppercase mt-1.5">
                Today
              </span>
            </div>
            <div>
              <span className="font-display text-5xl font-light text-bw tabular-nums leading-none">
                {formatTime(totalPracticeTime)}
              </span>
              <span className="block text-[11px] text-bw-faint font-medium tracking-[0.08em] uppercase mt-1.5">
                Total
              </span>
            </div>
          </motion.div>

          {/* ── XP Progress — inline, minimal ────────────────── */}
          <motion.div variants={fadeUp} className="py-5 sm:py-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-bw-faint font-medium tracking-[0.08em] uppercase">
                Level {level} progress
              </span>
              <span className="text-[11px] text-bw-faint font-medium tabular-nums">
                {xpInLevel} / {xpNeeded} XP
              </span>
            </div>
            <div className="h-1.5 rounded-full surface-well overflow-hidden">
              <div
                className="h-full rounded-full origin-left transition-transform duration-700 ease-out"
                style={{
                  backgroundColor: 'var(--bw-accent)',
                  transform: `translateZ(0) scaleX(${Math.round(levelProgress * 100) / 100})`,
                }}
              />
            </div>
          </motion.div>
        </>
      )}

      {/* ── Techniques ──────────────────────────────────── */}
      <motion.div variants={fadeUp} className="pt-10 md:pt-20" id="techniques-section">
        <h2 className="font-display text-2xl md:text-[2.75rem] font-light text-bw tracking-[0.02em] mb-5 md:mb-12">
          Techniques
        </h2>

        {/* Mobile: horizontal scroll carousel — 2 cards visible */}
        <div className="md:hidden -mx-4 px-4 overflow-x-auto no-scrollbar" style={{ scrollSnapType: 'x mandatory' }}>
          <div className="flex gap-3" style={{ width: 'max-content' }}>
            {techniques.map((id) => {
              const p = breathingProtocols[id]
              return (
                <motion.button
                  key={id}
                  whileTap={{ scale: 0.97 }}
                  transition={motionTransition}
                  className="rounded-2xl p-4 text-left border border-bw-border bg-bw-hover flex-shrink-0"
                  style={{ width: 'calc(50vw - 28px)', scrollSnapAlign: 'start' }}
                  onClick={() => { haptic('light'); navigate(`/breathwork/session?technique=${id}`) }}
                >
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center mb-3 bg-bw-hover border border-bw-border"
                    style={{ viewTransitionName: `technique-icon-${id}` } as React.CSSProperties}
                  >
                    <TechniqueGeometryIcon techniqueId={id} style={{ color: TECHNIQUE_RING_COLORS[id].primary }} />
                  </div>
                  <h3
                    className="font-display text-sm font-light text-bw leading-tight"
                    style={{ viewTransitionName: `technique-name-${id}` } as React.CSSProperties}
                  >
                    {p.name}
                  </h3>
                  <div className="flex items-center gap-1 mt-2 flex-wrap">
                    {p.phases.map((phase, i) => (
                      <span key={i} className="flex items-center gap-0.5">
                        <span className="text-[10px] font-mono text-bw-tertiary">{phase.duration}s</span>
                        {i < p.phases.length - 1 && (
                          <span className="text-bw-faint text-[10px]">{'\u2192'}</span>
                        )}
                      </span>
                    ))}
                  </div>
                </motion.button>
              )
            })}
          </div>
        </div>

        {/* Desktop: hero card + compact list */}
        <div className="hidden md:block">
          <motion.button
            whileTap={{ scale: 0.98 }}
            transition={motionTransition}
            className="relative rounded-2xl p-10 text-left w-full min-h-[260px] flex flex-col justify-between overflow-hidden group mb-4 border border-bw-border bg-card"
            style={{ borderLeftWidth: 3, borderLeftColor: TECHNIQUE_RING_COLORS[heroTechnique].primary }}
            onClick={() => { haptic('medium'); navigate(`/breathwork/session?technique=${heroTechnique}`) }}
          >
            <div className="relative z-10">
              <div
                className="h-14 w-14 rounded-xl flex items-center justify-center mb-6"
                style={{ backgroundColor: `${TECHNIQUE_RING_COLORS[heroTechnique].primary}12`, viewTransitionName: `technique-icon-${heroTechnique}` } as React.CSSProperties}
              >
                <TechniqueGeometryIcon techniqueId={heroTechnique} size={22} style={{ color: TECHNIQUE_RING_COLORS[heroTechnique].primary }} />
              </div>
              <h3
                className="font-display text-[2.25rem] font-light text-bw leading-tight tracking-[0.02em]"
                style={{ viewTransitionName: `technique-name-${heroTechnique}` } as React.CSSProperties}
              >
                {heroProtocol.name}
              </h3>
              <p className="text-base text-bw-secondary mt-3 leading-relaxed max-w-lg">
                {heroProtocol.purpose}
              </p>
            </div>
            <div className="relative z-10 flex items-center gap-2 mt-8 text-sm font-medium transition-colors" style={{ color: TECHNIQUE_RING_COLORS[heroTechnique].primary }}>
              <span>Start session</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </div>
          </motion.button>

          <div className="space-y-1">
            {restTechniques.map((id) => {
              const protocol = breathingProtocols[id]
              return (
                <motion.button
                  key={id}
                  whileTap={{ scale: 0.99 }}
                  transition={motionTransition}
                  className="w-full flex items-center gap-4 p-5 rounded-2xl text-left group hover:bg-bw-hover transition-colors duration-200"
                  onClick={() => { haptic('light'); navigate(`/breathwork/session?technique=${id}`) }}
                >
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-bw-hover border border-bw-border"
                    style={{ viewTransitionName: `technique-icon-${id}` } as React.CSSProperties}
                  >
                    <TechniqueGeometryIcon techniqueId={id} style={{ color: TECHNIQUE_RING_COLORS[id].primary }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3
                      className="font-display text-base font-light text-bw leading-tight"
                      style={{ viewTransitionName: `technique-name-${id}` } as React.CSSProperties}
                    >
                      {protocol.name}
                    </h3>
                    <p className="text-xs text-bw-tertiary mt-0.5 line-clamp-1">
                      {protocol.purpose}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-bw-faint shrink-0 group-hover:text-bw-tertiary group-hover:translate-x-0.5 transition-all duration-200" />
                </motion.button>
              )
            })}
          </div>
        </div>
      </motion.div>

      {/* ── Recent Sessions ──────────────────────────────── */}
      {sessions.length > 0 && (
        <motion.div variants={fadeUp} className="pt-20 sm:pt-28">
          <div className="flex items-center justify-between mb-8">
            <h2 className="font-display text-2xl md:text-[2.75rem] font-light text-bw tracking-[0.02em]">Recent</h2>
            <button
              onClick={() => { haptic('selection'); navigate('/breathwork/progress') }}
              className="flex items-center gap-1 text-sm font-medium text-bw-faint hover:text-bw-secondary transition-colors"
            >
              All
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-1">
            {sessions.slice(0, 3).map((session) => {
              const protocol = breathingProtocols[session.techniqueId]
              return (
                <motion.button
                  key={session.id}
                  whileTap={{ scale: 0.99 }}
                  transition={motionTransition}
                  className="w-full flex items-center gap-4 p-4 sm:p-5 rounded-2xl text-left group hover:bg-bw-hover transition-colors duration-200"
                  onClick={() => { haptic('selection'); navigate('/breathwork/progress') }}
                >
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-bw-hover border border-bw-border">
                    <TechniqueGeometryIcon techniqueId={session.techniqueId} style={{ color: TECHNIQUE_RING_COLORS[session.techniqueId].primary }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-bw truncate">
                      {protocol.name}
                    </div>
                    <div className="text-xs text-bw-faint mt-0.5">
                      {session.rounds} rounds
                      {session.maxHoldTime > 0 && ` \u00b7 ${session.maxHoldTime}s best hold`}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-bw-faint shrink-0 group-hover:text-bw-tertiary transition-colors" />
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
