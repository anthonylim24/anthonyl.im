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

import { useRef } from 'react'
import * as stylex from '@stylexjs/stylex'

let sharedObserver: IntersectionObserver | null = null

function getObserver(): IntersectionObserver {
  if (sharedObserver) return sharedObserver
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
    return {
      observe: (el: Element) => (el as HTMLElement).setAttribute('data-revealed', 'true'),
      unobserve: () => {},
      disconnect: () => {},
    } as unknown as IntersectionObserver
  }
  sharedObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const el = entry.target as HTMLElement
          el.setAttribute('data-revealed', 'true')
          sharedObserver?.unobserve(el)
        }
      }
    },
    {
      rootMargin: '0px 0px -25% 0px',
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
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      node.setAttribute('data-revealed', 'true')
      return
    }
    getObserver().observe(node)
  }
}

export function disposeScrollReveal() {
  sharedObserver?.disconnect()
  sharedObserver = null
}

/** Semantic class for scroll-reveal (transitions live in index.css). */
export const REVEAL_CLASSES = 'korea-scroll-reveal'

export const revealStyles = stylex.create({
  base: {
    opacity: 0,
    transform: 'translateY(1rem) scale(0.985)',
    transitionProperty: 'opacity, transform',
    transitionDuration: '700ms',
    transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
  },
})
