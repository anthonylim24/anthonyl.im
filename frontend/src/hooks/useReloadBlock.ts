import { useEffect } from "react"
import { setReloadBlocked } from "@/lib/serviceWorker"

/**
 * Hold off service-worker update reloads while `blocked`. Released when it
 * turns false or the component unmounts, so a pending update can land then.
 */
export function useReloadBlock(key: string, blocked: boolean): void {
  useEffect(() => {
    if (!blocked) return
    setReloadBlocked(key, true)
    return () => setReloadBlocked(key, false)
  }, [key, blocked])
}
