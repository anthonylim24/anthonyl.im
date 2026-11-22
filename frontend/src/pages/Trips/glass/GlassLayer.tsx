import { useEffect, useRef, useState } from "react"
import { ACCENT_FILL, resolveAccent } from "../meta"
import { startLight } from "./light"
import { wallPalette } from "./palette"
import { startRefraction } from "./refraction"
import { paintWallpaper } from "./wallpaper"

// Everything the Liquid Glass look runs: the wallpaper the glass sits on, the
// refraction engine (Chromium) and the light. A lazy chunk, mounted only while
// the look is on, so the atlas never downloads or runs any of it.

/** The brand orange when no trip is on screen; `--ta-fill`'s default. */
const BRAND_FILL = "#f0582b"
/** The wallpaper is soft, so it is painted small and stretched. */
const WALL_SCALE = 0.5
const WALL_MAX = 1280

interface Wall {
  accent: string
  dark: boolean
  /** Size class: the painted size, so small resizes keep the still. */
  width: number
  height: number
}

const sameWall = (a: Wall, b: Wall) => a.accent === b.accent && a.dark === b.dark && a.width === b.width && a.height === b.height

/** The painted size for a viewport, in 64 px steps of the painted image. */
function wallSize(): { width: number; height: number } {
  const scale = Math.min(WALL_SCALE, WALL_MAX / Math.max(window.innerWidth, 1))
  const step = (v: number) => Math.max(64, Math.round((v * scale) / 64) * 64)
  return { width: step(window.innerWidth), height: step(window.innerHeight) }
}

/** The accent the page is showing: the trip open in the workspace, or the next trip on the index. */
function readAccent(): string {
  const host = document.querySelector<HTMLElement>("#trips-main [data-trip-accent]")
  return host ? ACCENT_FILL[resolveAccent(host.dataset.tripAccent)] : BRAND_FILL
}

const readWall = (): Wall => ({ accent: readAccent(), dark: document.documentElement.classList.contains("dark"), ...wallSize() })

/** Follows the accent, theme and size class; re-reads at most once a frame. */
function useWall(): Wall {
  const [wall, setWall] = useState<Wall>(readWall)
  useEffect(() => {
    let frame = 0
    const read = () => {
      frame = 0
      const next = readWall()
      setWall((prev) => (sameWall(prev, next) ? prev : next))
    }
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(read)
    }
    const root = document.querySelector(".trips:not(.trips-portal)") ?? document.body
    const page = new MutationObserver(queue)
    page.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-trip-accent"] })
    const theme = new MutationObserver(queue)
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    window.addEventListener("resize", queue)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      page.disconnect()
      theme.disconnect()
      window.removeEventListener("resize", queue)
    }
  }, [])
  return wall
}

/** A still of the wallpaper for `wall`, or null until painted (the CSS gradient shows meanwhile). */
function useWallpaper(wall: Wall): string | null {
  const [url, setUrl] = useState<string | null>(null)
  const current = useRef<string | null>(null)
  useEffect(() => {
    let live = true
    const seed = parseInt(wall.accent.slice(1, 4), 16) / 97
    const paint = () =>
      paintWallpaper({ width: wall.width, height: wall.height, palette: wallPalette(wall.accent, wall.dark), seed }).then(
        (next) => {
          if (!live) {
            if (next) URL.revokeObjectURL(next)
            return
          }
          if (current.current) URL.revokeObjectURL(current.current)
          current.current = next
          setUrl(next)
        },
        // No WebGL2, or the context was refused: the gradient stays.
        () => {},
      )
    // Paint when the page is idle: the gradient holds until then, and a trip
    // that loads its accent a moment later costs one paint, not two.
    const hasIdle = "requestIdleCallback" in window
    const idle = hasIdle
      ? window.requestIdleCallback(paint, { timeout: 1500 })
      : window.setTimeout(paint, 300)
    return () => {
      live = false
      if (hasIdle) window.cancelIdleCallback(idle)
      else window.clearTimeout(idle)
    }
  }, [wall])
  useEffect(
    () => () => {
      if (current.current) URL.revokeObjectURL(current.current)
    },
    [],
  )
  return url
}

/**
 * Starts an engine once the page is idle after its first paint, so a trip's
 * first frames never wait on observers or lens maps; the frosted material
 * and the resting light hold until then.
 */
function useIdleStart(start: () => () => void) {
  useEffect(() => {
    let dispose: (() => void) | null = null
    const run = () => {
      dispose = start()
    }
    const hasIdle = "requestIdleCallback" in window
    const handle = hasIdle ? window.requestIdleCallback(run, { timeout: 2000 }) : window.setTimeout(run, 300)
    return () => {
      if (dispose) dispose()
      else if (hasIdle) window.cancelIdleCallback(handle)
      else window.clearTimeout(handle)
    }
  }, [start])
}

export default function GlassLayer() {
  useIdleStart(startRefraction)
  useIdleStart(startLight)
  const url = useWallpaper(useWall())
  return (
    <div className="trips-glass-wallpaper" aria-hidden>
      {url && <img className="trips-glass-wallpaper-still" src={url} alt="" decoding="async" />}
    </div>
  )
}
