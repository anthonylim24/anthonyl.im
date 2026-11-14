import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { importWithRetry, isChunkLoadError, reloadForNewBuild } from "../lazyRetry"

const stale = () => new TypeError("Failed to fetch dynamically imported module: https://x/assets/photoreal-abc.js")

describe("isChunkLoadError", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://x/assets/a.js",
    "Importing a module script failed.",
    "error loading dynamically imported module",
    "Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of \"text/html\".",
    "Unable to preload CSS for /assets/a.css",
  ])("recognises %s", (message) => {
    expect(isChunkLoadError(new Error(message))).toBe(true)
  })

  it("leaves ordinary errors alone", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined (reading 'lat')"))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
})

describe("importWithRetry", () => {
  it("tries a failed chunk once more", async () => {
    const load = vi.fn().mockRejectedValueOnce(stale()).mockResolvedValue({ default: "ok" })
    await expect(importWithRetry(load, 0)).resolves.toEqual({ default: "ok" })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("gives up after the second failure", async () => {
    const load = vi.fn().mockRejectedValue(stale())
    await expect(importWithRetry(load, 0)).rejects.toThrow(/dynamically imported/)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("does not retry a module that loaded and then threw", async () => {
    const load = vi.fn().mockRejectedValue(new Error("boom in module body"))
    await expect(importWithRetry(load, 0)).rejects.toThrow("boom")
    expect(load).toHaveBeenCalledTimes(1)
  })
})

describe("reloadForNewBuild", () => {
  const reload = vi.fn()
  beforeEach(() => {
    sessionStorage.clear()
    reload.mockClear()
    vi.stubGlobal("location", { ...window.location, reload })
  })
  afterEach(() => vi.unstubAllGlobals())

  it("reloads once, then refuses for a minute", () => {
    expect(reloadForNewBuild(1_000_000)).toBe(true)
    expect(reloadForNewBuild(1_030_000)).toBe(false)
    expect(reloadForNewBuild(1_061_000)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })
})
