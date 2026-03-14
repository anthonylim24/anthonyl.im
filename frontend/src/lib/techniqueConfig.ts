// techniqueConfig.ts – Shared technique visual configuration.
// Uses inline style helpers because Tailwind JIT can't resolve dynamic bracket classes.

import type { TechniqueId } from './constants'
import { TECHNIQUE_IDS } from './constants'
import { TECHNIQUE, TECHNIQUE_GRADIENT, TECHNIQUE_PHASES, ACCENT, ACCENT_BRIGHT } from './palette'

export interface TechniqueVisual {
  primary: string
  secondary: string
  gradient: { from: string; via: string; to: string }
}

const VISUALS: Record<TechniqueId, TechniqueVisual> = {
  [TECHNIQUE_IDS.BOX_BREATHING]:   { ...TECHNIQUE.box, gradient: TECHNIQUE_GRADIENT.box },
  [TECHNIQUE_IDS.CO2_TOLERANCE]:   { ...TECHNIQUE.co2, gradient: TECHNIQUE_GRADIENT.co2 },
  [TECHNIQUE_IDS.POWER_BREATHING]: { ...TECHNIQUE.power, gradient: TECHNIQUE_GRADIENT.power },
  [TECHNIQUE_IDS.CYCLIC_SIGHING]:  { ...TECHNIQUE.sighing, gradient: TECHNIQUE_GRADIENT.sighing },
}

export function getTechniqueVisual(id: TechniqueId): TechniqueVisual {
  return VISUALS[id]
}

/** Inline style for a gradient background (icon boxes, buttons) */
export function techniqueGradientStyle(id: TechniqueId): React.CSSProperties {
  const v = VISUALS[id]
  return {
    background: `linear-gradient(135deg, ${v.gradient.from}, ${v.gradient.to})`,
    boxShadow: `0 10px 15px -3px ${v.primary}40`,
  }
}

/** Inline style for an active/selected card border + tint */
export function techniqueActiveStyle(id: TechniqueId): React.CSSProperties {
  const v = VISUALS[id]
  return {
    borderColor: `${v.primary}50`,
    boxShadow: `0 0 0 1px ${v.primary}30, inset 0 1px 0 rgba(255,255,255,0.08), 0 20px 50px -12px rgba(0,0,0,0.5)`,
    background: `linear-gradient(160deg, ${v.gradient.from}18 0%, ${v.gradient.to}10 100%)`,
  }
}

/** Full vivid gradient for technique feature cards (Dribbble-style colorful cards) */
export function techniqueCardGradient(id: TechniqueId): React.CSSProperties {
  const v = VISUALS[id]
  return {
    background: `linear-gradient(135deg, ${v.gradient.from} 0%, ${v.gradient.via} 50%, ${v.gradient.to} 100%)`,
    border: '1px solid rgba(255, 255, 255, 0.12)',
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.15), 0 24px 60px -12px ${v.primary}35, 0 12px 28px -8px rgba(0,0,0,0.4)`,
  }
}

/** Inline style for a progress bar using the technique's gradient */
export function techniqueProgressStyle(id: TechniqueId): React.CSSProperties {
  const v = VISUALS[id]
  return {
    background: `linear-gradient(to right, ${v.gradient.from}, ${v.gradient.to})`,
  }
}

/** Default accent gradient style (for non-technique-specific elements) */
export function accentGradientStyle(): React.CSSProperties {
  return {
    background: `linear-gradient(to right, ${ACCENT}, ${ACCENT_BRIGHT})`,
    boxShadow: `0 10px 15px -3px ${ACCENT}40`,
  }
}

/** Per-technique phase color map for FluidOrb and PhaseIndicator */
export function getTechniquePhaseColors(id: TechniqueId) {
  return TECHNIQUE_PHASES[id]
}
