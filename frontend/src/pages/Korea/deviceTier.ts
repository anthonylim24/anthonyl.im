// Device-tier detection + effect-preference persistence for the
// Detailed-3D Map Mode scene.
//
// We do a one-shot GPU/CPU/memory sniff at module load time and bucket
// the device into "low" / "medium" / "high". The tier picks the
// default state of three optional post-processing effects (atmospheric
// fog, god rays, the time-of-day CSS grade); any explicit user choice
// in the debug menu wins over the default and is persisted to
// localStorage so the same browser remembers its preference.
//
// The detector is deliberately conservative — when in doubt we pick
// the cheaper tier. Mobile GPUs (Mali, Adreno 3xx–5xx, PowerVR) and
// the Chromium SwiftShader software renderer all force "low" so we
// don't ship a 40-tap radial blur to a phone that can barely render
// the base tiles.

export type DeviceTier = "low" | "medium" | "high"

export interface EffectPrefs {
  /** `THREE.FogExp2` on `scene.fog` — atmospheric haze that tints with
   *  the time-of-day color table. ~0.05 ms/frame. */
  fog: boolean
  /** Custom radial-blur god rays from the directional sun light.
   *  Costs an extra half-res silhouette pass + a fullscreen composite
   *  — defaults to off on low-tier GPUs. */
  godRays: boolean
  /** CSS filter chain on the renderer canvas (see `cssFilterFor`).
   *  Compositor-only — effectively free, on by default. */
  grade: boolean
  /** "Max Quality" pipeline — HDR EffectComposer with AgX tone mapping,
   *  per-phase bloom, ray-marched volumetric clouds with ground
   *  shadows, in-shader color grade, SMAA. Tier-gated to `high` GPUs
   *  by default; on A19-class hardware it adds ~5–6 ms/frame, which
   *  fits the 16.6 ms budget with the existing tile cost. The toggle
   *  is exposed in the debug menu so the user can always force it. */
  maxQuality: boolean
}

const PREFS_KEY = "korea-d3d-effects"

/** One-shot device sniff. Lives at module scope so we don't redo the
 *  WebGL context probe on every Map Mode open — opening + tossing a
 *  GL context isn't free on every browser. */
export function detectTier(): DeviceTier {
  // SSR safety + jsdom/happy-dom fallback: no window → low.
  if (typeof window === "undefined" || typeof navigator === "undefined") return "low"

  const cores = (navigator.hardwareConcurrency as number | undefined) ?? 4
  const mem = ((navigator as Navigator & { deviceMemory?: number }).deviceMemory) ?? 4
  const dpr = window.devicePixelRatio ?? 1

  // GPU string sniff — opt-in via WEBGL_debug_renderer_info. Lots of
  // browsers gate this behind a permission, so missing data is fine
  // and we fall back to the CPU/RAM heuristic.
  let gpu = ""
  try {
    const canvas = document.createElement("canvas")
    const gl = (canvas.getContext("webgl2") || canvas.getContext("webgl")) as
      | WebGL2RenderingContext
      | WebGLRenderingContext
      | null
    const dbg = gl?.getExtension("WEBGL_debug_renderer_info") as
      | { UNMASKED_RENDERER_WEBGL: number }
      | null
    if (gl && dbg) {
      gpu = (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string) || ""
    }
    // Free the context promptly — Safari is stingy with concurrent
    // WebGL contexts and we don't want to consume one for the sniff.
    const lose = gl?.getExtension("WEBGL_lose_context") as
      | { loseContext: () => void }
      | null
    lose?.loseContext()
  } catch {
    // Some hardened browsers throw on canvas/getContext — assume low.
    return "low"
  }

  const weakGpu = /(Mali|Adreno [3-5]|PowerVR|Intel.*HD Graphics [2-5]|SwiftShader)/i.test(gpu)
  if (weakGpu) return "low"
  if (cores <= 4 || mem <= 2) return "low"
  if (cores >= 8 && mem >= 8 && dpr <= 2) return "high"
  return "medium"
}

/** Tier-default effect prefs. Users can override and persist via the
 *  debug menu. `prefersReducedMotion` is treated as a hard "low" tier
 *  for the defaults — fog + god rays both off — but the user can still
 *  toggle them on manually if they want. */
export function defaultPrefsForTier(tier: DeviceTier, prefersReducedMotion = false): EffectPrefs {
  if (prefersReducedMotion || tier === "low") {
    return { fog: false, godRays: false, grade: true, maxQuality: false }
  }
  if (tier === "medium") {
    return { fog: true, godRays: false, grade: true, maxQuality: false }
  }
  // Max Quality stays opt-in by default even on high tier — it's a
  // ~5-6 ms/frame budget hit that not every user will want. The
  // debug menu surfaces the toggle prominently.
  return { fog: true, godRays: true, grade: true, maxQuality: false }
}

/** Read the persisted overrides (if any) and merge over the tier
 *  defaults. Storage failures (private mode) silently fall back to
 *  defaults — these are preferences, not data. */
export function loadEffectPrefs(tier: DeviceTier, prefersReducedMotion = false): EffectPrefs {
  const defaults = defaultPrefsForTier(tier, prefersReducedMotion)
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<EffectPrefs>
    return {
      fog: typeof parsed.fog === "boolean" ? parsed.fog : defaults.fog,
      godRays: typeof parsed.godRays === "boolean" ? parsed.godRays : defaults.godRays,
      grade: typeof parsed.grade === "boolean" ? parsed.grade : defaults.grade,
      maxQuality: typeof parsed.maxQuality === "boolean" ? parsed.maxQuality : defaults.maxQuality,
    }
  } catch {
    return defaults
  }
}

export function saveEffectPrefs(prefs: EffectPrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* private mode / storage full — silent */
  }
}
