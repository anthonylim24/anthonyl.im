import { useState, useMemo } from 'react'
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
import { Trash2, Wind, Flame, Box, Sparkles, Award, CalendarDays } from 'lucide-react'

const techniqueConfig: Record<TechniqueId, {
  icon: React.ReactNode
  gradient: string
  glow: string
}> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: {
    icon: <Box className="h-4 w-4" />,
    gradient: 'from-[#60a5fa] to-[#818cf8]',
    glow: 'shadow-[#60a5fa]/30',
  },
  [TECHNIQUE_IDS.CO2_TOLERANCE]: {
    icon: <Flame className="h-4 w-4" />,
    gradient: 'from-[#fbbf24] to-[#f97316]',
    glow: 'shadow-[#fbbf24]/30',
  },
  [TECHNIQUE_IDS.POWER_BREATHING]: {
    icon: <Wind className="h-4 w-4" />,
    gradient: 'from-[#2dd4bf] to-[#22d3ee]',
    glow: 'shadow-[#2dd4bf]/30',
  },
}

export function Progress() {
  const {
    sessions,
    personalBests,
    clearHistory,
  } = useHistoryStore()

  const { xp, earnedBadges } = useGamificationStore()

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
    clearHistory()
    setShowClearConfirm(false)
  }

  return (
    <div className="pb-4">
      <div className="space-y-8 sm:space-y-10">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-white opacity-0 animate-slide-up stagger-1">
              Your Progress
            </h1>
          </div>
          <div className="relative">
            {showClearConfirm ? (
              <div className="flex items-center gap-2 animate-scale-in">
                <span className="text-sm text-white/50">Clear all data?</span>
                <button
                  onClick={handleClearHistory}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all duration-300"
                >
                  Yes
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white/5 text-white/50 hover:bg-white/10 transition-all duration-300"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all duration-300 flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Level Card */}
        <div className="liquid-glass-breath rounded-3xl p-5 sm:p-6 opacity-0 animate-slide-up stagger-2">
          <div className="flex items-center gap-5">
            <LevelRing level={level} progress={progress} size={100} />
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <div className="text-white/50 text-sm font-medium">Level {level}</div>
                <div className="text-white text-lg font-bold">{levelTitle}</div>
              </div>
              <div className="space-y-1.5">
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#60a5fa] to-[#818cf8] transition-all duration-700 ease-out"
                    style={{ width: `${Math.min(100, progress * 100)}%` }}
                  />
                </div>
                <div className="text-white/40 text-xs font-medium">
                  {xpInLevel} / {xpNeeded} XP
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Achievements / Badge Grid */}
        <div className="opacity-0 animate-slide-up stagger-3">
          <h2 className="flex items-center gap-2 text-white font-semibold text-base sm:text-lg mb-4">
            <Award className="h-5 w-5 text-amber-400" />
            Achievements
          </h2>
          <BadgeGrid earnedBadges={earnedBadges} />
        </div>

        {/* Activity Heatmap */}
        <div className="opacity-0 animate-slide-up stagger-4">
          <h2 className="flex items-center gap-2 text-white font-semibold text-base sm:text-lg mb-4">
            <CalendarDays className="h-5 w-5 text-emerald-400" />
            Activity
          </h2>
          <ActivityHeatmap sessions={sessionDays} />
        </div>

        {/* Personal Bests */}
        <div className="opacity-0 animate-slide-up stagger-5">
          <PersonalBests personalBests={personalBests} />
        </div>

        {/* Progress Chart */}
        <div className="opacity-0 animate-scale-in" style={{ animationDelay: '0.6s' }}>
          <ProgressChart
            sessions={filteredSessions.filter((s) => s.maxHoldTime > 0)}
          />
        </div>

        {/* Session History */}
        <div className="liquid-glass-breath rounded-3xl overflow-hidden opacity-0 animate-scale-in" style={{ animationDelay: '0.7s' }}>
          <div className="p-5 sm:p-6 border-b border-white/10">
            <h3 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#ff7170]" />
              Session History
            </h3>
          </div>
          <div className="p-5 sm:p-6">
            {/* Filter Buttons */}
            <div className="grid grid-cols-4 h-12 sm:h-14 p-1.5 bg-white/5 rounded-xl mb-5 sm:mb-6">
              <button
                onClick={() => setFilterTechnique('all')}
                className={cn(
                  'rounded-lg text-xs sm:text-sm font-medium transition-all duration-300',
                  filterTechnique === 'all'
                    ? 'bg-white/10 text-white shadow-md'
                    : 'text-white/40 hover:text-white/60'
                )}
              >
                All
              </button>
              {Object.values(TECHNIQUE_IDS).map((id) => {
                const tc = techniqueConfig[id]
                return (
                  <button
                    key={id}
                    onClick={() => setFilterTechnique(id)}
                    className={cn(
                      'flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg transition-all duration-300',
                      filterTechnique === id
                        ? 'bg-white/10 text-white shadow-md'
                        : 'text-white/40 hover:text-white/60'
                    )}
                  >
                    <div className={cn(
                      "h-5 w-5 sm:h-6 sm:w-6 rounded bg-gradient-to-br flex items-center justify-center shadow-sm",
                      tc.gradient
                    )}>
                      <span className="text-white scale-75">{tc.icon}</span>
                    </div>
                    <span className="hidden sm:inline text-xs font-medium">
                      {breathingProtocols[id].name.split(' ')[0]}
                    </span>
                  </button>
                )
              })}
            </div>

            <SessionHistory sessions={filteredSessions} />
          </div>
        </div>
      </div>
    </div>
  )
}
