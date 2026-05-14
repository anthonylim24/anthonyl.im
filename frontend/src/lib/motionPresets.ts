import { useMemo } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'

const deceleration = [0.33, 0, 0, 1] as const
const outExpo = [0.16, 1, 0.3, 1] as const

export const entranceTransition = {
  type: 'tween' as const,
  duration: 0.6,
  ease: deceleration,
}

// Replaces the legacy `springTransition`. Spring physics are out per the
// interface-design system (apothecary's notebook — calibrated, no bounce).
// Use this tween wherever a snappier confirmation motion is needed.
export const springTransition = {
  type: 'tween' as const,
  duration: 0.24,
  ease: outExpo,
}

export const reducedMotionTransition = {
  type: 'tween' as const,
  duration: 0.01,
  ease: deceleration,
}

interface EntranceMotionOptions {
  offset?: number
  staggerChildren?: number
  delayChildren?: number
}

export function createEntranceMotion(
  reducedMotion: boolean,
  {
    offset = 8,
    staggerChildren = 0.08,
    delayChildren = 0,
  }: EntranceMotionOptions = {}
) {
  const transition = reducedMotion ? reducedMotionTransition : entranceTransition
  const spring = reducedMotion ? reducedMotionTransition : springTransition

  return {
    reducedMotion,
    transition,
    spring,
    stagger: {
      hidden: {},
      show: {
        transition: reducedMotion
          ? { staggerChildren: 0, delayChildren: 0 }
          : { staggerChildren, delayChildren },
      },
    },
    fadeUp: reducedMotion
      ? {
          hidden: { opacity: 0 },
          show: { opacity: 1, transition },
        }
      : {
          hidden: { opacity: 0, y: offset },
          show: { opacity: 1, y: 0, transition },
        },
    tap: (scale: number) => (reducedMotion ? undefined : { scale }),
    hoverOpacity: (opacity = 0.8) => (reducedMotion ? undefined : { opacity }),
  }
}

export function useEntranceMotion(options?: EntranceMotionOptions) {
  const reducedMotion = useReducedMotion()
  const offset = options?.offset
  const staggerChildren = options?.staggerChildren
  const delayChildren = options?.delayChildren

  return useMemo(
    () => createEntranceMotion(reducedMotion, { offset, staggerChildren, delayChildren }),
    [delayChildren, offset, reducedMotion, staggerChildren]
  )
}
