import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { DEFAULT_ORB_THEME_ID, type OrbTheme } from './gamify/orbThemes'

/**
 * Watercolour pigments: each technique paints with its own pair. `mass` is
 * the masstone (full-strength pigment), `glaze` the second colour that drifts
 * through the wash. Washes dilute these on paper, so they can be deep.
 */
export interface Pigment {
  name: string
  mass: string
  glaze: string
}

export const TECHNIQUE_PIGMENTS: Record<TechniqueId, Pigment> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: { name: "Indigo & Payne's grey", mass: '#2B3A5E', glaze: '#55657A' },
  [TECHNIQUE_IDS.CO2_TOLERANCE]: { name: 'Viridian', mass: '#1F7A68', glaze: '#5E9C7F' },
  [TECHNIQUE_IDS.POWER_BREATHING]: { name: 'Quinacridone rose & cadmium orange', mass: '#C23A64', glaze: '#E5793A' },
  [TECHNIQUE_IDS.CYCLIC_SIGHING]: { name: 'Cobalt violet', mass: '#7D4FA3', glaze: '#C08BC2' },
  [TECHNIQUE_IDS.RESONANCE_BREATHING]: { name: 'Cerulean', mass: '#2F7FA6', glaze: '#73B2B6' },
  [TECHNIQUE_IDS.DIAPHRAGMATIC_BREATHING]: { name: 'Sap green & raw sienna', mass: '#5D8436', glaze: '#C18F47' },
  [TECHNIQUE_IDS.EXTENDED_EXHALE]: { name: 'Permanent rose', mass: '#B9506F', glaze: '#D99A9B' },
  [TECHNIQUE_IDS.FOUR_SEVEN_EIGHT]: { name: 'Moonglow', mass: '#45407A', glaze: '#8A7FA8' },
  [TECHNIQUE_IDS.PURSED_LIP_RECOVERY]: { name: 'Burnt sienna', mass: '#A4532F', glaze: '#D19A55' },
}

/** Hidden prism wash for the five-tap easter egg. */
export const PRISM_PIGMENT: Pigment = { name: 'Prism', mass: '#C23A64', glaze: '#2F7FA6' }

export function techniquePigment(id: TechniqueId): Pigment {
  return TECHNIQUE_PIGMENTS[id] ?? TECHNIQUE_PIGMENTS[TECHNIQUE_IDS.CYCLIC_SIGHING]
}

/** Default theme paints with the technique; unlocked themes override it. */
export function sessionPigment(id: TechniqueId, theme: OrbTheme): Pigment {
  if (theme.id === DEFAULT_ORB_THEME_ID) return techniquePigment(id)
  return { name: theme.name, mass: theme.colors[0], glaze: theme.colors[1] }
}
