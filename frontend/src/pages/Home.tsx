import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { useHistoryStore } from '@/stores/historyStore'
import { useGamificationStore } from '@/stores/gamificationStore'
import { getLevelForXP, getXPForLevel, getLevelTitle } from '@/lib/gamification'
import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatTime } from '@/lib/utils'
import { ACCENT } from '@/lib/palette'
import { techniqueCardGradient } from '@/lib/techniqueConfig'
import {
  Wind,
  Flame,
  Box,
  ChevronRight,
  ArrowRight,
  Heart,
} from 'lucide-react'

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

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {/* ── Greeting — massive, editorial ────────────────── */}
      <motion.div variants={fadeUp} className="pt-2 pb-16 sm:pb-20">
        <h1 className="font-display text-[clamp(2.75rem,8vw,4.5rem)] font-extrabold text-white tracking-[-0.03em] leading-[0.95]">
          {getGreeting()}
        </h1>
        <p className="text-sm text-white/30 mt-3 font-medium tracking-wide">
          {dailyGoalMet ? 'You\'ve completed today\'s goal' : 'Ready for today\'s session?'}
        </p>
      </motion.div>

      {/* ── Stats — horizontal strip, not hero metrics ──── */}
      <motion.div variants={fadeUp} className="flex items-baseline gap-8 sm:gap-12 pb-16 sm:pb-20 border-b border-white/[0.04]">
        <div>
          <span className="font-display text-3xl sm:text-4xl font-extrabold text-white tabular-nums leading-none">
            {getLevelTitle(level)}
          </span>
          <span className="block text-[11px] text-white/25 font-semibold tracking-[0.08em] uppercase mt-1.5">
            Level {level}
          </span>
        </div>
        <div>
          <span className="font-display text-3xl sm:text-4xl font-extrabold text-white tabular-nums leading-none">
            {streak}
          </span>
          <span className="block text-[11px] text-white/25 font-semibold tracking-[0.08em] uppercase mt-1.5">
            Day streak
          </span>
        </div>
        <div>
          <span className="font-display text-3xl sm:text-4xl font-extrabold text-white tabular-nums leading-none">
            {dailySessionCount}
          </span>
          <span className="block text-[11px] text-white/25 font-semibold tracking-[0.08em] uppercase mt-1.5">
            Today
          </span>
        </div>
        {sessions.length > 0 && (
          <div className="hidden sm:block">
            <span className="font-display text-3xl sm:text-4xl font-extrabold text-white tabular-nums leading-none">
              {formatTime(totalPracticeTime)}
            </span>
            <span className="block text-[11px] text-white/25 font-semibold tracking-[0.08em] uppercase mt-1.5">
              Total
            </span>
          </div>
        )}
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

      {/* ── Techniques — hero card + list ────────────────── */}
      <motion.div variants={fadeUp} className="pt-12 sm:pt-16">
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight mb-8 sm:mb-10">
          Techniques
        </h2>

        {/* Hero technique — full width, vivid */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          transition={spring}
          className="relative rounded-2xl p-7 sm:p-8 text-left w-full min-h-[220px] flex flex-col justify-between overflow-hidden group mb-3"
          style={techniqueCardGradient(heroTechnique)}
          onClick={() => navigate(`/breathwork/session?technique=${heroTechnique}`)}
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
            <h3 className="font-display text-2xl sm:text-3xl font-bold text-white leading-tight">
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

        {/* Remaining techniques — compact list */}
        <div className="space-y-1">
          {restTechniques.map((id) => {
            const protocol = breathingProtocols[id]
            return (
              <motion.button
                key={id}
                whileTap={{ scale: 0.99 }}
                transition={spring}
                className="w-full flex items-center gap-4 p-4 sm:p-5 rounded-2xl text-left group hover:bg-white/[0.03] transition-colors duration-200"
                onClick={() => navigate(`/breathwork/session?technique=${id}`)}
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
      </motion.div>

      {/* ── Recent Sessions ──────────────────────────────── */}
      {sessions.length > 0 && (
        <motion.div variants={fadeUp} className="pt-16 sm:pt-20">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">Recent</h2>
            <button
              onClick={() => navigate('/breathwork/progress')}
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
                  onClick={() => navigate('/breathwork/progress')}
                >
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: ACCENT,
                    }}
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
