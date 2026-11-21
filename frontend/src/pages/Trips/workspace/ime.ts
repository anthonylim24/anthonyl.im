import type { KeyboardEvent } from "react"

/**
 * An input method (Korean, Japanese, Chinese) is composing: Enter commits the
 * syllable and the arrows pick a candidate, so neither is ours to act on.
 * Safari ends composition before the keydown of that Enter, but still reports
 * keyCode 229 for it.
 */
export function composing(event: KeyboardEvent): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229
}
