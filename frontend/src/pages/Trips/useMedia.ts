import { useEffect, useState } from "react"

/** Whether a media query matches, following changes; `fallback` where there is no `matchMedia`. */
export function useMedia(query: string, fallback = false): boolean {
  const [matches, setMatches] = useState(() => (typeof window === "undefined" || !window.matchMedia ? fallback : window.matchMedia(query).matches))
  useEffect(() => {
    if (!window.matchMedia) return
    const media = window.matchMedia(query)
    const sync = () => setMatches(media.matches)
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [query])
  return matches
}
