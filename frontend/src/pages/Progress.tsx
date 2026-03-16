import { useState, useMemo } from 'react'
import { motion } from 'motion/react'
import { ProgressChart } from '@/components/tracking/ProgressChart'
import { SessionHistory } from '@/components/tracking/SessionHistory'
import { PersonalBests } from '@/components/tracking/PersonalBests'
import { useHistoryStore } from '@/stores/historyStore'
import { useGamificationStore } from '@/stores/gamificationStore'
import { getLevelForXP, getXPForLevel, getLevelTitle } from '@/lib/gamification'
import { LevelRing } from '@/components/gamification/LevelRing'
import { BadgeGrid } from '@/components/gamification/BadgeGrid'
import { ActivityHeatmap } from '@/components/gamification/ActivityHeatmap'
import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { ACCENT, ACCENT_BRIGHT, ACHIEVEMENT } from '@/lib/palette'
import { techniqueGradientStyle, getTechniqueVisual } from '@/lib/techniqueConfig'
import { Trash2, Wind, Flame, Box, Sparkles, Award, CalendarDays, Heart } from 'lucide-react'
import { useHaptics } from '@/hooks/useHaptics'

const spring = { type: 'spring' as const, stiffness: 300, damping: 30, mass: 1 }
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } }
const fadeUp = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: spring } }

const techniqueIcons: Record<TechniqueId, React.ReactNode> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: <Box className="h-4 w-4" />,
  [TECHNIQUE_IDS.CO2_TOLERANCE]: <Flame className="h-4 w-4" />,
  [TECHNIQUE_IDS.POWER_BREATHING]: <Wind className="h-4 w-4" />,
  [TECHNIQUE_IDS.CYCLIC_SIGHING]: <Heart className="h-4 w-4" />,
}

export function Progress() {
  const {
    sessions,
    personalBests,
    clearHistory,
  } = useHistoryStore()

  const { xp, earnedBadges } = useGamificationStore()

  const { trigger: haptic } = useHaptics()
  const [filterTechnique, setFilterTechnique] = useState<TechniqueId | 'all'>('all')
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  // Gamification derived state
  const level = getLevelForXP(xp)
  const currentLevelXP = getXPForLevel(level)
  const nextLevelXP = getXPForLevel(level + 1)
  const xpNeeded = nextLevelXP - currentLevelXP
  const xpInLevel = xp - currentLevelXP
  const progress = xpNeeded > 0 ? xpInLevel / xpNeeded : 1
  const levelTitle = getLevelTitle(level)

  // Memoize filtered sessions
  const filteredSessions = useMemo(() =>
    filterTechnique === 'all'
      ? sessions
      : sessions.filter((s) => s.techniqueId === filterTechnique),
    [sessions, filterTechnique]
  )

  // Transform sessions to SessionDay format for heatmap
  const sessionDays = useMemo(() => {
    const dayMap = new Map<string, number>()
    for (const s of sessions) {
      const key = s.date.split('T')[0]
      dayMap.set(key, (dayMap.get(key) ?? 0) + 1)
    }
    return Array.from(dayMap, ([date, count]) => ({ date, count }))
  }, [sessions])

  const handleClearHistory = () => {
    haptic([100, 50, 100])
    clearHistory()
    setShowClearConfirm(false)
  }

  return (
    <motion.div className="pb-4" variants={stagger} initial="hidden" animate="show">
      <div className="space-y-8 sm:space-y-10">
        {/* Header */}
        <motion.div variants={fadeUp} className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-[clamp(2rem,6vw,3rem)] font-extrabold text-white tracking-[-0.02em] leading-[0.95]">
              Progress
            </h1>
            <p className="text-sm text-white/30 mt-2 tracking-wide">Your journey so far</p>
          </div>
          <div className="relative">
            {showClearConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/40">Clear all?</span>
                <button
                  onClick={handleClearHistory}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors duration-300"
                >
                  Yes
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold surface-well text-white/50 hover:text-white/70 transition-colors duration-300"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => { haptic('error'); setShowClearConfirm(true) }}
                className="px-3 py-2 rounded-xl text-sm text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-colors duration-300"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </motion.div>

        {/* ── Two-column grid on md+ ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {/* Level Card */}
          <motion.div variants={fadeUp} className="card-elevated rounded-[24px] p-5 sm:p-6">
            <div className="flex items-center gap-5">
              <LevelRing level={level} progress={progress} size={100} />
              <div className="flex-1 min-w-0 space-y-3">
                <div>
                  <div className="text-xs font-medium text-white/40 tracking-wide uppercase">
                    Level {level}
                  </div>
                  <div className="font-display text-xl font-bold text-white">{levelTitle}</div>
                </div>
                <div className="space-y-2">
                  <div className="h-2.5 rounded-full surface-well overflow-hidden">
                    <div
                      className="h-full rounded-full origin-left transition-transform duration-700 ease-out"
                      style={{
                        background: `linear-gradient(to right, ${ACCENT}, ${ACCENT_BRIGHT})`,
                        boxShadow: `0 0 12px ${ACCENT}60`,
                        transform: `translateZ(0) scaleX(${Math.min(1, progress)})`,
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-white/35 font-medium tabular-nums">
                    {xpInLevel} / {xpNeeded} XP
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Activity Heatmap */}
          <motion.div variants={fadeUp}>
            <h2 className="flex items-center gap-2.5 font-display text-lg font-bold text-white mb-4">
              <CalendarDays className="h-5 w-5" style={{ color: ACHIEVEMENT }} />
              Activity
            </h2>
            <ActivityHeatmap sessions={sessionDays} />
          </motion.div>

          {/* Achievements */}
          <motion.div variants={fadeUp}>
            <h2 className="flex items-center gap-2.5 font-display text-lg font-bold text-white mb-4">
              <Award className="h-5 w-5" style={{ color: ACCENT_BRIGHT }} />
              Achievements
            </h2>
            <BadgeGrid earnedBadges={earnedBadges} />
          </motion.div>

          {/* Personal Bests */}
          <motion.div variants={fadeUp}>
            <PersonalBests personalBests={personalBests} />
          </motion.div>
        </div>

        {/* ── Full-width cards below ── */}

        {/* Progress Chart */}
        <motion.div variants={fadeUp}>
          <ProgressChart
            sessions={filteredSessions.filter((s) => s.maxHoldTime > 0)}
          />
        </motion.div>

        {/* Session History */}
        <motion.div variants={fadeUp} className="card-elevated rounded-[24px] overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-white/8">
            <h3 className="font-display text-base sm:text-lg font-bold text-white flex items-center gap-2.5">
              <Sparkles className="h-5 w-5" style={{ color: ACCENT_BRIGHT }} />
              Session History
            </h3>
          </div>
          <div className="p-5 sm:p-6">
            {/* Filter Buttons */}
            <div className="flex gap-1.5 p-1.5 surface-well rounded-2xl mb-5 sm:mb-6">
              <button
                onClick={() => { haptic('selection'); setFilterTechnique('all') }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 h-9 sm:h-10 rounded-xl text-xs font-semibold transition-[background,color,box-shadow] duration-200',
                  filterTechnique === 'all'
                    ? 'bg-white/10 text-white shadow-md'
                    : 'text-white/35 hover:text-white/55'
                )}
              >
                All
              </button>
              {Object.values(TECHNIQUE_IDS).map((id) => {
                const tv = getTechniqueVisual(id)
                return (
                <button
                  key={id}
                  onClick={() => { haptic('selection'); setFilterTechnique(id) }}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 h-9 sm:h-10 rounded-xl text-xs font-medium transition-[background,color,box-shadow] duration-200',
                    filterTechnique === id
                      ? 'text-white shadow-md'
                      : 'text-white/35 hover:text-white/55'
                  )}
                  style={filterTechnique === id ? { background: `${tv.primary}25` } : undefined}
                >
                  <div
                    className="h-5 w-5 rounded flex items-center justify-center shrink-0"
                    style={techniqueGradientStyle(id)}
                  >
                    <span className="text-white scale-75">{techniqueIcons[id]}</span>
                  </div>
                  <span className="hidden sm:inline truncate">
                    {breathingProtocols[id].name.split(' ')[0]}
                  </span>
                </button>
                )
              })}
            </div>

            <SessionHistory sessions={filteredSessions} />
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
