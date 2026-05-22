// Shared scroll-reveal helpers for the Korea route.
//
// We render the initial CSS state on the server-friendly path (opacity 0,
// slight translate) and then mark the element as "revealed" via an
// IntersectionObserver when it crosses ~30% of the viewport. CSS transitions
// + project-standard spring-like easing (cubic-bezier(0.16, 1, 0.3, 1))
// take it home.
//
// One observer is shared across all consumers per page to keep the
// per-element overhead minimal — important when day cards or timeline
// items number in the dozens.

import { useRef } from "react"

let sharedObserver: IntersectionObserver | null = null

function getObserver(): IntersectionObserver {
  if (sharedObserver) return sharedObserver
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
    return {
      observe: (el: Element) => (el as HTMLElement).setAttribute("data-revealed", "true"),
      unobserve: () => {},
      disconnect: () => {},
    } as unknown as IntersectionObserver
  }
  sharedObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const el = entry.target as HTMLElement
          el.setAttribute("data-revealed", "true")
          sharedObserver?.unobserve(el)
        }
      }
    },
    {
      rootMargin: "0px 0px -25% 0px",
      threshold: 0.01,
    },
  )
  return sharedObserver
}

export function useScrollReveal<T extends HTMLElement = HTMLElement>(): (node: T | null) => void {
  const refStore = useRef<T | null>(null)
  return (node: T | null) => {
    if (refStore.current && refStore.current !== node) {
      try {
        getObserver().unobserve(refStore.current)
      } catch {
        // ignore
      }
    }
    refStore.current = node
    if (!node) return
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      node.setAttribute("data-revealed", "true")
      return
    }
    getObserver().observe(node)
  }
}

export function disposeScrollReveal() {
  sharedObserver?.disconnect()
  sharedObserver = null
}

export const REVEAL_CLASSES =
  "opacity-0 translate-y-4 scale-[0.985] " +
  "transition-[opacity,transform] duration-[700ms] ease-[cubic-bezier(0.16,1,0.3,1)] " +
  "data-[revealed=true]:opacity-100 data-[revealed=true]:translate-y-0 data-[revealed=true]:scale-100 " +
  "motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0 motion-reduce:scale-100"
