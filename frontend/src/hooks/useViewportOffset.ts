import { useEffect, useState } from 'react'

function readViewportBottomOffset() {
  if (typeof window === 'undefined' || !window.visualViewport) {
    return 0
  }

  const viewport = window.visualViewport
  const offset = window.innerHeight - (viewport.height + viewport.offsetTop)
  return Math.max(0, Math.round(offset))
}

export function useViewportOffset() {
  const [bottomOffset, setBottomOffset] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    let frameId = 0

    const update = () => {
      if (frameId) {
        cancelAnimationFrame(frameId)
      }

      frameId = requestAnimationFrame(() => {
        setBottomOffset((prev) => {
          const next = readViewportBottomOffset()
          return prev === next ? prev : next
        })
      })
    }

    update()

    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId)
      }
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [])

  return { bottomOffset }
}
