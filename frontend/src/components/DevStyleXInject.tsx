import { useEffect } from 'react'

/** Loads StyleX dev CSS + HMR runtime when Vite entry is a TS module. */
export function DevStyleXInject() {
  useEffect(() => {
    if (import.meta.env.DEV) {
      void import('virtual:stylex:css-only')
    }
  }, [])

  if (!import.meta.env.DEV) return null

  return <link rel="stylesheet" href="/virtual:stylex.css" />
}
