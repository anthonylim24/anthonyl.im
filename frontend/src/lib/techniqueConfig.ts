// techniqueConfig.ts – Technique visual configuration.
// Techniques are distinguished by geometry AND subtle chromatic tints.

import type { TechniqueId } from './constants'
import { TECHNIQUE_IDS } from './constants'
import {
  TECHNIQUE,
  TECHNIQUE_GRADIENT,
  TECHNIQUE_PHASES,
  TECHNIQUE_RING_COLORS,
  TECHNIQUE_RING_COLORS_DARK,
  ACCENT_WARM,
} from './palette'

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

/** Get technique-specific ring colors (for ConcentricRings visualization) */
export function getTechniqueRingColor(id: TechniqueId, isDark = false): { primary: string; secondary: string } {
  return isDark ? TECHNIQUE_RING_COLORS_DARK[id] : TECHNIQUE_RING_COLORS[id]
}

/** Inline style for technique icon box — technique tint */
export function techniqueGradientStyle(id: TechniqueId): React.CSSProperties {
  const colors = TECHNIQUE_RING_COLORS[id]
  return { background: colors.primary }
}

/** Inline style for an active/selected state — subtle technique tint */
export function techniqueActiveStyle(id: TechniqueId): React.CSSProperties {
  const colors = TECHNIQUE_RING_COLORS[id]
  return {
    borderColor: `${colors.primary}24`,
    background: `${colors.primary}0A`,
  }
}

/** Technique card background — technique primary */
export function techniqueCardGradient(id: TechniqueId): React.CSSProperties {
  const colors = TECHNIQUE_RING_COLORS[id]
  return {
    background: colors.primary,
    border: `1px solid ${colors.primary}14`,
  }
}

/** Progress bar style — technique primary */
export function techniqueProgressStyle(id: TechniqueId): React.CSSProperties {
  const colors = TECHNIQUE_RING_COLORS[id]
  return { background: colors.primary }
}

/** Default accent style — warm amber */
export function accentGradientStyle(): React.CSSProperties {
  return { background: ACCENT_WARM }
}

/** Per-technique phase color map */
export function getTechniquePhaseColors(id: TechniqueId) {
  return TECHNIQUE_PHASES[id]
}
