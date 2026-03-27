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
      <div className="overflow-hidden">
        <div className="pb-4 border-b border-bw-border">
          <h3 className="font-mono font-normal text-bw tracking-[0.04em]">
            Personal Bests
          </h3>
        </div>
        <div className="pt-4">
          <div className="text-center text-bw-tertiary py-6 text-sm font-mono">
            Personal records unlock as you practice. Start your first session to begin tracking.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden">
      <div className="pb-4 border-b border-bw-border">
        <h3 className="font-mono font-normal text-bw tracking-[0.04em]">
          Personal Bests
        </h3>
      </div>
      <div className="pt-4">
        <div>
          {Object.values(TECHNIQUE_IDS).map((techniqueId) => {
            const best = personalBests[techniqueId]
            if (!best) return null

            return (
              <div
                key={techniqueId}
                className="flex items-center justify-between border-b border-bw-border py-3 group hover:bg-bw-hover transition-all duration-300"
              >
                <div className="flex items-center gap-3">
                  <TechniqueGeometryIcon techniqueId={techniqueId} className="text-bw-secondary" style={{ color: TECHNIQUE_RING_COLORS[techniqueId].primary }} />
                  <div>
                    <div className="font-mono font-medium text-sm text-bw">
                      {breathingProtocols[techniqueId].name}
                    </div>
                    <div className="text-xs font-mono text-bw-tertiary">
                      {formatDate(new Date(best.date))}
                    </div>
                  </div>
                </div>
                <div className="font-mono text-2xl font-normal text-bw tabular-nums">
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
