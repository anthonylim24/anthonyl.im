import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BreathingSession } from '@/components/breathing/BreathingSession'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  breathingProtocols,
  calculateSessionDuration,
  type SessionConfig,
} from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatTime, cn } from '@/lib/utils'
import { Wind, Flame, Box, Clock, RotateCw, Minus, Plus, Play, Sparkles } from 'lucide-react'

const techniqueConfig: Record<TechniqueId, {
  icon: React.ReactNode
  gradient: string
  glow: string
  accentColor: string
}> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: {
    icon: <Box className="h-5 w-5" />,
    gradient: 'from-[#60a5fa] to-[#818cf8]',
    glow: 'shadow-[#60a5fa]/30',
    accentColor: '#60a5fa',
  },
  [TECHNIQUE_IDS.CO2_TOLERANCE]: {
    icon: <Flame className="h-5 w-5" />,
    gradient: 'from-[#fbbf24] to-[#f97316]',
    glow: 'shadow-[#fbbf24]/30',
    accentColor: '#fbbf24',
  },
  [TECHNIQUE_IDS.POWER_BREATHING]: {
    icon: <Wind className="h-5 w-5" />,
    gradient: 'from-[#2dd4bf] to-[#22d3ee]',
    glow: 'shadow-[#2dd4bf]/30',
    accentColor: '#2dd4bf',
  },
}

export function Session() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialTechnique =
    (searchParams.get('technique') as TechniqueId) || TECHNIQUE_IDS.BOX_BREATHING

  const [selectedTechnique, setSelectedTechnique] =
    useState<TechniqueId>(initialTechnique)
  const [rounds, setRounds] = useState(
    breathingProtocols[initialTechnique].defaultRounds
  )
  const [sessionStarted, setSessionStarted] = useState(false)

  const protocol = breathingProtocols[selectedTechnique]
  const config = techniqueConfig[selectedTechnique]

  const sessionConfig: SessionConfig = useMemo(
    () => ({
      techniqueId: selectedTechnique,
      rounds,
    }),
    [selectedTechnique, rounds]
  )

  const estimatedDuration = useMemo(
    () => calculateSessionDuration(sessionConfig),
    [sessionConfig]
  )

  const handleTechniqueChange = (value: string) => {
    const techniqueId = value as TechniqueId
    setSelectedTechnique(techniqueId)
    setRounds(breathingProtocols[techniqueId].defaultRounds)
  }

  const handleStartSession = () => {
    setSessionStarted(true)
  }

  const handleSessionComplete = () => {
    setSessionStarted(false)
    navigate('/breathwork/progress')
  }

  const handleSessionCancel = () => {
    setSessionStarted(false)
  }

  if (sessionStarted) {
    return (
      <div className="pb-4">
        <BreathingSession
          config={sessionConfig}
          onComplete={handleSessionComplete}
          onCancel={handleSessionCancel}
        />
      </div>
    )
  }

  return (
    <div className="pb-4">
      <div className="max-w-2xl mx-auto space-y-8 sm:space-y-10">
        {/* Header */}
        <div className="text-center space-y-3 sm:space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full liquid-glass-breath text-sm font-medium animate-scale-in">
            <Sparkles className="h-4 w-4 text-[#ff7170]" />
            <span className="text-foreground/80">Configure Your Practice</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground opacity-0 animate-slide-up stagger-1">
            <span className="gradient-text-breath">Session</span> Setup
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground opacity-0 animate-slide-up stagger-2">
            Customize your breathing exercise
          </p>
        </div>

        {/* Technique Selection Tabs */}
        <Tabs
          value={selectedTechnique}
          onValueChange={handleTechniqueChange}
          className="w-full opacity-0 animate-slide-up stagger-3"
        >
          <TabsList className="grid w-full grid-cols-3 h-14 sm:h-16 p-1.5 liquid-glass-breath rounded-2xl">
            {Object.values(TECHNIQUE_IDS).map((id) => {
              const tc = techniqueConfig[id]
              return (
                <TabsTrigger
                  key={id}
                  value={id}
                  className="gap-2 rounded-xl data-[state=active]:bg-white/60 data-[state=active]:shadow-lg transition-all text-xs sm:text-sm"
                >
                  <div className={cn(
                    "h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-md",
                    tc.gradient
                  )}>
                    <span className="text-white scale-75">{tc.icon}</span>
                  </div>
                  <span className="hidden sm:inline font-medium text-foreground">
                    {breathingProtocols[id].name.split(' ')[0]}
                  </span>
                </TabsTrigger>
              )
            })}
          </TabsList>

          {Object.values(breathingProtocols).map((p) => (
            <TabsContent key={p.id} value={p.id} className="mt-5 sm:mt-6">
              <div className="liquid-glass-breath rounded-3xl overflow-hidden">
                <div className="p-5 sm:p-6">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-lg shrink-0",
                      techniqueConfig[p.id].gradient,
                      techniqueConfig[p.id].glow
                    )}>
                      <span className="text-white scale-110">{techniqueConfig[p.id].icon}</span>
                    </div>
                    <div className="min-w-0 pt-1">
                      <h3 className="text-lg sm:text-xl font-semibold text-foreground">{p.name}</h3>
                      <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">{p.description}</p>
                    </div>
                  </div>
                </div>
                <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-4">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm">
                    <span className="font-semibold" style={{ color: techniqueConfig[p.id].accentColor }}>Purpose:</span>
                    <span className="text-muted-foreground">{p.purpose}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm">
                    <span className="font-semibold" style={{ color: techniqueConfig[p.id].accentColor }}>Pattern:</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {p.phases.map((phase, i) => (
                        <span key={i} className="flex items-center gap-1.5">
                          <span className="px-2.5 py-1 rounded-lg bg-white/50 text-xs font-mono text-foreground shadow-sm">
                            {phase.duration}s
                          </span>
                          {i < p.phases.length - 1 && (
                            <span className="text-muted-foreground text-xs">→</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {/* Session Configuration */}
        <div className="liquid-glass-breath rounded-3xl overflow-hidden opacity-0 animate-slide-up stagger-4">
          <div className="p-5 sm:p-6 border-b border-white/20">
            <h3 className="flex items-center gap-2 text-base sm:text-lg font-semibold text-foreground">
              <RotateCw className="h-5 w-5" style={{ color: config.accentColor }} />
              Session Settings
            </h3>
          </div>
          <div className="p-5 sm:p-6 space-y-6 sm:space-y-8">
            {/* Rounds */}
            <div className="space-y-4">
              <label className="text-sm font-medium text-foreground">Number of Rounds</label>
              <div className="flex items-center justify-center gap-5 sm:gap-8">
                <button
                  onClick={() => setRounds((r) => Math.max(1, r - 1))}
                  disabled={rounds <= 1}
                  className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-white/50 hover:bg-white/70 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-300 shadow-sm hover:shadow-md text-foreground"
                >
                  <Minus className="h-5 w-5" />
                </button>
                <div className="text-center min-w-[100px]">
                  <span className="text-5xl sm:text-6xl font-bold tabular-nums text-foreground">
                    {rounds}
                  </span>
                  <span className="block text-sm text-muted-foreground mt-1 font-medium">rounds</span>
                </div>
                <button
                  onClick={() => setRounds((r) => Math.min(20, r + 1))}
                  disabled={rounds >= 20}
                  className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-white/50 hover:bg-white/70 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-300 shadow-sm hover:shadow-md text-foreground"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Estimated Duration */}
            <div className="flex items-center justify-center gap-3 py-4 px-6 rounded-2xl bg-white/40">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Estimated:</span>
              <span className="font-bold text-lg text-foreground">{formatTime(estimatedDuration)}</span>
            </div>
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={handleStartSession}
          className={cn(
            "w-full py-4 sm:py-5 px-6 rounded-2xl font-semibold text-white text-base sm:text-lg",
            "bg-gradient-to-r shadow-xl hover:shadow-2xl",
            "flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02]",
            "opacity-0 animate-scale-in stagger-5",
            config.gradient,
            config.glow
          )}
        >
          <Play className="h-5 w-5 sm:h-6 sm:w-6" />
          Start {protocol.name}
        </button>
      </div>
    </div>
  )
}
