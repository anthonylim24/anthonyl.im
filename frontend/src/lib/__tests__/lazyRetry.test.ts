import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createElement, Suspense, type ReactElement } from "react"
import { render, screen } from "@testing-library/react"
import { importWithRetry, isChunkLoadError, lazyRetry, reloadForNewBuild } from "../lazyRetry"

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

  it("fails a stalled import at the deadline, as a chunk error, without asking again", async () => {
    vi.useFakeTimers()
    try {
      const load = vi.fn(() => new Promise<never>(() => {}))
      const result = importWithRetry(load, 0, 5_000)
      const caught = result.catch((error: unknown) => error)
      await vi.advanceTimersByTimeAsync(5_000)
      const error = await caught
      expect(isChunkLoadError(error)).toBe(true)
      expect(String(error)).toMatch(/timed out after 5 s/)
      expect(load).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
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

describe("lazyRetry preload", () => {
  type Module = { default: () => ReactElement }

  it("starts the import once, and the render reuses it", async () => {
    const load = vi.fn((): Promise<Module> => Promise.resolve({ default: () => createElement("p", null, "Trips index") }))
    const Page = lazyRetry(load)
    Page.preload()
    Page.preload()
    expect(load).toHaveBeenCalledTimes(1)
    render(createElement(Suspense, { fallback: null }, createElement(Page)))
    expect(await screen.findByText("Trips index")).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("forgets a failed preload, so the render tries again", async () => {
    const load = vi
      .fn<() => Promise<Module>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({ default: () => createElement("p", null, "Loaded") })
    const Page = lazyRetry(load)
    Page.preload()
    await new Promise((resolve) => setTimeout(resolve, 0))
    render(createElement(Suspense, { fallback: null }, createElement(Page)))
    expect(await screen.findByText("Loaded")).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(2)
  })
})
