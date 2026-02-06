// techniqueConfig.ts – Shared technique visual configuration.
// Replaces the 6 duplicated techniqueConfig objects scattered across pages/components.
// Uses inline style helpers because Tailwind JIT can't resolve dynamic bracket classes.

import type { TechniqueId } from './constants'
import { TECHNIQUE_IDS } from './constants'
import { TECHNIQUE, ACCENT, ACCENT_BRIGHT } from './palette'

export interface TechniqueVisual {
  /** Primary technique color (hex) */
  primary: string
  /** Secondary technique color (hex) */
  secondary: string
}

const VISUALS: Record<TechniqueId, TechniqueVisual> = {
  [TECHNIQUE_IDS.BOX_BREATHING]:   TECHNIQUE.box,
  [TECHNIQUE_IDS.CO2_TOLERANCE]:   TECHNIQUE.co2,
  [TECHNIQUE_IDS.POWER_BREATHING]: TECHNIQUE.power,
}

/** Get the visual config for a technique */
export function getTechniqueVisual(id: TechniqueId): TechniqueVisual {
  return VISUALS[id]
}

/** Inline style for a gradient background (e.g. icon boxes, buttons) */
export function techniqueGradientStyle(id: TechniqueId): React.CSSProperties {
  const v = VISUALS[id]
  return {
    background: `linear-gradient(to bottom right, ${v.primary}, ${v.secondary})`,
    boxShadow: `0 10px 15px -3px ${v.primary}40`,
  }
}

/** Inline style for an active/selected card border + tint */
export function techniqueActiveStyle(id: TechniqueId): React.CSSProperties {
  const v = VISUALS[id]
  return {
    borderColor: `${v.primary}80`,
    backgroundColor: `${v.primary}1A`, // ~10% opacity
    boxShadow: `0 10px 15px -3px ${v.primary}30`,
  }
}

/** Inline style for a progress bar using the technique's gradient */
export function techniqueProgressStyle(id: TechniqueId): React.CSSProperties {
  const v = VISUALS[id]
  return {
    background: `linear-gradient(to right, ${v.primary}, ${v.secondary})`,
  }
}

/** Default accent gradient style (for non-technique-specific elements) */
export function accentGradientStyle(): React.CSSProperties {
  return {
    background: `linear-gradient(to right, ${ACCENT}, ${ACCENT_BRIGHT})`,
    boxShadow: `0 10px 15px -3px ${ACCENT}40`,
  }
}
