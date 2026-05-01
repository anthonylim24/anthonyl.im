import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import type { PersonalBest } from '@/stores/historyStore'
import { TechniqueGeometryIcon } from '@/components/ui/TechniqueGeometryIcon'
import { TECHNIQUE_RING_COLORS } from '@/lib/palette'

interface PersonalBestsProps {
  personalBests: Record<TechniqueId, PersonalBest | undefined>
}

function pluralizeSeconds(seconds: number): string {
  return `${seconds} second${seconds === 1 ? '' : 's'}`
}

function buildPersonalBestLabel(techniqueId: TechniqueId, best: PersonalBest): string {
  return [
    breathingProtocols[techniqueId].name,
    `best hold ${pluralizeSeconds(best.maxHoldTime)}`,
    formatDate(new Date(best.date)),
  ].join(', ')
}

export function PersonalBests({ personalBests }: PersonalBestsProps) {
  const bestCount = Object.values(personalBests).filter(Boolean).length
  const hasBests = bestCount > 0

  if (!hasBests) {
    return (
      <div className="overflow-hidden">
        <div className="pb-4 border-b border-bw-border">
          <h3 className="font-display text-2xl font-semibold text-bw leading-none">
            Personal Bests
          </h3>
        </div>
        <div className="pt-4">
          <div
            className="text-center text-bw-tertiary py-6 text-sm"
            role="status"
            aria-label="No personal bests recorded yet."
          >
            Personal records unlock as you practice. Start your first session to begin tracking.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden">
      <div className="pb-4 border-b border-bw-border">
        <h3 className="font-display text-2xl font-semibold text-bw leading-none">
          Personal Bests
        </h3>
      </div>
      <div className="pt-4">
        <div
          role="list"
          aria-label={`${bestCount} personal best${bestCount === 1 ? '' : 's'}`}
        >
          {Object.values(TECHNIQUE_IDS).map((techniqueId) => {
            const best = personalBests[techniqueId]
            if (!best) return null

            return (
              <div
                key={techniqueId}
                role="listitem"
                aria-label={buildPersonalBestLabel(techniqueId, best)}
                className="flex items-center justify-between border-b border-bw-border py-3 group hover:bg-bw-hover transition-all duration-300"
              >
                <div className="flex items-center gap-3">
                  <TechniqueGeometryIcon techniqueId={techniqueId} className="text-bw-secondary" style={{ color: TECHNIQUE_RING_COLORS[techniqueId].primary }} />
                  <div>
                    <div className="font-medium text-sm text-bw">
                      {breathingProtocols[techniqueId].name}
                    </div>
                    <div className="text-xs text-bw-tertiary">
                      {formatDate(new Date(best.date))}
                    </div>
                  </div>
                </div>
                <div className="font-mono text-2xl font-normal text-bw tabular-nums" aria-label={pluralizeSeconds(best.maxHoldTime)}>
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
