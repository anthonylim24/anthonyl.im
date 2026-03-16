// techniqueConfig.ts – Technique visual configuration.
// Monochromatic: techniques are distinguished by geometry, not color.

import type { TechniqueId } from './constants'
import { TECHNIQUE_IDS } from './constants'
import { TECHNIQUE, TECHNIQUE_GRADIENT, TECHNIQUE_PHASES, INK, INK_SECONDARY } from './palette'

export type TechniqueGeometry = 'grid' | 'triangle' | 'octagram' | 'spiral'

export interface TechniqueVisual {
  primary: string
  secondary: string
  gradient: { from: string; via: string; to: string }
  geometry: TechniqueGeometry
}

const VISUALS: Record<TechniqueId, TechniqueVisual> = {
  [TECHNIQUE_IDS.BOX_BREATHING]:   { ...TECHNIQUE.box, gradient: TECHNIQUE_GRADIENT.box, geometry: 'grid' },
  [TECHNIQUE_IDS.CO2_TOLERANCE]:   { ...TECHNIQUE.co2, gradient: TECHNIQUE_GRADIENT.co2, geometry: 'triangle' },
  [TECHNIQUE_IDS.POWER_BREATHING]: { ...TECHNIQUE.power, gradient: TECHNIQUE_GRADIENT.power, geometry: 'octagram' },
  [TECHNIQUE_IDS.CYCLIC_SIGHING]:  { ...TECHNIQUE.sighing, gradient: TECHNIQUE_GRADIENT.sighing, geometry: 'spiral' },
}

export function getTechniqueVisual(id: TechniqueId): TechniqueVisual {
  return VISUALS[id]
}

export function getTechniqueGeometry(id: TechniqueId): TechniqueGeometry {
  return VISUALS[id].geometry
}

/** Inline style for technique icon box — flat ink */
export function techniqueGradientStyle(_id: TechniqueId): React.CSSProperties {
  return { background: INK }
}

/** Inline style for an active/selected state — subtle ink tint */
export function techniqueActiveStyle(_id: TechniqueId): React.CSSProperties {
  return {
    borderColor: 'rgba(28, 25, 23, 0.14)',
    background: 'rgba(28, 25, 23, 0.04)',
  }
}

/** Technique card background — flat ink */
export function techniqueCardGradient(_id: TechniqueId): React.CSSProperties {
  return {
    background: INK,
    border: '1px solid rgba(28, 25, 23, 0.08)',
  }
}

/** Progress bar style — ink */
export function techniqueProgressStyle(_id: TechniqueId): React.CSSProperties {
  return { background: INK }
}

/** Default accent style */
export function accentGradientStyle(): React.CSSProperties {
  return { background: INK }
}

/** Per-technique phase color map */
export function getTechniquePhaseColors(id: TechniqueId) {
  return TECHNIQUE_PHASES[id]
}
