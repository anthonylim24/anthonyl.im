import { afterEach, describe, expect, it, vi } from "vitest"
import { availability, photorealAvailable, tilesKey } from "../available"

afterEach(() => vi.unstubAllEnvs())

describe("availability", () => {
  it("needs a tiles key and WebGL2 in production", () => {
    expect(availability({ dev: false, key: "k", webgl2: true })).toBe(true)
    expect(availability({ dev: false, key: undefined, webgl2: true })).toBe(false)
    expect(availability({ dev: false, key: "", webgl2: true })).toBe(false)
    expect(availability({ dev: false, key: "k", webgl2: false })).toBe(false)
  })

  it("is always on in a dev build, which has the procedural ground", () => {
    expect(availability({ dev: true, key: undefined, webgl2: false })).toBe(true)
  })
})

describe("tilesKey", () => {
  it("prefers the map tiles key and falls back to the places key", () => {
    vi.stubEnv("VITE_GOOGLE_MAP_TILES_API_KEY", "")
    vi.stubEnv("VITE_GOOGLE_PLACES_API_KEY", "")
    expect(tilesKey()).toBeUndefined()
    vi.stubEnv("VITE_GOOGLE_PLACES_API_KEY", "places")
    expect(tilesKey()).toBe("places")
    vi.stubEnv("VITE_GOOGLE_MAP_TILES_API_KEY", "tiles")
    expect(tilesKey()).toBe("tiles")
  })
})

describe("photorealAvailable", () => {
  it("is off in a production build with no key", () => {
    vi.stubEnv("DEV", false)
    vi.stubEnv("VITE_GOOGLE_MAP_TILES_API_KEY", "")
    vi.stubEnv("VITE_GOOGLE_PLACES_API_KEY", "")
    expect(photorealAvailable()).toBe(false)
  })

  it("is on in a dev build with no key", () => {
    vi.stubEnv("DEV", true)
    vi.stubEnv("VITE_GOOGLE_MAP_TILES_API_KEY", "")
    expect(photorealAvailable()).toBe(true)
  })
})
