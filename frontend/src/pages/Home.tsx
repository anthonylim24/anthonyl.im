import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useHistoryStore } from '@/stores/historyStore'
import { useGamificationStore } from '@/stores/gamificationStore'
import { getLevelForXP, getXPForLevel, getLevelTitle } from '@/lib/gamification'
import { LevelRing } from '@/components/gamification/LevelRing'
import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatTime } from '@/lib/utils'
import { ACCENT, ACCENT_BRIGHT } from '@/lib/palette'
import { techniqueCardGradient } from '@/lib/techniqueConfig'
import {
  Wind,
  Flame,
  Box,
  Trophy,
  Zap,
  ChevronRight,
  ArrowRight,
  Heart,
} from 'lucide-react'

const techniqueIcons: Record<TechniqueId, React.ReactNode> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: <Box className="h-7 w-7" />,
  [TECHNIQUE_IDS.CO2_TOLERANCE]: <Flame className="h-7 w-7" />,
  [TECHNIQUE_IDS.POWER_BREATHING]: <Wind className="h-7 w-7" />,
  [TECHNIQUE_IDS.CYCLIC_SIGHING]: <Heart className="h-7 w-7" />,
}

// Decorative SVG patterns per technique – unique visual identity
const techniquePatterns: Record<TechniqueId, React.ReactNode> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: (
    <svg className="absolute inset-0 w-full h-full opacity-[0.08]" viewBox="0 0 200 200">
      {Array.from({ length: 5 }, (_, r) =>
        Array.from({ length: 5 }, (_, c) => (
          <rect key={`${r}-${c}`} x={20 + c * 36} y={20 + r * 36} width={24} height={24} rx={4} fill="white" />
        ))
      )}
    </svg>
  ),
  [TECHNIQUE_IDS.CO2_TOLERANCE]: (
    <svg className="absolute inset-0 w-full h-full opacity-[0.08]" viewBox="0 0 200 200">
      {Array.from({ length: 5 }, (_, i) => (
        <circle key={i} cx={100} cy={100} r={20 + i * 20} fill="none" stroke="white" strokeWidth={1.5} />
      ))}
    </svg>
  ),
  [TECHNIQUE_IDS.POWER_BREATHING]: (
    <svg className="absolute inset-0 w-full h-full opacity-[0.08]" viewBox="0 0 200 200">
      {Array.from({ length: 8 }, (_, i) => (
        <line key={i} x1={0} y1={i * 28} x2={200} y2={i * 28 + 60} stroke="white" strokeWidth={2} />
      ))}
    </svg>
  ),
  [TECHNIQUE_IDS.CYCLIC_SIGHING]: (
    <svg className="absolute inset-0 w-full h-full opacity-[0.08]" viewBox="0 0 200 200">
      {Array.from({ length: 4 }, (_, i) => (
        <path key={i} d={`M ${40 + i * 15} 100 Q 100 ${40 + i * 20}, ${160 - i * 15} 100`} fill="none" stroke="white" strokeWidth={1.5} />
      ))}
      {Array.from({ length: 4 }, (_, i) => (
        <path key={`b${i}`} d={`M ${40 + i * 15} 100 Q 100 ${160 - i * 20}, ${160 - i * 15} 100`} fill="none" stroke="white" strokeWidth={1.5} />
      ))}
    </svg>
  ),
}

const spring = { type: 'spring' as const, stiffness: 300, damping: 30, mass: 1 }

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
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

  return (
    <motion.div
      className="pb-8 space-y-7 sm:space-y-10"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {/* ── Greeting ────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="pt-1">
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          {getGreeting()}
        </h1>
        <p className="text-sm text-white/35 mt-1 font-medium">
          {dailyGoalMet ? 'You\'ve completed today\'s goal' : 'Ready for today\'s session?'}
        </p>
      </motion.div>

      {/* ── Bento Grid ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {/* Level Card – vivid gradient */}
        <motion.div
          variants={fadeUp}
          className="card-gradient-indigo rounded-[24px] p-5 sm:p-6 flex flex-col items-center justify-center text-center relative overflow-hidden"
        >
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full blur-3xl opacity-20 pointer-events-none"
            style={{ background: ACCENT_BRIGHT }}
          />
          <div className="relative z-10">
            <LevelRing level={level} progress={levelProgress} size={88} strokeWidth={4} colors={['#fff', '#C7D2FE']} />
          </div>
          <div className="relative z-10 mt-3">
            <div className="font-display text-lg font-bold text-white">{getLevelTitle(level)}</div>
            <div className="text-xs text-white/60 font-medium mt-0.5">Level {level}</div>
          </div>
        </motion.div>

        {/* Daily Goal */}
        <motion.div
          variants={fadeUp}
          className="sculpted-card rounded-[24px] p-5 sm:p-6 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/35 font-semibold tracking-wide uppercase">Today</span>
            <div
              className="h-8 w-8 rounded-xl flex items-center justify-center"
              style={{
                background: dailyGoalMet
                  ? `linear-gradient(135deg, ${ACCENT}, ${ACCENT_BRIGHT})`
                  : 'rgba(255,255,255,0.06)',
                boxShadow: dailyGoalMet ? `0 8px 20px -4px ${ACCENT}50` : undefined,
              }}
            >
              <Zap className="h-4 w-4 text-white" />
            </div>
          </div>
          <div className="mt-auto pt-4">
            <div className="font-display text-4xl sm:text-5xl font-extrabold text-white tabular-nums leading-none">
              {dailySessionCount}
            </div>
            <div className="text-xs text-white/35 font-medium mt-1">
              {dailyGoalMet ? 'sessions today' : 'of 1 session goal'}
            </div>
          </div>
          <div className="h-1.5 rounded-full surface-well overflow-hidden mt-3">
            <motion.div
              className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: dailyGoalMet ? '100%' : `${Math.min(dailySessionCount, 1) * 100}%` }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
              style={{ background: `linear-gradient(to right, ${ACCENT}, ${ACCENT_BRIGHT})` }}
            />
          </div>
        </motion.div>

        {/* Streak */}
        <motion.div
          variants={fadeUp}
          className="card-elevated rounded-[24px] p-5 sm:p-6 flex flex-col justify-between"
        >
          <Flame className="h-5 w-5 text-white/30" />
          <div className="mt-auto pt-3">
            <div className="font-display text-4xl sm:text-5xl font-extrabold text-white tabular-nums leading-none">
              {streak}
            </div>
            <div className="text-xs text-white/35 font-medium mt-1">day streak</div>
          </div>
        </motion.div>

        {/* Total */}
        <motion.div
          variants={fadeUp}
          className="card-elevated rounded-[24px] p-5 sm:p-6 flex flex-col justify-between"
        >
          <Trophy className="h-5 w-5 text-white/30" />
          <div className="mt-auto pt-3">
            <div className="font-display text-4xl sm:text-5xl font-extrabold text-white tabular-nums leading-none">
              {sessions.length > 0 ? formatTime(totalPracticeTime) : '0:00'}
            </div>
            <div className="text-xs text-white/35 font-medium mt-1">
              {sessions.length} session{sessions.length !== 1 ? 's' : ''} total
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Techniques (horizontal scroll on mobile, grid on md+) */}
      <motion.div variants={fadeUp}>
        <h2 className="font-display text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-5">
          Techniques
        </h2>

        <div className="flex gap-4 overflow-x-auto no-scrollbar scroll-snap-x pb-2 -mx-1 px-1 md:grid md:grid-cols-3 md:overflow-x-visible">
          {([
            TECHNIQUE_IDS.BOX_BREATHING,
            TECHNIQUE_IDS.CO2_TOLERANCE,
            TECHNIQUE_IDS.POWER_BREATHING,
            TECHNIQUE_IDS.CYCLIC_SIGHING,
          ] as TechniqueId[]).map((id) => {
            const protocol = breathingProtocols[id]
            return (
              <motion.button
                key={id}
                whileTap={{ scale: 0.96 }}
                transition={spring}
                className="relative rounded-[24px] p-6 text-left flex-shrink-0 w-[75vw] sm:w-auto min-h-[200px] flex flex-col justify-between overflow-hidden group"
                style={techniqueCardGradient(id)}
                onClick={() => navigate(`/breathwork/session?technique=${id}`)}
              >
                {/* Noise texture */}
                <div className="absolute inset-0 pointer-events-none" style={{
                  backgroundImage: 'var(--noise)',
                  backgroundRepeat: 'repeat',
                  backgroundSize: '256px 256px',
                  opacity: 0.15,
                  mixBlendMode: 'overlay' as const,
                }} />
                {techniquePatterns[id]}

                <div className="relative z-10">
                  <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                    <span className="text-white">{techniqueIcons[id]}</span>
                  </div>
                  <h3 className="font-display text-xl font-bold text-white leading-tight">
                    {protocol.name}
                  </h3>
                  <p className="text-sm text-white/70 mt-1 leading-relaxed line-clamp-2">
                    {protocol.purpose}
                  </p>
                </div>

                <div className="relative z-10 flex items-center gap-2 mt-5 text-white/80 text-sm font-semibold group-hover:text-white transition-colors">
                  <span>Start</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </motion.button>
            )
          })}
        </div>
      </motion.div>

      {/* ── XP Progress ────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="card-elevated rounded-[20px] p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-white/40 font-semibold tracking-wide uppercase">
            Level {level} Progress
          </span>
          <span className="text-xs text-white/30 font-medium tabular-nums">
            {xpInLevel} / {xpNeeded} XP
          </span>
        </div>
        <div className="h-3 rounded-full surface-well overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${Math.round(levelProgress * 100)}%` }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
            style={{
              background: `linear-gradient(to right, ${ACCENT}, ${ACCENT_BRIGHT})`,
              boxShadow: `0 0 16px ${ACCENT}50`,
            }}
          />
        </div>
      </motion.div>

      {/* ── Recent Sessions ────────────────────────────────── */}
      {sessions.length > 0 && (
        <motion.div variants={fadeUp}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">Recent</h2>
            <button
              onClick={() => navigate('/breathwork/progress')}
              className="flex items-center gap-1 text-sm font-medium text-white/30 hover:text-white/60 transition-colors"
            >
              All
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-2.5">
            {sessions.slice(0, 3).map((session) => {
              const protocol = breathingProtocols[session.techniqueId]
              return (
                <motion.button
                  key={session.id}
                  whileTap={{ scale: 0.98 }}
                  transition={spring}
                  className="card-elevated rounded-[18px] p-4 sm:p-5 w-full text-left group"
                  onClick={() => navigate('/breathwork/progress')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                      <div
                        className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-300"
                        style={{
                          background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_BRIGHT})`,
                          boxShadow: `0 8px 16px -4px ${ACCENT}35`,
                        }}
                      >
                        <span className="text-white scale-90">
                          {techniqueIcons[session.techniqueId]}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm sm:text-base text-white truncate">
                          {protocol.name}
                        </div>
                        <div className="text-xs text-white/30 mt-0.5">
                          {session.rounds} rounds
                          {session.maxHoldTime > 0 && ` · ${session.maxHoldTime}s best hold`}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-white/15 shrink-0 group-hover:text-white/40 transition-colors" />
                  </div>
                </motion.button>
              )
            })}
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
