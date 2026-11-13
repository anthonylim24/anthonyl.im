// Whether the photoreal 3D view can open in this build and browser. Kept
// apart from the scene so the workspace can ask without loading three.js.

export function tilesKey(): string | undefined {
  const env = import.meta.env as Record<string, string | undefined>
  return env.VITE_GOOGLE_MAP_TILES_API_KEY || env.VITE_GOOGLE_PLACES_API_KEY || undefined
}

let webgl2: boolean | null = null

export function supportsWebgl2(): boolean {
  if (webgl2 !== null) return webgl2
  webgl2 = false
  if (typeof document === "undefined" || typeof WebGL2RenderingContext === "undefined") return webgl2
  try {
    const gl = document.createElement("canvas").getContext("webgl2")
    webgl2 = Boolean(gl)
    // Browsers ration live contexts; give the probe's back straight away.
    gl?.getExtension("WEBGL_lose_context")?.loseContext()
  } catch {
    webgl2 = false
  }
  return webgl2
}

/**
 * Production needs a Google tiles key and WebGL2. A dev build always
 * qualifies: without a key the scene stands on a procedural model city
 * (`devGround.ts`), so the view can be built and screenshotted locally.
 */
export function availability(input: { dev: boolean; key?: string; webgl2: boolean }): boolean {
  if (input.dev) return true
  return Boolean(input.key) && input.webgl2
}

export function photorealAvailable(): boolean {
  const dev = import.meta.env.DEV
  return availability({ dev, key: tilesKey(), webgl2: dev || supportsWebgl2() })
}
