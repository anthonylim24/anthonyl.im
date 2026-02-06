import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHistoryStore } from '@/stores/historyStore'
import { useGamificationStore } from '@/stores/gamificationStore'
import { getLevelForXP, getXPForLevel, getLevelTitle } from '@/lib/gamification'
import { LevelRing } from '@/components/gamification/LevelRing'
import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatDate, formatTime, cn } from '@/lib/utils'
import {
  Wind,
  Flame,
  Box,
  Trophy,
  TrendingUp,
  ChevronRight,
  Zap,
  Target,
} from 'lucide-react'

const techniqueConfig: Record<
  TechniqueId,
  { icon: React.ReactNode; gradient: string; glow: string; accentColor: string }
> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: {
    icon: <Box className="h-6 w-6" />,
    gradient: 'from-blue-500 to-cyan-500',
    glow: 'shadow-blue-500/25',
    accentColor: '#3b82f6',
  },
  [TECHNIQUE_IDS.CO2_TOLERANCE]: {
    icon: <Flame className="h-6 w-6" />,
    gradient: 'from-amber-500 to-orange-500',
    glow: 'shadow-amber-500/25',
    accentColor: '#f59e0b',
  },
  [TECHNIQUE_IDS.POWER_BREATHING]: {
    icon: <Wind className="h-6 w-6" />,
    gradient: 'from-emerald-500 to-teal-500',
    glow: 'shadow-emerald-500/25',
    accentColor: '#10b981',
  },
}

export function Home() {
  const navigate = useNavigate()
  const { sessions, getStreak } = useHistoryStore()
  const { xp, dailySessionCount } = useGamificationStore()

  const streak = useMemo(() => getStreak(), [sessions])
  const recentSessions = useMemo(() => sessions.slice(0, 3), [sessions])

  const level = getLevelForXP(xp)
  const currentLevelXP = getXPForLevel(level)
  const nextLevelXP = getXPForLevel(level + 1)
  const xpInLevel = xp - currentLevelXP
  const xpNeeded = nextLevelXP - currentLevelXP
  const levelProgress = xpNeeded > 0 ? xpInLevel / xpNeeded : 1
  const levelTitle = getLevelTitle(level)

  const totalPracticeTime = useMemo(
    () => sessions.reduce((sum, s) => sum + s.durationSeconds, 0),
    [sessions],
  )

  const dailyGoalMet = dailySessionCount >= 1

  const handleSelectTechnique = (techniqueId: TechniqueId) => {
    navigate(`/breathwork/session?technique=${techniqueId}`)
  }

  return (
    <div className="pb-6">
      {/* ── Hero Section ─────────────────────────────────────── */}
      <div className="relative overflow-hidden mb-10 sm:mb-14">
        <div className="relative py-8 sm:py-12 md:py-16">
          <div className="max-w-lg mx-auto text-center space-y-5 opacity-0 animate-slide-up stagger-1">
            {/* Level Ring */}
            <div className="flex justify-center">
              <LevelRing level={level} progress={levelProgress} size={90} />
            </div>

            {/* Level Title */}
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                {levelTitle}
              </h1>
              <p className="text-sm text-white/50 mt-1">Level {level}</p>
            </div>

            {/* XP Progress Bar */}
            <div className="max-w-xs mx-auto space-y-1.5">
              <div className="flex items-center justify-between text-xs text-white/50">
                <span>{xpInLevel} XP</span>
                <span>{xpNeeded} XP to Level {level + 1}</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-700 ease-out"
                  style={{ width: `${Math.round(levelProgress * 100)}%` }}
                />
              </div>
            </div>

            {/* Streak + Daily Goal */}
            <div className="flex items-center justify-center gap-6">
              {/* Streak */}
              <div className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-amber-400" />
                <span className="text-lg font-semibold text-white">{streak}</span>
                <span className="text-sm text-white/50">day streak</span>
              </div>

              {/* Divider */}
              <div className="h-5 w-px bg-white/15" />

              {/* Daily Goal */}
              <div className="flex items-center gap-2">
                <Target
                  className={cn(
                    'h-5 w-5',
                    dailyGoalMet ? 'text-emerald-400' : 'text-white/40',
                  )}
                />
                <span
                  className={cn(
                    'text-sm font-medium',
                    dailyGoalMet ? 'text-emerald-400' : 'text-white/50',
                  )}
                >
                  {dailyGoalMet ? 'Goal met!' : '1 session today'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-10 sm:space-y-14">
        {/* ── Quick Stats Row ────────────────────────────────── */}
        {sessions.length > 0 && (
          <div className="grid grid-cols-3 gap-3 sm:gap-4 opacity-0 animate-slide-up stagger-2">
            {/* Total Sessions */}
            <div className="liquid-glass-breath rounded-2xl p-4 sm:p-6 text-center group">
              <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-violet-500/25 group-hover:scale-110 transition-transform duration-300">
                <Trophy className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-white">
                {sessions.length}
              </div>
              <div className="text-xs sm:text-sm text-white/50 font-medium">Sessions</div>
            </div>

            {/* Total Practice Time */}
            <div className="liquid-glass-breath rounded-2xl p-4 sm:p-6 text-center group">
              <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-blue-500/25 group-hover:scale-110 transition-transform duration-300">
                <Zap className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-white">
                {formatTime(totalPracticeTime)}
              </div>
              <div className="text-xs sm:text-sm text-white/50 font-medium">Practice</div>
            </div>

            {/* Current Streak */}
            <div className="liquid-glass-breath rounded-2xl p-4 sm:p-6 text-center group">
              <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-amber-500/25 group-hover:scale-110 transition-transform duration-300">
                <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-white">{streak}</div>
              <div className="text-xs sm:text-sm text-white/50 font-medium">Streak</div>
            </div>
          </div>
        )}

        {/* ── Technique Cards ────────────────────────────────── */}
        <div className="space-y-5 sm:space-y-8 opacity-0 animate-slide-up stagger-3">
          <div className="text-center space-y-2">
            <h2 className="text-xl sm:text-2xl font-semibold text-white">
              Choose a Technique
            </h2>
            <p className="text-sm sm:text-base text-white/50">
              Select a breathing protocol to begin
            </p>
          </div>

          <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
            {([
              TECHNIQUE_IDS.BOX_BREATHING,
              TECHNIQUE_IDS.CO2_TOLERANCE,
              TECHNIQUE_IDS.POWER_BREATHING,
            ] as TechniqueId[]).map((id, index) => {
              const protocol = breathingProtocols[id]
              const config = techniqueConfig[id]
              return (
                <div
                  key={id}
                  className={cn(
                    'liquid-glass-breath rounded-2xl p-5 sm:p-6 cursor-pointer group',
                    'opacity-0 animate-scale-in',
                    'flex flex-col h-full',
                  )}
                  style={{ animationDelay: `${0.15 + index * 0.1}s` }}
                  onClick={() => handleSelectTechnique(id)}
                >
                  {/* Icon + Name */}
                  <div className="flex items-start gap-4 mb-4">
                    <div
                      className={cn(
                        'h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-lg shrink-0',
                        'transition-all duration-300 group-hover:scale-110 group-hover:rotate-3',
                        config.gradient,
                        config.glow,
                      )}
                    >
                      <span className="text-white">{config.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <h3 className="text-lg sm:text-xl font-semibold text-white">
                        {protocol.name}
                      </h3>
                      <p className="text-xs font-medium mt-0.5" style={{ color: config.accentColor }}>
                        {protocol.purpose}
                      </p>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-white/50 leading-relaxed flex-1">
                    {protocol.description}
                  </p>

                  {/* Start Button */}
                  <button
                    className={cn(
                      'w-full py-3 px-4 rounded-xl font-medium text-white mt-5',
                      'bg-gradient-to-r transition-all duration-300',
                      'shadow-lg group-hover:shadow-xl',
                      'flex items-center justify-center gap-2 group-hover:gap-3',
                      config.gradient,
                      config.glow,
                    )}
                  >
                    Start
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Recent Sessions ────────────────────────────────── */}
        {recentSessions.length > 0 && (
          <div className="space-y-5 sm:space-y-6 opacity-0 animate-slide-up stagger-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl sm:text-2xl font-semibold text-white">
                Recent Sessions
              </h2>
              <button
                onClick={() => navigate('/breathwork/progress')}
                className="flex items-center gap-1.5 text-sm font-medium text-white/40 hover:text-white transition-colors"
              >
                View All
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              {recentSessions.map((session, index) => {
                const config = techniqueConfig[session.techniqueId]
                return (
                  <div
                    key={session.id}
                    className="liquid-glass-breath rounded-2xl p-4 sm:p-5 group hover:scale-[1.01] transition-all duration-300 cursor-pointer opacity-0 animate-scale-in"
                    style={{ animationDelay: `${0.4 + index * 0.1}s` }}
                    onClick={() => navigate('/breathwork/progress')}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                        <div
                          className={cn(
                            'h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-lg shrink-0',
                            'group-hover:scale-110 transition-transform duration-300',
                            config.gradient,
                            config.glow,
                          )}
                        >
                          <span className="text-white scale-90">{config.icon}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm sm:text-base text-white truncate">
                            {breathingProtocols[session.techniqueId].name}
                          </div>
                          <div className="text-xs sm:text-sm text-white/40">
                            {formatDate(new Date(session.date))} · {session.rounds} rounds
                            {session.maxHoldTime > 0 && ` · ${session.maxHoldTime}s hold`}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-white/30 shrink-0 group-hover:text-white/60 transition-colors" />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
