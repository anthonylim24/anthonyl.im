import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHistoryStore } from '@/stores/historyStore'
import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatDate, cn } from '@/lib/utils'
import { Wind, Flame, Box, Trophy, TrendingUp, Sparkles, ChevronRight } from 'lucide-react'

// Vibrant technique colors for playful breathwork design
const techniqueConfig: Record<TechniqueId, {
  icon: React.ReactNode
  gradient: string
  glow: string
  lightBg: string
  accentColor: string
}> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: {
    icon: <Box className="h-7 w-7" />,
    gradient: 'from-[#60a5fa] to-[#818cf8]',
    glow: 'shadow-[#60a5fa]/30',
    lightBg: 'bg-[#60a5fa]/10',
    accentColor: '#60a5fa',
  },
  [TECHNIQUE_IDS.CO2_TOLERANCE]: {
    icon: <Flame className="h-7 w-7" />,
    gradient: 'from-[#fbbf24] to-[#f97316]',
    glow: 'shadow-[#fbbf24]/30',
    lightBg: 'bg-[#fbbf24]/10',
    accentColor: '#fbbf24',
  },
  [TECHNIQUE_IDS.POWER_BREATHING]: {
    icon: <Wind className="h-7 w-7" />,
    gradient: 'from-[#2dd4bf] to-[#22d3ee]',
    glow: 'shadow-[#2dd4bf]/30',
    lightBg: 'bg-[#2dd4bf]/10',
    accentColor: '#2dd4bf',
  },
}

export function Home() {
  const navigate = useNavigate()
  const { sessions, personalBests, getStreak } = useHistoryStore()
  // Memoize expensive getStreak() calculation
  const streak = useMemo(() => getStreak(), [sessions])
  const recentSessions = useMemo(() => sessions.slice(0, 3), [sessions])

  const handleSelectTechnique = (techniqueId: TechniqueId) => {
    navigate(`/breathwork/session?technique=${techniqueId}`)
  }

  return (
    <div className="pb-4">
      {/* Hero Section with playful animation */}
      <div className="relative overflow-hidden mb-10 sm:mb-14">
        <div className="relative py-8 sm:py-12 md:py-16">
          <div className="max-w-2xl mx-auto text-center space-y-5 sm:space-y-6">
            {/* Animated badge */}
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full liquid-glass-breath text-sm font-medium animate-scale-in">
              <Sparkles className="h-4 w-4 text-[#ff7170]" />
              <span className="bg-gradient-to-r from-[#ff7170] to-[#ff5eb5] bg-clip-text text-transparent font-semibold">
                Optimize Your Breathing
              </span>
            </div>

            {/* Main heading with gradient */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight opacity-0 animate-slide-up stagger-1">
              <span className="gradient-text-breath">Breathwork</span>
              <span className="text-foreground"> for</span>
              <br />
              <span className="text-foreground">VO2Max Performance</span>
            </h1>

            {/* Description */}
            <p className="text-base sm:text-lg text-muted-foreground max-w-md mx-auto leading-relaxed px-2 opacity-0 animate-slide-up stagger-2">
              Enhance your oxygen efficiency and unlock peak athletic performance through science-backed breathing techniques.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-10 sm:space-y-14">
        {/* Quick Stats with liquid glass cards */}
        {sessions.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 opacity-0 animate-slide-up stagger-3">
            <div className="liquid-glass-breath rounded-2xl p-4 sm:p-6 text-center group">
              <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-gradient-to-br from-[#ff7170] to-[#ff5eb5] flex items-center justify-center mx-auto mb-3 shadow-lg shadow-[#ff7170]/25 group-hover:scale-110 transition-transform duration-300">
                <Trophy className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-foreground">{sessions.length}</div>
              <div className="text-xs sm:text-sm text-muted-foreground font-medium">Sessions</div>
            </div>

            <div className="liquid-glass-breath rounded-2xl p-4 sm:p-6 text-center group">
              <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-gradient-to-br from-[#2dd4bf] to-[#22d3ee] flex items-center justify-center mx-auto mb-3 shadow-lg shadow-[#2dd4bf]/25 group-hover:scale-110 transition-transform duration-300">
                <TrendingUp className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-foreground">{streak}</div>
              <div className="text-xs sm:text-sm text-muted-foreground font-medium">Day Streak</div>
            </div>

            {Object.values(personalBests).filter(Boolean).slice(0, 2).map((best) => (
              best && (
                <div key={best.techniqueId} className="liquid-glass-breath rounded-2xl p-4 sm:p-6 text-center group">
                  <div className={cn(
                    "h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-gradient-to-br flex items-center justify-center mx-auto mb-3 shadow-lg group-hover:scale-110 transition-transform duration-300",
                    techniqueConfig[best.techniqueId].gradient,
                    techniqueConfig[best.techniqueId].glow
                  )}>
                    <span className="text-white">{techniqueConfig[best.techniqueId].icon}</span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-foreground">{best.maxHoldTime}s</div>
                  <div className="text-xs sm:text-sm text-muted-foreground font-medium">
                    Best {breathingProtocols[best.techniqueId].name.split(' ')[0]}
                  </div>
                </div>
              )
            ))}
          </div>
        )}

        {/* Technique Selection with liquid glass cards */}
        <div className="space-y-5 sm:space-y-8 opacity-0 animate-slide-up stagger-4">
          <div className="text-center space-y-2">
            <h2 className="text-xl sm:text-2xl font-semibold text-foreground">Choose a Technique</h2>
            <p className="text-sm sm:text-base text-muted-foreground">Select a breathing protocol to begin your session</p>
          </div>

          <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
            {Object.values(breathingProtocols).map((protocol, index) => {
              const config = techniqueConfig[protocol.id]
              return (
                <div
                  key={protocol.id}
                  className={cn(
                    "liquid-glass-breath rounded-3xl p-5 sm:p-6 cursor-pointer group",
                    "opacity-0 animate-scale-in",
                    "flex flex-col h-full"
                  )}
                  style={{ animationDelay: `${0.1 + index * 0.1}s` }}
                  onClick={() => handleSelectTechnique(protocol.id)}
                >
                  {/* Header with icon */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className={cn(
                      "h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 shrink-0",
                      config.gradient,
                      config.glow
                    )}>
                      <span className="text-white">{config.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-1">{protocol.name}</h3>
                      <p className="text-xs font-medium" style={{ color: config.accentColor }}>
                        {protocol.purpose}
                      </p>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                    {protocol.description}
                  </p>

                  {/* Action button - pushed to bottom */}
                  <button
                    className={cn(
                      "w-full py-3 px-4 rounded-xl font-medium text-white mt-5",
                      "bg-gradient-to-r transition-all duration-300",
                      "shadow-lg group-hover:shadow-xl",
                      "flex items-center justify-center gap-2 group-hover:gap-3",
                      config.gradient,
                      config.glow
                    )}
                  >
                    Start Session
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Recent Sessions */}
        {recentSessions.length > 0 && (
          <div className="space-y-5 sm:space-y-6 opacity-0 animate-slide-up stagger-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl sm:text-2xl font-semibold text-foreground">Recent Sessions</h2>
              <button
                onClick={() => navigate('/breathwork/progress')}
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
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
                        <div className={cn(
                          "h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-lg shrink-0 group-hover:scale-110 transition-transform duration-300",
                          config.gradient,
                          config.glow
                        )}>
                          <span className="text-white scale-75">{config.icon}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm sm:text-base text-foreground truncate">
                            {breathingProtocols[session.techniqueId].name}
                          </div>
                          <div className="text-xs sm:text-sm text-muted-foreground">
                            {formatDate(new Date(session.date))} · {session.rounds} rounds
                          </div>
                        </div>
                      </div>
                      {session.maxHoldTime > 0 && (
                        <div className="text-right shrink-0">
                          <div className="text-lg sm:text-xl font-bold text-foreground">{session.maxHoldTime}s</div>
                          <div className="text-xs text-muted-foreground font-medium">Best hold</div>
                        </div>
                      )}
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
