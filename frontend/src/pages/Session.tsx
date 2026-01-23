import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BreathingSession } from '@/components/breathing/BreathingSession'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  breathingProtocols,
  calculateSessionDuration,
  type SessionConfig,
} from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatTime, cn } from '@/lib/utils'
import { Wind, Flame, Box, Clock, RotateCw, Minus, Plus, Play } from 'lucide-react'

const techniqueConfig: Record<TechniqueId, {
  icon: React.ReactNode
  gradient: string
  glow: string
}> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: {
    icon: <Box className="h-5 w-5" />,
    gradient: 'from-blue-500 to-indigo-600',
    glow: 'shadow-blue-500/25',
  },
  [TECHNIQUE_IDS.CO2_TOLERANCE]: {
    icon: <Flame className="h-5 w-5" />,
    gradient: 'from-orange-500 to-rose-600',
    glow: 'shadow-orange-500/25',
  },
  [TECHNIQUE_IDS.POWER_BREATHING]: {
    icon: <Wind className="h-5 w-5" />,
    gradient: 'from-emerald-500 to-teal-600',
    glow: 'shadow-emerald-500/25',
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
      <div className="pb-32 md:pb-16">
        <BreathingSession
          config={sessionConfig}
          onComplete={handleSessionComplete}
          onCancel={handleSessionCancel}
        />
      </div>
    )
  }

  return (
    <div className="pb-32 md:pb-16">
      <div className="max-w-2xl mx-auto space-y-6 sm:space-y-8">
        {/* Header */}
        <div className="text-center space-y-2 sm:space-y-3">
          <h1 className="text-2xl sm:text-3xl font-bold">Configure Session</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Customize your breathing exercise
          </p>
        </div>

        {/* Technique Selection Tabs */}
        <Tabs
          value={selectedTechnique}
          onValueChange={handleTechniqueChange}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-3 h-12 sm:h-14 p-1 sm:p-1.5 glass rounded-xl sm:rounded-2xl">
            {Object.values(TECHNIQUE_IDS).map((id) => {
              const tc = techniqueConfig[id]
              return (
                <TabsTrigger
                  key={id}
                  value={id}
                  className="gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl data-[state=active]:shadow-lg transition-all text-xs sm:text-sm"
                >
                  <div className={cn(
                    "h-6 w-6 sm:h-7 sm:w-7 rounded-md sm:rounded-lg bg-gradient-to-br flex items-center justify-center",
                    tc.gradient
                  )}>
                    <span className="text-white scale-[0.6] sm:scale-75">{tc.icon}</span>
                  </div>
                  <span className="hidden sm:inline font-medium">
                    {breathingProtocols[id].name.split(' ')[0]}
                  </span>
                </TabsTrigger>
              )
            })}
          </TabsList>

          {Object.values(breathingProtocols).map((p) => (
            <TabsContent key={p.id} value={p.id} className="mt-4 sm:mt-6">
              <Card>
                <CardHeader className="p-4 sm:p-6">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className={cn(
                      "h-12 w-12 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-lg shrink-0",
                      techniqueConfig[p.id].gradient,
                      techniqueConfig[p.id].glow
                    )}>
                      <span className="text-white scale-90 sm:scale-110">{techniqueConfig[p.id].icon}</span>
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-lg sm:text-xl">{p.name}</CardTitle>
                      <CardDescription className="mt-1 text-xs sm:text-sm">{p.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 pt-0 space-y-3 sm:space-y-4">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm">
                    <span className="font-medium text-primary">Purpose:</span>
                    <span className="text-muted-foreground">{p.purpose}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm">
                    <span className="font-medium text-primary">Pattern:</span>
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      {p.phases.map((phase, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg bg-muted text-[10px] sm:text-xs font-mono">
                            {phase.duration}s
                          </span>
                          {i < p.phases.length - 1 && (
                            <span className="text-muted-foreground text-xs">→</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>

        {/* Session Configuration */}
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <RotateCw className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              Session Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 space-y-6 sm:space-y-8">
            {/* Rounds */}
            <div className="space-y-3 sm:space-y-4">
              <label className="text-xs sm:text-sm font-medium">Number of Rounds</label>
              <div className="flex items-center justify-center gap-4 sm:gap-6">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setRounds((r) => Math.max(1, r - 1))}
                  disabled={rounds <= 1}
                  className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg sm:rounded-xl"
                >
                  <Minus className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
                <div className="text-center min-w-[80px]">
                  <span className="text-4xl sm:text-5xl font-bold tabular-nums">
                    {rounds}
                  </span>
                  <span className="block text-xs sm:text-sm text-muted-foreground mt-1">rounds</span>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setRounds((r) => Math.min(20, r + 1))}
                  disabled={rounds >= 20}
                  className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg sm:rounded-xl"
                >
                  <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </div>
            </div>

            {/* Estimated Duration */}
            <div className="flex items-center justify-center gap-2 sm:gap-3 py-3 sm:py-4 px-4 sm:px-6 rounded-xl sm:rounded-2xl bg-muted/50">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              <span className="text-xs sm:text-sm text-muted-foreground">Estimated:</span>
              <span className="font-semibold text-base sm:text-lg">{formatTime(estimatedDuration)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Start Button */}
        <Button
          onClick={handleStartSession}
          variant="ghost"
          size="xl"
          className={cn(
            "w-full gap-2 sm:gap-3 bg-gradient-to-r text-white shadow-xl hover:opacity-90",
            config.gradient,
            config.glow
          )}
        >
          <Play className="h-5 w-5" />
          Start {protocol.name}
        </Button>
      </div>
    </div>
  )
}
