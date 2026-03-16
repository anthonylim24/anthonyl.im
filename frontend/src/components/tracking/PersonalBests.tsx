import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import { getTechniqueVisual, techniqueGradientStyle } from '@/lib/techniqueConfig'
import type { PersonalBest } from '@/stores/historyStore'
import { Wind, Flame, Box, Trophy, Heart } from 'lucide-react'
import { ACHIEVEMENT } from '@/lib/palette'

interface PersonalBestsProps {
  personalBests: Record<TechniqueId, PersonalBest | undefined>
}

const techniqueIcons: Record<TechniqueId, React.ReactNode> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: <Box className="h-5 w-5" />,
  [TECHNIQUE_IDS.CO2_TOLERANCE]: <Flame className="h-5 w-5" />,
  [TECHNIQUE_IDS.POWER_BREATHING]: <Wind className="h-5 w-5" />,
  [TECHNIQUE_IDS.CYCLIC_SIGHING]: <Heart className="h-5 w-5" />,
}

export function PersonalBests({ personalBests }: PersonalBestsProps) {
  const hasBests = Object.values(personalBests).some(Boolean)

  if (!hasBests) {
    return (
      <div className="card-elevated rounded-[22px] overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-white/6">
          <h3 className="flex items-center gap-2.5 font-display font-bold text-white">
            <Trophy className="h-5 w-5" style={{ color: ACHIEVEMENT }} />
            Personal Bests
          </h3>
        </div>
        <div className="p-5 sm:p-6">
          <div className="text-center text-white/30 py-6 text-sm">
            Personal records unlock as you practice. Start your first session to begin tracking.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card-elevated rounded-[22px] overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-white/6">
        <h3 className="flex items-center gap-2.5 font-display font-bold text-white">
          <Trophy className="h-5 w-5" style={{ color: ACCENT_BRIGHT }} />
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
                className="flex items-center justify-between p-4 rounded-[16px] surface-well group hover:bg-white/5 transition-all duration-300"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-11 w-11 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform duration-300"
                    style={techniqueGradientStyle(techniqueId)}
                  >
                    <span className="text-white">{techniqueIcons[techniqueId]}</span>
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-white">
                      {breathingProtocols[techniqueId].name}
                    </div>
                    <div className="text-xs text-white/30">
                      {formatDate(new Date(best.date))}
                    </div>
                  </div>
                </div>
                <div className="font-display text-2xl font-bold tabular-nums" style={{ color: tv.primary }}>
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
