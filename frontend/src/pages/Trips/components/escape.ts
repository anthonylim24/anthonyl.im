import { useEffect, type RefObject } from "react"

/**
 * While `open`, Escape pressed inside `area` belongs to the popup there. A
 * Radix dialog or sheet takes Escape on the document in the capture phase,
 * before React sees it, and would close over a popup that is still open.
 * Claiming the key on window first leaves the dialog open and the key to the popup.
 */
export function useClaimEscape(open: boolean, area: RefObject<Element | null>) {
  useEffect(() => {
    if (!open) return
    const claim = (event: KeyboardEvent) => {
      if (event.key === "Escape" && event.target instanceof Node && area.current?.contains(event.target)) event.preventDefault()
    }
    window.addEventListener("keydown", claim, true)
    return () => window.removeEventListener("keydown", claim, true)
  }, [open, area])
}
