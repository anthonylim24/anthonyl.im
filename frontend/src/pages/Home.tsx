import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { useHistoryStore } from '@/stores/historyStore'
import { useGamificationStore } from '@/stores/gamificationStore'
import { getLevelForXP, getXPForLevel, getLevelTitle } from '@/lib/gamification'
import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatTime } from '@/lib/utils'
import { ACCENT, ACHIEVEMENT } from '@/lib/palette'
import { techniqueCardGradient } from '@/lib/techniqueConfig'
import {
  Wind,
  Flame,
  Box,
  ChevronRight,
  ArrowRight,
  Heart,
  Play,
} from 'lucide-react'
import { useHaptics } from '@/hooks/useHaptics'

const techniqueIcons: Record<TechniqueId, React.ReactNode> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: <Box className="h-5 w-5" />,
  [TECHNIQUE_IDS.CO2_TOLERANCE]: <Flame className="h-5 w-5" />,
  [TECHNIQUE_IDS.POWER_BREATHING]: <Wind className="h-5 w-5" />,
  [TECHNIQUE_IDS.CYCLIC_SIGHING]: <Heart className="h-5 w-5" />,
}

const spring = { type: 'spring' as const, stiffness: 300, damping: 30, mass: 1 }

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: spring },
}

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

export function Home() {
  const navigate = useNavigate()
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
      <motion.div variants={fadeUp} className="pt-2 pb-8 md:pb-20">
        <p className="text-sm text-white/30 font-medium tracking-wide md:hidden">
          {getGreeting()}
        </p>
        <h1 className="font-display text-[clamp(1.75rem,6vw,2rem)] md:text-[clamp(2.75rem,8vw,4.5rem)] font-extrabold text-white tracking-[-0.03em] leading-[0.95] mt-1 md:mt-0">
          <span className="md:hidden">Time to breathe</span>
          <span className="hidden md:inline">{getGreeting()}</span>
        </h1>
        <p className="text-sm text-white/30 mt-2 md:mt-3 font-medium tracking-wide hidden md:block">
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
            <p className="text-sm text-white/40 leading-relaxed mb-6">
              Your first session takes just 4 minutes
            </p>
            <button
              onClick={() => { haptic('success'); navigate('/breathwork/session?technique=box_breathing') }}
              className="w-full flex items-center justify-center gap-2.5 rounded-2xl py-4 font-display font-bold text-white text-base transition-opacity hover:opacity-90"
              style={{ background: ACCENT }}
            >
              <Play className="h-4 w-4" />
              Start your first session
            </button>
            <button
              onClick={() => {
                haptic('light')
                document.getElementById('techniques-section')?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="w-full mt-3 text-sm text-white/30 font-medium hover:text-white/50 transition-colors py-2"
            >
              Browse all techniques
            </button>
          </motion.div>

          {/* Desktop welcome */}
          <motion.div variants={fadeUp} className="hidden md:block pb-20 border-b border-white/[0.04]">
            <button
              onClick={() => { haptic('success'); navigate('/breathwork/session?technique=box_breathing') }}
              className="flex items-center gap-3 rounded-2xl px-8 py-4 font-display font-bold text-white text-lg transition-opacity hover:opacity-90"
              style={{ background: ACCENT }}
            >
              <Play className="h-5 w-5" />
              Start your first session
            </button>
            <button
              onClick={() => {
                haptic('light')
                document.getElementById('techniques-section')?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="mt-4 text-sm text-white/30 font-medium hover:text-white/50 transition-colors"
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
            <div className="flex-1 rounded-xl border border-white/10 px-3 py-2.5">
              <span className="font-display text-lg font-bold text-white tabular-nums leading-none">
                Lv {level}
              </span>
              <span className="block text-[10px] text-white/30 font-medium tracking-wide uppercase mt-1">
                Level
              </span>
            </div>
            <div
              className="flex-1 rounded-xl border px-3 py-2.5"
              style={streak >= 3
                ? { borderColor: `${ACHIEVEMENT}30`, background: `${ACHIEVEMENT}08` }
                : { borderColor: 'rgba(255,255,255,0.1)' }}
            >
              <span
                className="font-display text-lg font-bold tabular-nums leading-none"
                style={streak >= 3 ? { color: ACHIEVEMENT } : { color: 'white' }}
              >
                {streak}
              </span>
              <span className="block text-[10px] text-white/30 font-medium tracking-wide uppercase mt-1">
                Streak
              </span>
            </div>
            <div className="flex-1 rounded-xl border border-white/10 px-3 py-2.5">
              <span className="font-display text-lg font-bold text-white tabular-nums leading-none">
                {formatTime(totalPracticeTime)}
              </span>
              <span className="block text-[10px] text-white/30 font-medium tracking-wide uppercase mt-1">
                Total
              </span>
            </div>
          </motion.div>

          {/* Desktop: editorial horizontal strip */}
          <motion.div variants={fadeUp} className="hidden md:flex items-baseline gap-12 pb-20 border-b border-white/[0.04]">
            <div>
              <span className="font-display text-4xl font-extrabold text-white tabular-nums leading-none">
                {getLevelTitle(level)}
              </span>
              <span className="block text-[11px] text-white/25 font-semibold tracking-[0.08em] uppercase mt-1.5">
                Level {level}
              </span>
            </div>
            <div>
              <span className="font-display text-4xl font-extrabold text-white tabular-nums leading-none">
                {streak}
              </span>
              <span className="block text-[11px] text-white/25 font-semibold tracking-[0.08em] uppercase mt-1.5">
                Day streak
              </span>
            </div>
            <div>
              <span className="font-display text-4xl font-extrabold text-white tabular-nums leading-none">
                {dailySessionCount}
              </span>
              <span className="block text-[11px] text-white/25 font-semibold tracking-[0.08em] uppercase mt-1.5">
                Today
              </span>
            </div>
            <div>
              <span className="font-display text-4xl font-extrabold text-white tabular-nums leading-none">
                {formatTime(totalPracticeTime)}
              </span>
              <span className="block text-[11px] text-white/25 font-semibold tracking-[0.08em] uppercase mt-1.5">
                Total
              </span>
            </div>
          </motion.div>

          {/* ── XP Progress — inline, minimal ────────────────── */}
          <motion.div variants={fadeUp} className="py-5 sm:py-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-white/25 font-semibold tracking-[0.08em] uppercase">
                Level {level} progress
              </span>
              <span className="text-[11px] text-white/20 font-medium tabular-nums">
                {xpInLevel} / {xpNeeded} XP
              </span>
            </div>
            <div className="h-1 rounded-full surface-well overflow-hidden">
              <div
                className="h-full rounded-full origin-left transition-transform duration-700 ease-out"
                style={{
                  background: ACCENT,
                  transform: `translateZ(0) scaleX(${Math.round(levelProgress * 100) / 100})`,
                }}
              />
            </div>
          </motion.div>
        </>
      )}

      {/* ── Techniques ──────────────────────────────────── */}
      <motion.div variants={fadeUp} className="pt-8 md:pt-16" id="techniques-section">
        <h2 className="font-display text-xl md:text-3xl font-bold text-white tracking-tight mb-5 md:mb-10">
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
                  transition={spring}
                  className="rounded-2xl p-4 text-left border border-white/10 bg-white/[0.03] flex-shrink-0"
                  style={{ width: 'calc(50vw - 28px)', scrollSnapAlign: 'start' }}
                  onClick={() => { haptic('light'); navigate(`/breathwork/session?technique=${id}`) }}
                >
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center mb-3"
                    style={techniqueCardGradient(id)}
                  >
                    <span className="text-white">{techniqueIcons[id]}</span>
                  </div>
                  <h3 className="font-display text-sm font-bold text-white leading-tight">
                    {p.name}
                  </h3>
                  <div className="flex items-center gap-1 mt-2 flex-wrap">
                    {p.phases.map((phase, i) => (
                      <span key={i} className="flex items-center gap-0.5">
                        <span className="text-[10px] font-mono text-white/40">{phase.duration}s</span>
                        {i < p.phases.length - 1 && (
                          <span className="text-white/15 text-[10px]">→</span>
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
            transition={spring}
            className="relative rounded-2xl p-8 text-left w-full min-h-[220px] flex flex-col justify-between overflow-hidden group mb-3"
            style={techniqueCardGradient(heroTechnique)}
            onClick={() => { haptic('medium'); navigate(`/breathwork/session?technique=${heroTechnique}`) }}
          >
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: 'var(--noise)',
              backgroundRepeat: 'repeat',
              backgroundSize: '256px 256px',
              opacity: 0.12,
              mixBlendMode: 'overlay' as const,
            }} />
            <div className="relative z-10">
              <div className="h-12 w-12 rounded-xl bg-white/15 flex items-center justify-center mb-5">
                <span className="text-white">{techniqueIcons[heroTechnique]}</span>
              </div>
              <h3 className="font-display text-3xl font-bold text-white leading-tight">
                {heroProtocol.name}
              </h3>
              <p className="text-sm text-white/60 mt-2 leading-relaxed max-w-md">
                {heroProtocol.purpose}
              </p>
            </div>
            <div className="relative z-10 flex items-center gap-2 mt-6 text-white/70 text-sm font-semibold group-hover:text-white transition-colors">
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
                  transition={spring}
                  className="w-full flex items-center gap-4 p-5 rounded-2xl text-left group hover:bg-white/[0.03] transition-colors duration-200"
                  onClick={() => { haptic('light'); navigate(`/breathwork/session?technique=${id}`) }}
                >
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                    style={techniqueCardGradient(id)}
                  >
                    <span className="text-white">{techniqueIcons[id]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display text-base font-bold text-white leading-tight">
                      {protocol.name}
                    </h3>
                    <p className="text-xs text-white/30 mt-0.5 line-clamp-1">
                      {protocol.purpose}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-white/15 shrink-0 group-hover:text-white/40 group-hover:translate-x-0.5 transition-all duration-200" />
                </motion.button>
              )
            })}
          </div>
        </div>
      </motion.div>

      {/* ── Recent Sessions ──────────────────────────────── */}
      {sessions.length > 0 && (
        <motion.div variants={fadeUp} className="pt-16 sm:pt-20">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">Recent</h2>
            <button
              onClick={() => { haptic('selection'); navigate('/breathwork/progress') }}
              className="flex items-center gap-1 text-sm font-medium text-white/25 hover:text-white/50 transition-colors"
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
                  transition={spring}
                  className="w-full flex items-center gap-4 p-4 sm:p-5 rounded-2xl text-left group hover:bg-white/[0.03] transition-colors duration-200"
                  onClick={() => { haptic('selection'); navigate('/breathwork/progress') }}
                >
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                    style={techniqueCardGradient(session.techniqueId)}
                  >
                    <span className="text-white scale-90">
                      {techniqueIcons[session.techniqueId]}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-white truncate">
                      {protocol.name}
                    </div>
                    <div className="text-xs text-white/25 mt-0.5">
                      {session.rounds} rounds
                      {session.maxHoldTime > 0 && ` · ${session.maxHoldTime}s best hold`}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-white/10 shrink-0 group-hover:text-white/30 transition-colors" />
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
