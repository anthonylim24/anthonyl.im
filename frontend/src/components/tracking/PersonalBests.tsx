import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatDate, cn } from '@/lib/utils'
import type { PersonalBest } from '@/stores/historyStore'
import { Wind, Flame, Box, Trophy } from 'lucide-react'

interface PersonalBestsProps {
  personalBests: Record<TechniqueId, PersonalBest | undefined>
}

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

export function PersonalBests({ personalBests }: PersonalBestsProps) {
  const hasBests = Object.values(personalBests).some(Boolean)

  if (!hasBests) {
    return (
      <div className="liquid-glass-breath rounded-3xl overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-white/20">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <Trophy className="h-5 w-5 text-[#fbbf24]" />
            Personal Bests
          </h3>
        </div>
        <div className="p-5 sm:p-6">
          <div className="text-center text-muted-foreground py-4">
            Complete sessions to set personal records!
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="liquid-glass-breath rounded-3xl overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-white/20">
        <h3 className="flex items-center gap-2 font-semibold text-foreground">
          <Trophy className="h-5 w-5 text-[#fbbf24]" />
          Personal Bests
        </h3>
      </div>
      <div className="p-5 sm:p-6">
        <div className="grid gap-3">
          {Object.values(TECHNIQUE_IDS).map((techniqueId) => {
            const best = personalBests[techniqueId]
            if (!best) return null
            const config = techniqueConfig[techniqueId]

            return (
              <div
                key={techniqueId}
                className="flex items-center justify-between p-4 bg-white/40 rounded-2xl group hover:bg-white/50 transition-all duration-300"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-11 w-11 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300",
                    config.gradient,
                    config.glow
                  )}>
                    <span className="text-white">{config.icon}</span>
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">
                      {breathingProtocols[techniqueId].name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(new Date(best.date))}
                    </div>
                  </div>
                </div>
                <div className="text-2xl font-bold" style={{ color: config.accentColor }}>
                  {best.maxHoldTime}s
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
