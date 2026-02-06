import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BreathingSession } from '@/components/breathing/BreathingSession'
import {
  breathingProtocols,
  calculateSessionDuration,
  type SessionConfig,
} from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatTime, cn } from '@/lib/utils'
import { ACCENT_BRIGHT } from '@/lib/palette'
import { techniqueGradientStyle, techniqueActiveStyle } from '@/lib/techniqueConfig'
import { Wind, Flame, Box, Clock, Minus, Plus, Play, Sparkles } from 'lucide-react'

const techniqueIcons: Record<TechniqueId, React.ReactNode> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: <Box className="h-5 w-5" />,
  [TECHNIQUE_IDS.CO2_TOLERANCE]: <Flame className="h-5 w-5" />,
  [TECHNIQUE_IDS.POWER_BREATHING]: <Wind className="h-5 w-5" />,
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

  const handleTechniqueChange = (techniqueId: TechniqueId) => {
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
      <BreathingSession
        config={sessionConfig}
        onComplete={handleSessionComplete}
        onCancel={handleSessionCancel}
      />
    )
  }

  return (
    <div className="pb-4">
      <div className="max-w-2xl mx-auto space-y-8 sm:space-y-10">
        {/* Header */}
        <div className="text-center space-y-3 sm:space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full liquid-glass-breath text-sm font-medium animate-scale-in">
            <Sparkles className="h-4 w-4" style={{ color: ACCENT_BRIGHT }} />
            <span className="text-white/50">Configure Your Practice</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold opacity-0 animate-slide-up stagger-1">
            <span className="gradient-text-breath">Session</span>{' '}
            <span className="text-white">Setup</span>
          </h1>
          <p className="text-sm sm:text-base text-white/40 opacity-0 animate-slide-up stagger-2">
            Choose your technique and customize your session
          </p>
        </div>

        {/* Technique Selection - 3 clickable cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 opacity-0 animate-slide-up stagger-3">
          {Object.values(TECHNIQUE_IDS).map((id) => {
            const p = breathingProtocols[id]
            const isSelected = selectedTechnique === id

            return (
              <button
                key={id}
                onClick={() => handleTechniqueChange(id)}
                className={cn(
                  'liquid-glass-breath rounded-2xl p-5 text-left transition-all duration-300',
                  'border hover:scale-[1.02]',
                  !isSelected && 'border-white/5 hover:border-white/10'
                )}
                style={isSelected ? techniqueActiveStyle(id) : undefined}
              >
                <div className="h-12 w-12 rounded-xl flex items-center justify-center mb-3" style={techniqueGradientStyle(id)}>
                  <span className="text-white">{techniqueIcons[id]}</span>
                </div>
                <h3 className="text-base font-semibold text-white mb-1">{p.name}</h3>
                <p className="text-xs text-white/40 leading-relaxed line-clamp-2">
                  {p.purpose}
                </p>
                {/* Phase pattern */}
                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                  {p.phases.map((phase, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <span className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-mono text-white/50">
                        {phase.duration}s
                      </span>
                      {i < p.phases.length - 1 && (
                        <span className="text-white/20 text-[10px]">→</span>
                      )}
                    </span>
                  ))}
                </div>
              </button>
            )
          })}
        </div>

        {/* Selected technique description */}
        <div className="liquid-glass-breath rounded-2xl p-5 opacity-0 animate-slide-up stagger-3">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0" style={techniqueGradientStyle(selectedTechnique)}>
              <span className="text-white">{techniqueIcons[selectedTechnique]}</span>
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-white">{protocol.name}</h3>
              <p className="mt-1 text-sm text-white/40 leading-relaxed">{protocol.description}</p>
            </div>
          </div>
        </div>

        {/* Session Configuration */}
        <div className="liquid-glass-breath rounded-2xl overflow-hidden opacity-0 animate-slide-up stagger-4">
          <div className="p-5 sm:p-6 space-y-6 sm:space-y-8">
            {/* Rounds */}
            <div className="space-y-4">
              <label className="text-sm font-medium text-white/50">Number of Rounds</label>
              <div className="flex items-center justify-center gap-5 sm:gap-8">
                <button
                  onClick={() => setRounds((r) => Math.max(1, r - 1))}
                  disabled={rounds <= 1}
                  className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-300 border border-white/10 text-white"
                >
                  <Minus className="h-5 w-5" />
                </button>
                <div className="text-center min-w-[100px]">
                  <span className="text-5xl sm:text-6xl font-bold tabular-nums text-white">
                    {rounds}
                  </span>
                  <span className="block text-sm text-white/40 mt-1 font-medium">rounds</span>
                </div>
                <button
                  onClick={() => setRounds((r) => Math.min(20, r + 1))}
                  disabled={rounds >= 20}
                  className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-300 border border-white/10 text-white"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Estimated Duration */}
            <div className="flex items-center justify-center gap-3 py-4 px-6 rounded-2xl bg-white/5 border border-white/5">
              <Clock className="h-5 w-5 text-white/40" />
              <span className="text-sm text-white/40">Estimated:</span>
              <span className="font-bold text-lg text-white">{formatTime(estimatedDuration)}</span>
            </div>
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={handleStartSession}
          className="w-full py-4 sm:py-5 px-6 rounded-2xl font-semibold text-white text-base sm:text-lg shadow-xl hover:shadow-2xl flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02] opacity-0 animate-scale-in stagger-5"
          style={techniqueGradientStyle(selectedTechnique)}
        >
          <Play className="h-5 w-5 sm:h-6 sm:w-6" />
          Begin {protocol.name}
        </button>
      </div>
    </div>
  )
}
