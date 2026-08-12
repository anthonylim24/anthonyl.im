/** Editor-local vocabulary. Class strings general enough for the read pages
 *  live in `../ui`; what remains here is editor data. */

import type { ItemStatus } from "../types"

export interface DayOption {
  id: string
  label: string
}

export const STATUS_OPTIONS: Array<{ value: ItemStatus; label: string }> = [
  { value: "none", label: "No status" },
  { value: "optional", label: "Optional" },
  { value: "booked", label: "Booked" },
  { value: "completed", label: "Completed" },
  { value: "needs_review", label: "Needs review" },
]
