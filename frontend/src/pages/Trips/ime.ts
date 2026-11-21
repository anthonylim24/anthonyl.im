import type { KeyboardEvent } from "react"

// Typing Korean, Japanese or Chinese goes through an input method: Enter
// confirms the word being composed, not the field. Chrome flags that key
// with `isComposing`; Safari sends it after the composition has ended, with
// keyCode 229 and `isComposing` false, so both are checked.

/** True when this key belongs to an input method's composition. */
export function composing(event: KeyboardEvent): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229
}

/** A form's `onKeyDown`: the Enter that confirms a composed word must not also submit the form. */
export function holdEnterWhileComposing(event: KeyboardEvent): void {
  if (event.key === "Enter" && composing(event)) event.preventDefault()
}
