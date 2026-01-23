import { useNavigate } from 'react-router-dom'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useHistoryStore } from '@/stores/historyStore'
import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import { Wind, Flame, Box, Trophy, TrendingUp, Sparkles, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const techniqueConfig: Record<TechniqueId, {
  icon: React.ReactNode
  gradient: string
  glow: string
}> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: {
    icon: <Box className="h-7 w-7" />,
    gradient: 'from-blue-500 to-indigo-600',
    glow: 'shadow-blue-500/25',
  },
  [TECHNIQUE_IDS.CO2_TOLERANCE]: {
    icon: <Flame className="h-7 w-7" />,
    gradient: 'from-orange-500 to-rose-600',
    glow: 'shadow-orange-500/25',
  },
  [TECHNIQUE_IDS.POWER_BREATHING]: {
    icon: <Wind className="h-7 w-7" />,
    gradient: 'from-emerald-500 to-teal-600',
    glow: 'shadow-emerald-500/25',
  },
}

export function Home() {
  const navigate = useNavigate()
  const { sessions, personalBests, getStreak } = useHistoryStore()
  const streak = getStreak()
  const recentSessions = sessions.slice(0, 3)

  const handleSelectTechnique = (techniqueId: TechniqueId) => {
    navigate(`/breathwork/session?technique=${techniqueId}`)
  }

  return (
    <div className="pb-32 md:pb-16">
      {/* Hero Section */}
      <div className="relative overflow-hidden mb-10 sm:mb-14">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />
        <div className="relative py-10 sm:py-16 md:py-20">
          <div className="max-w-2xl mx-auto text-center space-y-5 sm:space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Optimize Your Breathing</span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
              <span className="gradient-text">Breathwork</span> for
              <br />VO2Max Performance
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-md mx-auto leading-relaxed px-2">
              Enhance your oxygen efficiency and unlock peak athletic performance through science-backed breathing techniques.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-10 sm:space-y-14">
        {/* Quick Stats */}
        {sessions.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <Card className="group hover:scale-[1.02] transition-transform">
              <CardContent className="p-4 sm:pt-6 sm:p-6 text-center">
                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center mx-auto mb-2 sm:mb-3 shadow-lg shadow-yellow-500/20">
                  <Trophy className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold">{sessions.length}</div>
                <div className="text-xs sm:text-sm text-muted-foreground">Sessions</div>
              </CardContent>
            </Card>
            <Card className="group hover:scale-[1.02] transition-transform">
              <CardContent className="p-4 sm:pt-6 sm:p-6 text-center">
                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mx-auto mb-2 sm:mb-3 shadow-lg shadow-green-500/20">
                  <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold">{streak}</div>
                <div className="text-xs sm:text-sm text-muted-foreground">Day Streak</div>
              </CardContent>
            </Card>
            {Object.values(personalBests).filter(Boolean).slice(0, 2).map((best) => (
              best && (
                <Card key={best.techniqueId} className="group hover:scale-[1.02] transition-transform">
                  <CardContent className="p-4 sm:pt-6 sm:p-6 text-center">
                    <div className={cn(
                      "h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-gradient-to-br flex items-center justify-center mx-auto mb-2 sm:mb-3 shadow-lg",
                      techniqueConfig[best.techniqueId].gradient,
                      techniqueConfig[best.techniqueId].glow
                    )}>
                      <span className="text-white">{techniqueConfig[best.techniqueId].icon}</span>
                    </div>
                    <div className="text-2xl sm:text-3xl font-bold">{best.maxHoldTime}s</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">
                      Best {breathingProtocols[best.techniqueId].name.split(' ')[0]}
                    </div>
                  </CardContent>
                </Card>
              )
            ))}
          </div>
        )}

        {/* Technique Selection */}
        <div className="space-y-5 sm:space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-xl sm:text-2xl font-semibold">Choose a Technique</h2>
            <p className="text-sm sm:text-base text-muted-foreground">Select a breathing protocol to begin your session</p>
          </div>

          <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
            {Object.values(breathingProtocols).map((protocol) => {
              const config = techniqueConfig[protocol.id]
              return (
                <Card
                  key={protocol.id}
                  className="group cursor-pointer hover:scale-[1.02] transition-all duration-300"
                  onClick={() => handleSelectTechnique(protocol.id)}
                >
                  <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-4">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className={cn(
                        "h-12 w-12 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 shrink-0",
                        config.gradient,
                        config.glow
                      )}>
                        <span className="text-white">{config.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg sm:text-xl mb-1">{protocol.name}</CardTitle>
                        <CardDescription className="text-xs font-medium text-primary/80">
                          {protocol.purpose}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 pt-0">
                    <p className="text-sm text-muted-foreground mb-4 sm:mb-5 leading-relaxed">
                      {protocol.description}
                    </p>
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full gap-2 group-hover:gap-3 transition-all bg-gradient-to-r text-white hover:opacity-90",
                        config.gradient
                      )}
                      size="lg"
                    >
                      Start Session
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>

        {/* Recent Sessions */}
        {recentSessions.length > 0 && (
          <div className="space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl sm:text-2xl font-semibold">Recent Sessions</h2>
              <Button variant="ghost" onClick={() => navigate('/breathwork/progress')} className="gap-2 text-sm">
                View All
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-3">
              {recentSessions.map((session) => {
                const config = techniqueConfig[session.techniqueId]
                return (
                  <Card key={session.id} className="group hover:scale-[1.01] transition-transform">
                    <CardContent className="p-4 sm:py-5 sm:px-6">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                          <div className={cn(
                            "h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-md shrink-0",
                            config.gradient,
                            config.glow
                          )}>
                            <span className="text-white scale-75">{config.icon}</span>
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm sm:text-base truncate">
                              {breathingProtocols[session.techniqueId].name}
                            </div>
                            <div className="text-xs sm:text-sm text-muted-foreground">
                              {formatDate(new Date(session.date))} · {session.rounds} rounds
                            </div>
                          </div>
                        </div>
                        {session.maxHoldTime > 0 && (
                          <div className="text-right shrink-0">
                            <div className="text-lg sm:text-xl font-bold">{session.maxHoldTime}s</div>
                            <div className="text-xs text-muted-foreground">Best hold</div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
