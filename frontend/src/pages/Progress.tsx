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
      <div className="space-y-10 sm:space-y-12">
        {/* Header */}
        <motion.div variants={fadeUp} className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-mono text-lg font-medium text-bw tracking-[0.02em]">
              Progress
            </h1>
          </div>
          <div className="relative">
            {showClearConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-bw-tertiary">Clear all?</span>
                <button
                  onClick={handleClearHistory}
                  className="px-3 py-1.5 text-xs font-medium border border-red-400/30 text-red-400 hover:bg-red-500/10 transition-colors duration-300"
                >
                  Yes
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-3 py-1.5 text-xs font-medium border border-bw-border text-bw-secondary hover:text-bw transition-colors duration-300"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => { haptic('error'); setShowClearConfirm(true) }}
                className="px-3 py-2 text-xs text-bw-tertiary hover:text-red-400 transition-colors duration-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </motion.div>

        {/* ── Two-column grid on md+ ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 sm:gap-12">
          {/* Level */}
          <motion.div variants={fadeUp} className="border-t border-bw-border pt-5">
            <div className="flex items-center gap-6">
              <LevelRing level={level} progress={progress} size={100} strokeWidth={4} />
              <div className="flex-1 min-w-0 space-y-3">
                <div>
                  <div className="text-[10px] font-medium text-bw-secondary tracking-[0.07em] uppercase">
                    Level {level}
                  </div>
                  <div className="font-mono text-lg font-normal text-bw">{levelTitle}</div>
                </div>
                <div className="space-y-2">
                  <div className="h-px bg-bw-border overflow-hidden">
                    <div
                      className="h-full origin-left transition-transform duration-700 ease-out bg-bw"
                      style={{
                        transform: `translateZ(0) scaleX(${Math.min(1, progress)})`,
                      }}
                    />
                  </div>
                  <div className="text-[10px] text-bw-tertiary font-medium tabular-nums">
                    {xpInLevel} / {xpNeeded} XP
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Activity Heatmap */}
          <motion.div variants={fadeUp} className="border-t border-bw-border pt-5">
            <h2 className="text-[10px] font-medium tracking-[0.07em] uppercase text-bw-secondary mb-5">
              Activity
            </h2>
            <ActivityHeatmap sessions={sessionDays} />
          </motion.div>

          {/* Achievements */}
          <motion.div variants={fadeUp} className="border-t border-bw-border pt-5">
            <h2 className="text-[10px] font-medium tracking-[0.07em] uppercase text-bw-secondary mb-5">
              Achievements
            </h2>
            <BadgeGrid earnedBadges={earnedBadges} />
          </motion.div>

          {/* Personal Bests */}
          <motion.div variants={fadeUp} className="border-t border-bw-border pt-5">
            <PersonalBests personalBests={personalBests} />
          </motion.div>
        </div>

        {/* ── Full-width sections below ── */}

        {/* Progress Chart */}
        <motion.div variants={fadeUp} className="border-t border-bw-border pt-5">
          <ProgressChart
            sessions={filteredSessions.filter((s) => s.maxHoldTime > 0)}
          />
        </motion.div>

        {/* Session History */}
        <motion.div variants={fadeUp} className="border-t border-bw-border pt-5">
          <div className="mb-5">
            <h3 className="text-[10px] font-medium tracking-[0.07em] uppercase text-bw-secondary">
              Session History
            </h3>
          </div>
          <div>
            {/* Filter Buttons */}
            <div className="flex gap-4 mb-5 sm:mb-6 border-b border-bw-border pb-3">
              <button
                onClick={() => { haptic('selection'); setFilterTechnique('all') }}
                className={cn(
                  'text-xs font-medium transition-colors duration-200',
                  filterTechnique === 'all'
                    ? 'text-bw'
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
                    'flex items-center gap-1.5 text-xs font-medium transition-colors duration-200',
                    filterTechnique === id
                      ? 'text-bw'
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
