import { lazy, Suspense, useState, useMemo } from 'react'
import { motion } from 'motion/react'
import { SessionHistory } from '@/components/tracking/SessionHistory'
import { PersonalBests } from '@/components/tracking/PersonalBests'
import { PracticeConsistency } from '@/components/tracking/PracticeConsistency'
import { useHistoryStore } from '@/stores/historyStore'
import { useGamificationStore } from '@/stores/gamificationStore'
import { getLevelForXP, getXPForLevel, getLevelTitle } from '@/lib/gamification'
import { LevelRing } from '@/components/gamification/LevelRing'
import { BadgeGrid } from '@/components/gamification/BadgeGrid'
import { ActivityHeatmap } from '@/components/gamification/ActivityHeatmap'
import { getProtocolCatalog } from '@/lib/breathingProtocols'
import { getLocalDateKey } from '@/lib/localDates'
import type { TechniqueId } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { TechniqueGeometryIcon } from '@/components/ui/TechniqueGeometryIcon'
import { Play, Trash2 } from 'lucide-react'
import { useHaptics } from '@/hooks/useHaptics'
import { useEntranceMotion } from '@/lib/motionPresets'
import { useViewTransitionNavigate } from '@/hooks/useViewTransition'

const ProgressChart = lazy(() =>
  import('@/components/tracking/ProgressChart').then((module) => ({
    default: module.ProgressChart,
  })),
)

function ProgressChartFallback() {
  return (
    <div className="overflow-hidden">
      <div className="pb-4 border-b border-bw-border">
        <h3 className="font-display text-2xl font-semibold text-bw leading-none">
          Hold Time Progress
        </h3>
      </div>
      <div className="pt-4">
        <div
          className="h-64 flex items-center justify-center text-sm text-bw-tertiary"
          role="status"
          aria-label="Loading hold time progress"
        >
          Loading hold time trend...
        </div>
      </div>
    </div>
  )
}

export function Progress() {
  const navigate = useViewTransitionNavigate()
  const { stagger, fadeUp } = useEntranceMotion()
  const {
    sessions,
    personalBests,
    clearHistory,
  } = useHistoryStore()

  const { xp, earnedBadges } = useGamificationStore()

  const { trigger: haptic } = useHaptics()
  const [filterTechnique, setFilterTechnique] = useState<TechniqueId | 'all'>('all')
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [historyStatus, setHistoryStatus] = useState<string | null>(null)
  const protocols = useMemo(() => getProtocolCatalog(), [])

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
  const holdProgressSessions = useMemo(
    () => filteredSessions.filter((s) => s.maxHoldTime > 0),
    [filteredSessions],
  )

  // Transform sessions to SessionDay format for heatmap
  const sessionDays = useMemo(() => {
    const dayMap = new Map<string, number>()
    for (const s of sessions) {
      const key = getLocalDateKey(s.date)
      if (!key) continue
      dayMap.set(key, (dayMap.get(key) ?? 0) + 1)
    }
    return Array.from(dayMap, ([date, count]) => ({ date, count }))
  }, [sessions])

  const handleClearHistory = () => {
    haptic([100, 50, 100])
    clearHistory()
    setShowClearConfirm(false)
    setHistoryStatus('Session history cleared.')
  }

  return (
    <motion.div className="pb-4" variants={stagger} initial="hidden" animate="show">
      <div className="space-y-10 sm:space-y-12">
        {/* Header */}
        <motion.div variants={fadeUp} className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-semibold text-bw leading-none">
              Progress
            </h1>
          </div>
          <div className="relative">
            {showClearConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-bw-tertiary">Clear all?</span>
                <button
                  type="button"
                  aria-label="Confirm clear history"
                  onClick={handleClearHistory}
                  className="min-h-11 min-w-11 px-3 py-2 text-xs font-medium border border-bw-destructive-border text-bw-destructive hover:bg-bw-destructive-hover transition-colors duration-300"
                >
                  Yes
                </button>
                <button
                  type="button"
                  aria-label="Cancel clear history"
                  onClick={() => {
                    setShowClearConfirm(false)
                    setHistoryStatus('Clear history cancelled.')
                  }}
                  className="min-h-11 min-w-11 px-3 py-2 text-xs font-medium border border-bw-border text-bw-secondary hover:text-bw transition-colors duration-300"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                aria-label="Clear session history"
                onClick={() => {
                  haptic('error')
                  setShowClearConfirm(true)
                  setHistoryStatus('Clear history requires confirmation.')
                }}
                className="inline-flex min-h-11 min-w-11 items-center justify-center px-3 py-2 text-xs text-bw-tertiary hover:text-bw-destructive transition-colors duration-300"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </motion.div>
        {historyStatus ? (
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {historyStatus}
          </p>
        ) : null}
        <motion.button
          type="button"
          variants={fadeUp}
          onClick={() => {
            haptic('success')
            navigate('/breathwork/session?technique=box_breathing')
          }}
          aria-label="Start a breathing session"
          className="flex min-h-11 w-full items-center justify-center gap-2.5 border border-bw-accent bg-bw-accent px-4 py-3 text-sm font-medium text-bw-accent-foreground transition-opacity hover:opacity-90"
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          Start Session
        </motion.button>

        {/* ── Two-column grid on md+ ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 sm:gap-12">
          <motion.div variants={fadeUp} className="md:col-span-2">
            <PracticeConsistency sessions={sessions} />
          </motion.div>

          {/* Level */}
          <motion.div variants={fadeUp} className="border-t border-bw-border pt-5">
            <div className="flex items-center gap-6">
              <LevelRing level={level} progress={progress} size={100} strokeWidth={4} />
              <div className="flex-1 min-w-0 space-y-3">
                <div>
                  <div className="text-[10px] font-medium text-bw-secondary tracking-[0.07em] uppercase">
                    Level {level}
                  </div>
                  <div className="font-display text-3xl font-semibold text-bw leading-none">{levelTitle}</div>
                </div>
                <div className="space-y-2">
                  <div className="h-px bg-bw-border overflow-hidden">
                    <div
                      className="h-full origin-left transition-transform duration-700 ease-out bg-bw-accent"
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

          {/* Milestones */}
          <motion.div variants={fadeUp} className="border-t border-bw-border pt-5">
            <h2 className="text-[10px] font-medium tracking-[0.07em] uppercase text-bw-secondary mb-5">
              Milestones
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
          <Suspense fallback={<ProgressChartFallback />}>
            <ProgressChart sessions={holdProgressSessions} />
          </Suspense>
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
            <div
              className="flex max-w-full min-w-0 gap-4 mb-5 sm:mb-6 border-b border-bw-border pb-3 overflow-x-auto overscroll-x-contain no-scrollbar"
              role="group"
              aria-label="Session history filters"
            >
              <button
                type="button"
                aria-label="Show all sessions"
                aria-pressed={filterTechnique === 'all'}
                onClick={() => { haptic('selection'); setFilterTechnique('all') }}
                className={cn(
                  'min-h-11 px-2 text-xs font-medium transition-colors duration-200 shrink-0',
                  filterTechnique === 'all'
                    ? 'text-bw'
                    : 'text-bw-tertiary hover:text-bw-secondary'
                )}
              >
                All
              </button>
              {protocols.map(({ id, shortName }) => (
                <button
                  type="button"
                  key={id}
                  aria-label={`Show ${shortName} sessions`}
                  aria-pressed={filterTechnique === id}
                  onClick={() => { haptic('selection'); setFilterTechnique(id) }}
                  className={cn(
                    'flex min-h-11 items-center gap-1.5 px-2 text-xs font-medium transition-colors duration-200 shrink-0',
                    filterTechnique === id
                      ? 'text-bw'
                      : 'text-bw-tertiary hover:text-bw-secondary'
                  )}
                >
                  <TechniqueGeometryIcon techniqueId={id} className={cn(
                    'shrink-0',
                    filterTechnique === id ? 'text-bw-accent' : 'text-bw-tertiary'
                  )} />
                  <span className="hidden sm:inline truncate">
                    {shortName}
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
