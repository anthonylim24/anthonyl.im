// Cheap WebGL feature-detect used by Map Mode to decide whether to mount
// the Three.js scene or drop to the styled list fallback. Lives in its
// own file so we don't pull in a heavy scene module just to test for
// browser capability.

export function isWebglSupported(): boolean {
  if (typeof window === "undefined") return false
  try {
    const canvas = document.createElement("canvas")
    const ctx =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    return !!ctx
  } catch {
    return false
  }
}
