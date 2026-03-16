import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import type { PersonalBest } from '@/stores/historyStore'
import { TechniqueGeometryIcon } from '@/components/ui/TechniqueGeometryIcon'
import { TECHNIQUE_RING_COLORS } from '@/lib/palette'

interface PersonalBestsProps {
  personalBests: Record<TechniqueId, PersonalBest | undefined>
}

export function PersonalBests({ personalBests }: PersonalBestsProps) {
  const hasBests = Object.values(personalBests).some(Boolean)

  if (!hasBests) {
    return (
      <div className="card-elevated rounded-[22px] overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-bw-border-subtle">
          <h3 className="font-display font-light text-bw tracking-[0.04em]">
            Personal Bests
          </h3>
        </div>
        <div className="p-5 sm:p-6">
          <div className="text-center text-bw-tertiary py-6 text-sm">
            Personal records unlock as you practice. Start your first session to begin tracking.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card-elevated rounded-[22px] overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-bw-border-subtle">
        <h3 className="font-display font-light text-bw tracking-[0.04em]">
          Personal Bests
        </h3>
      </div>
      <div className="p-5 sm:p-6">
        <div className="grid gap-3">
          {Object.values(TECHNIQUE_IDS).map((techniqueId) => {
            const best = personalBests[techniqueId]
            if (!best) return null

            return (
              <div
                key={techniqueId}
                className="flex items-center justify-between p-4 rounded-[16px] surface-well group hover:bg-bw-hover transition-all duration-300"
              >
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform duration-300 bg-bw-hover border border-bw-border">
                    <TechniqueGeometryIcon techniqueId={techniqueId} style={{ color: TECHNIQUE_RING_COLORS[techniqueId].primary }} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-bw">
                      {breathingProtocols[techniqueId].name}
                    </div>
                    <div className="text-xs text-bw-tertiary">
                      {formatDate(new Date(best.date))}
                    </div>
                  </div>
                </div>
                <div className="font-display text-2xl font-light text-bw tabular-nums">
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
