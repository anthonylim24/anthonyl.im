import type { KeyboardEvent } from "react"

/** Enter that only confirms an IME composition (Korean, Japanese, Chinese) must not commit or submit anything. */
export function isComposing(event: KeyboardEvent): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229
}
