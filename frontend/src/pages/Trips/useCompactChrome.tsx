import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

const CompactChromeContext = createContext(false)

const THRESHOLD = 24
const COVER_RANGE = 96

function applyCoverProgress(y: number) {
  const progress = Math.min(1, Math.max(0, y / COVER_RANGE))
  document.querySelector<HTMLElement>(".trips")?.style.setProperty("--trips-cover-t", progress.toFixed(4))
}

/** Shared scroll-compact flag for chrome + cover band.
 *  `--trips-cover-t` (0–1 over 96px) drives transform/opacity only. */
export function CompactChromeProvider({ children }: { children: ReactNode }) {
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    let frame = 0
    const read = () => {
      frame = 0
      const y = window.scrollY
      applyCoverProgress(y)
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
    }
  }, [])

  return <CompactChromeContext.Provider value={compact}>{children}</CompactChromeContext.Provider>
}

export function useCompactChrome(): boolean {
  return useContext(CompactChromeContext)
}

export const COMPACT_SCROLL_THRESHOLD = THRESHOLD
export const COVER_PROGRESS_RANGE = COVER_RANGE
