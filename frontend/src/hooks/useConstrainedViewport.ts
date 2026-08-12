import { useEffect, useState } from 'react'
import { isConstrainedSessionViewport } from '@/lib/breathworkViewport'

export function useConstrainedViewport(): boolean {
  const [constrained, setConstrained] = useState(() => isConstrainedSessionViewport())

  useEffect(() => {
    const update = () => setConstrained(isConstrainedSessionViewport())
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return constrained
}
