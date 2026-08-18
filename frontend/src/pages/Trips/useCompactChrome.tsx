import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

const CompactChromeContext = createContext(false)

/** Compact flag is for pointer-events / tests only. Layout uses `--trips-cover-t`. */
const THRESHOLD = 82
const COVER_RANGE = 96

function tripsRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".trips")
}

function syncCoverProgress(y: number) {
  const root = tripsRoot()
  if (!root) return
  const progress = Math.min(1, Math.max(0, y / COVER_RANGE))
  root.style.setProperty("--trips-cover-t", progress.toFixed(4))
}

/** Shared scroll-compact flag for chrome + cover extras.
 *  `--trips-cover-t` (0–1 over 96px) drives transform/opacity only.
 *  `--trips-cover-h` is the CSS dock slot when `.cover-dock` exists. */
export function CompactChromeProvider({ children }: { children: ReactNode }) {
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    let frame = 0
    const read = () => {
      frame = 0
      const y = window.scrollY
      syncCoverProgress(y)
      const next = y > THRESHOLD
      setCompact((prev) => (prev === next ? prev : next))
    }
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(read)
    }
    read()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
      tripsRoot()?.style.removeProperty("--trips-cover-t")
    }
  }, [])

  return <CompactChromeContext.Provider value={compact}>{children}</CompactChromeContext.Provider>
}

export function useCompactChrome(): boolean {
  return useContext(CompactChromeContext)
}

export const COMPACT_SCROLL_THRESHOLD = THRESHOLD
export const COVER_PROGRESS_RANGE = COVER_RANGE
