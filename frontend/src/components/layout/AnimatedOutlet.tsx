import { useRef, Suspense } from 'react'
import { useOutlet, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { PageTransition } from './PageTransition'
import { useReducedMotion } from '@/hooks/useReducedMotion'

const RouteLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
)

/**
 * Animated outlet that wraps route content with enter/exit transitions.
 * Uses a ref to preserve the old outlet during exit animation.
 */
export function AnimatedOutlet() {
  const location = useLocation()
  const outlet = useOutlet()
  const reducedMotion = useReducedMotion()

  // Keep a ref to the current outlet so AnimatePresence can animate the old
  // component out while the new one enters. Without this, useOutlet() returns
  // null for the exiting route.
  const outletRef = useRef(outlet)
  // Only update the ref when the outlet is non-null (new route mounted)
  if (outlet) {
    outletRef.current = outlet
  }

  return (
    <AnimatePresence mode="wait">
      <PageTransition key={location.pathname} reducedMotion={reducedMotion}>
        <Suspense fallback={<RouteLoader />}>
          {outlet ?? outletRef.current}
        </Suspense>
      </PageTransition>
    </AnimatePresence>
  )
}
