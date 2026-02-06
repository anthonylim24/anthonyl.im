import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import { getTechniqueVisual, techniqueGradientStyle } from '@/lib/techniqueConfig'
import type { PersonalBest } from '@/stores/historyStore'
import { Wind, Flame, Box, Trophy } from 'lucide-react'

interface PersonalBestsProps {
  personalBests: Record<TechniqueId, PersonalBest | undefined>
}

const techniqueIcons: Record<TechniqueId, React.ReactNode> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: <Box className="h-5 w-5" />,
  [TECHNIQUE_IDS.CO2_TOLERANCE]: <Flame className="h-5 w-5" />,
  [TECHNIQUE_IDS.POWER_BREATHING]: <Wind className="h-5 w-5" />,
}

export function PersonalBests({ personalBests }: PersonalBestsProps) {
  const hasBests = Object.values(personalBests).some(Boolean)

  if (!hasBests) {
    return (
      <div className="liquid-glass-breath rounded-3xl overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-white/10">
          <h3 className="flex items-center gap-2 font-semibold text-white">
            <Trophy className="h-5 w-5 text-[#B0B8FF]" />
            Personal Bests
          </h3>
        </div>
        <div className="p-5 sm:p-6">
          <div className="text-center text-white/40 py-4">
            Complete sessions to set personal records!
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="liquid-glass-breath rounded-3xl overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-white/10">
        <h3 className="flex items-center gap-2 font-semibold text-white">
          <Trophy className="h-5 w-5 text-[#B0B8FF]" />
          Personal Bests
        </h3>
      </div>
      <div className="p-5 sm:p-6">
        <div className="grid gap-3">
          {Object.values(TECHNIQUE_IDS).map((techniqueId) => {
            const best = personalBests[techniqueId]
            if (!best) return null
            const tv = getTechniqueVisual(techniqueId)

            return (
              <div
                key={techniqueId}
                className="flex items-center justify-between p-4 bg-white/5 rounded-2xl group hover:bg-white/10 transition-all duration-300"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-11 w-11 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300"
                    style={techniqueGradientStyle(techniqueId)}
                  >
                    <span className="text-white">{techniqueIcons[techniqueId]}</span>
                  </div>
                  <div>
                    <div className="font-semibold text-white">
                      {breathingProtocols[techniqueId].name}
                    </div>
                    <div className="text-sm text-white/40">
                      {formatDate(new Date(best.date))}
                    </div>
                  </div>
                </div>
                <div className="text-2xl font-bold" style={{ color: tv.primary }}>
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
