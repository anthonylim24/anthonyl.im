import { useState } from "react"
import { formatAmountInput, parseAmount } from "./budget"

export interface AmountDraft {
  /** What the field shows: exactly what was typed until it is tidied on blur. */
  text: string
  /** The text isn't an amount (shown after the field loses focus). */
  bad: boolean
  change: (text: string) => void
  blur: () => void
}

/**
 * The text behind an amount field. Every keystroke that changes the amount
 * reports it (cleared or unreadable text reports `undefined`, so what is
 * stored never disagrees with the field); the text is tidied ("1200,5" →
 * "1,200.50") only on blur, so "1200." survives mid-typing. A new value from
 * outside (Undo, another editor) replaces the text, unless it is just the
 * echo of what was typed.
 */
export function useAmountDraft(
  value: number | undefined,
  currency: string,
  onChange: (next: number | undefined) => void,
): AmountDraft {
  const [text, setText] = useState(() => (value === undefined ? "" : formatAmountInput(value, currency)))
  const [bad, setBad] = useState(false)
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    if ((parseAmount(text, currency) ?? undefined) !== value) {
      setText(value === undefined ? "" : formatAmountInput(value, currency))
      setBad(false)
    }
  }
  return {
    text,
    bad,
    change(next) {
      setText(next)
      setBad(false)
      const parsed = parseAmount(next, currency) ?? undefined
      if (parsed !== value) onChange(parsed)
    },
    blur() {
      if (!text.trim()) return
      const parsed = parseAmount(text, currency)
      if (parsed === null) {
        setBad(true)
        return
      }
      setText(formatAmountInput(parsed, currency))
    },
  }
}
