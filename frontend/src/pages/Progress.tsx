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
import { TechniqueGeometryIcon } from '@/components/ui/TechniqueGeometryIcon'
import { Trash2 } from 'lucide-react'
import { useHaptics } from '@/hooks/useHaptics'

const motionTransition = { type: 'tween' as const, duration: 0.6, ease: [0.33, 0, 0, 1] as const }
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const fadeUp = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: motionTransition } }

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
            <h1 className="font-display text-[clamp(2rem,6vw,3rem)] font-light text-bw tracking-[0.04em] leading-[0.95]">
              Progress
            </h1>
          </div>
          <div className="relative">
            {showClearConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-bw-tertiary">Clear all?</span>
                <button
                  onClick={handleClearHistory}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors duration-300"
                >
                  Yes
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold surface-well text-bw-secondary hover:text-bw transition-colors duration-300"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => { haptic('error'); setShowClearConfirm(true) }}
                className="px-3 py-2 rounded-xl text-sm text-bw-faint hover:text-red-400 hover:bg-red-500/10 transition-colors duration-300"
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
                  <div className="text-xs font-medium text-bw-tertiary tracking-wide uppercase">
                    Level {level}
                  </div>
                  <div className="font-display text-xl font-light text-bw">{levelTitle}</div>
                </div>
                <div className="space-y-2">
                  <div className="h-2.5 rounded-full surface-well overflow-hidden">
                    <div
                      className="h-full rounded-full origin-left transition-transform duration-700 ease-out bg-bw"
                      style={{
                        transform: `translateZ(0) scaleX(${Math.min(1, progress)})`,
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-bw-tertiary font-medium tabular-nums">
                    {xpInLevel} / {xpNeeded} XP
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Activity Heatmap */}
          <motion.div variants={fadeUp}>
            <h2 className="font-display text-lg font-light text-bw tracking-[0.04em] mb-4">
              Activity
            </h2>
            <ActivityHeatmap sessions={sessionDays} />
          </motion.div>

          {/* Achievements */}
          <motion.div variants={fadeUp}>
            <h2 className="font-display text-lg font-light text-bw tracking-[0.04em] mb-4">
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
          <div className="p-5 sm:p-6 border-b border-bw-border-subtle">
            <h3 className="font-display text-base sm:text-lg font-light text-bw tracking-[0.04em]">
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
                    ? 'bg-bw-active text-bw shadow-md'
                    : 'text-bw-tertiary hover:text-bw-secondary'
                )}
              >
                All
              </button>
              {Object.values(TECHNIQUE_IDS).map((id) => (
                <button
                  key={id}
                  onClick={() => { haptic('selection'); setFilterTechnique(id) }}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 h-9 sm:h-10 rounded-xl text-xs font-medium transition-[background,color,box-shadow] duration-200',
                    filterTechnique === id
                      ? 'bg-bw-active text-bw shadow-md'
                      : 'text-bw-tertiary hover:text-bw-secondary'
                  )}
                >
                  <TechniqueGeometryIcon techniqueId={id} className={cn(
                    'shrink-0',
                    filterTechnique === id ? 'text-bw' : 'text-bw-tertiary'
                  )} />
                  <span className="hidden sm:inline truncate">
                    {breathingProtocols[id].name.split(' ')[0]}
                  </span>
                </button>
              ))}
            </div>

            <SessionHistory sessions={filteredSessions} />
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
