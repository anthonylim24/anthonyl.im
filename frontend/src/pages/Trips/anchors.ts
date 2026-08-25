/** Deep-linked items: the overview links to `…/day/{dayId}#item-{itemId}`, and
 *  the editor flashes items an applied suggestion touched. Both arrivals get
 *  the same marker, so they read as one product behaviour. */

import { useEffect, useState } from "react"
import { useLocation } from "react-router-dom"
import { useReducedMotion } from "motion/react"
import { styles } from "./trips.stylex"

/** `#item-…` fragment to element id. Malformed escapes fall back to the raw
 *  fragment rather than throwing. */
export function anchorIdFrom(hash: string): string | null {
  if (!hash.startsWith("#item-")) return null
  const raw = hash.slice(1)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/**
 * Receiving half of the overview's `#item-{id}` links: once the page has
 * rendered, bring the targeted element into view and report its id. Re-runs on
 * router navigation and on a plain `hashchange`.
 */
export function useAnchorTarget(ready: boolean): string | null {
  const { hash, pathname } = useLocation()
  const reduce = useReducedMotion()
  const [target, setTarget] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return
    const locate = () => {
      const id = anchorIdFrom(window.location.hash)
      const el = id ? document.getElementById(id) : null
      if (!el || !id) {
        setTarget(null)
        return
      }
      el.scrollIntoView(reduce ? { block: "center" } : { behavior: "smooth", block: "center" })
      setTarget(id)
    }
    locate()
    window.addEventListener("hashchange", locate)
    return () => window.removeEventListener("hashchange", locate)
  }, [ready, hash, pathname, reduce])

  return target
}

type AnchorHighlight = false | readonly [string, typeof styles.anchorRing] | readonly [string, string, typeof styles.anchorRing]

/** Arrival marker: a one-shot accent fade plus a persistent ring, or the ring
 *  alone when motion is reduced. */
export function useAnchorHighlight(active: boolean): AnchorHighlight {
  const reduce = useReducedMotion()
  if (!active) return false
  return reduce
    ? ["anchor-ring", styles.anchorRing]
    : ["trip-flash", "anchor-ring", styles.anchorRing]
}
