import { RotateCw, X } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { banner as s } from "./offline.stylex"

// The line under the Trips header that says when what's on screen is a
// copy kept on this device, and when edits on a trip just left didn't
// reach the server. Always in the page, so screen readers hear it appear.

export interface OfflineBannerProps {
  /** From `copyBannerText`. */
  copy: string | null
  /** From `leftUnsavedText`. */
  left: string | null
  onRetry: () => void
  onDismissLeft: () => void
}

export function OfflineBanner({ copy, left, onRetry, onDismissLeft }: OfflineBannerProps) {
  return (
    <div role="status" aria-live="polite">
      {copy && (
        <div {...sx(s.root)}>
          <p {...sx(s.text)}>{copy}</p>
          <div {...sx(s.actions, "trip-tap-44")}>
            <button type="button" {...sx(a.btn, a.btnSecondary, a.btnSm)} onClick={onRetry}>
              <RotateCw size={14} strokeWidth={1.75} aria-hidden />
              Try again
            </button>
          </div>
        </div>
      )}
      {left && (
        <div {...sx(s.root)}>
          <p {...sx(s.text)}>{left}</p>
          <div {...sx(s.actions, "trip-tap-44")}>
            <button type="button" {...sx(a.iconBtn, a.iconBtnSm)} onClick={onDismissLeft} aria-label="Dismiss this message">
              <X size={16} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
