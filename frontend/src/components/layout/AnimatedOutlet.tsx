import { Suspense } from 'react'
import { useOutlet, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { PageTransition } from './PageTransition'
import { useReducedMotion } from '@/hooks/useReducedMotion'

const RouteLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
)

/** Animated outlet that wraps route content with enter/exit transitions. */
export function AnimatedOutlet() {
  const location = useLocation()
  const outlet = useOutlet()
  const reducedMotion = useReducedMotion()

  return (
    <AnimatePresence mode="wait">
      <PageTransition key={location.pathname} reducedMotion={reducedMotion}>
        <Suspense fallback={<RouteLoader />}>
          {outlet}
        </Suspense>
      </PageTransition>
    </AnimatePresence>
  )
}
