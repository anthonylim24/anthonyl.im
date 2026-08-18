import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

const CompactChromeContext = createContext(false)

const THRESHOLD = 24

/** Shared scroll-compact flag for chrome + cover band. */
export function CompactChromeProvider({ children }: { children: ReactNode }) {
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    let frame = 0
    const read = () => {
      frame = 0
      setCompact(window.scrollY > THRESHOLD)
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
