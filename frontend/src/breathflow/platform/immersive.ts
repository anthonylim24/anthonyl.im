import { createContext, useContext, useEffect } from 'react'

/**
 * The fullscreen session covers the layout's header, navs and skip link.
 * While it is up those must leave the tab order and the accessibility tree
 * (`inert`), or keyboard and screen-reader users land on links they cannot
 * see. The layout provides the setter; the session page claims it.
 */
export const ImmersiveContext = createContext<(immersive: boolean) => void>(() => {})

export function useImmersive(immersive: boolean): void {
  const setImmersive = useContext(ImmersiveContext)
  useEffect(() => {
    setImmersive(immersive)
    return () => setImmersive(false)
  }, [immersive, setImmersive])
}
