import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

const CompactChromeContext = createContext(false)

const THRESHOLD = 24
const COVER_RANGE = 96

function tripsRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".trips")
}

function syncCoverVars(y: number) {
  const root = tripsRoot()
  if (!root) return
  const progress = Math.min(1, Math.max(0, y / COVER_RANGE))
  root.style.setProperty("--trips-cover-t", progress.toFixed(4))
  const compact = y > THRESHOLD
  const cover = root.querySelector<HTMLElement>(".cover-band")
  const coverH = compact && cover ? `${Math.round(cover.getBoundingClientRect().height)}px` : "0px"
  root.style.setProperty("--trips-cover-h", coverH)
}

/** Shared scroll-compact flag for chrome + cover band.
 *  `--trips-cover-t` (0–1 over 96px) drives transform/opacity only.
 *  `--trips-cover-h` is the measured sticky cover so the snap rail clears it. */
export function CompactChromeProvider({ children }: { children: ReactNode }) {
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    let frame = 0
    const read = () => {
      frame = 0
      const y = window.scrollY
      syncCoverVars(y)
      const next = y > THRESHOLD
      setCompact((prev) => (prev === next ? prev : next))
    }
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(read)
    }
    read()
    window.addEventListener("scroll", onScroll, { passive: true })
    const cover = tripsRoot()?.querySelector(".cover-band")
    const ro =
      cover && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => read()) : null
    if (cover && ro) ro.observe(cover)
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
      ro?.disconnect()
    }
  }, [])

  return <CompactChromeContext.Provider value={compact}>{children}</CompactChromeContext.Provider>
}

export function useCompactChrome(): boolean {
  return useContext(CompactChromeContext)
}

export const COMPACT_SCROLL_THRESHOLD = THRESHOLD
export const COVER_PROGRESS_RANGE = COVER_RANGE
