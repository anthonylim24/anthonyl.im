// Device-tier detection for the photoreal 3D view. A one-shot
// GPU / CPU / memory sniff buckets the device into "low" / "medium" /
// "high"; the tier picks the pixel-ratio ceiling (see adaptiveQuality).
// The detector is deliberately conservative: when in doubt it picks the
// cheaper tier. Mobile GPUs (Mali, Adreno 3xx-5xx, PowerVR) and the
// Chromium SwiftShader software renderer are all "low".

export type DeviceTier = "low" | "medium" | "high"

export interface DeviceSignals {
  cores: number
  mem: number
  dpr: number
  gpu: string
}

const WEAK_GPU =
  /(Mali|Adreno [3-5]|PowerVR|Intel.*HD Graphics [2-5]|SwiftShader)/i
const APPLE_GPU = /Apple\s*(GPU|A1[5-9]|A[2-9]\d|M[1-9])/i

export function isAppleGpu(gpu: string): boolean {
  return APPLE_GPU.test(gpu)
}

/**
 * Pure tier bucket from sniffed signals. Exported so unit tests can
 * cover iPhone-class devices without spinning a WebGL context.
 *
 * High-DPR is *not* a demotion — it's retina. The previous heuristic
 * required `dpr <= 2` and `cores >= 8`, which classified every modern
 * iPhone (6 cores, 3× DPR, `deviceMemory` often undefined) as medium
 * and skipped god rays on the device we actually target.
 */
export function tierFromSignals(s: DeviceSignals): DeviceTier {
  if (WEAK_GPU.test(s.gpu)) return "low"
  // Safari often withholds the unmasked renderer string AND reports
  // hardwareConcurrency as 4. A 3× phone with 4+ cores is still
  // iPhone-class — don't let missing deviceMemory (0) or a privacy
  // core-count demote the device we actually target.
  const appleLike =
    isAppleGpu(s.gpu) ||
    (s.gpu === "" && s.dpr >= 3 && s.cores >= 4)
  if (appleLike) {
    if (s.dpr >= 3 || s.cores >= 6) return "high"
    return "medium"
  }
  if (s.cores <= 4 || (s.mem > 0 && s.mem <= 2)) return "low"
  if (s.cores >= 8 && s.mem >= 8) return "high"
  return "medium"
}

/** One-shot device sniff. Lives at module scope so we don't redo the
 *  WebGL context probe on every Map Mode open — opening + tossing a
 *  GL context isn't free on every browser. */
export function detectTier(): DeviceTier {
  // SSR safety + jsdom/happy-dom fallback: no window → low.
  if (typeof window === "undefined" || typeof navigator === "undefined") return "low"

  const cores = (navigator.hardwareConcurrency as number | undefined) ?? 4
  // iOS Safari typically omits deviceMemory — don't treat missing as 4 GB
  // of a weak machine; pass 0 so Apple GPU rules decide.
  const mem = ((navigator as Navigator & { deviceMemory?: number }).deviceMemory) ?? 0
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

  return tierFromSignals({ cores, mem, dpr, gpu })
}
