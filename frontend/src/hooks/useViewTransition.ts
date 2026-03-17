import { useCallback } from 'react'
import { useNavigate, type NavigateOptions, type To } from 'react-router-dom'

/**
 * Wraps react-router navigate() with the View Transitions API when available.
 * Falls back to regular navigation (Firefox, older browsers get AnimatePresence transitions).
 */
export function useViewTransitionNavigate() {
  const navigate = useNavigate()

  const vtNavigate = useCallback(
    (to: To, options?: NavigateOptions) => {
      if (
        typeof document !== 'undefined' &&
        'startViewTransition' in document &&
        typeof (document as any).startViewTransition === 'function'
      ) {
        ;(document as any).startViewTransition(() => {
          navigate(to, options)
        })
      } else {
        navigate(to, options)
      }
    },
    [navigate],
  )

  return vtNavigate
}
