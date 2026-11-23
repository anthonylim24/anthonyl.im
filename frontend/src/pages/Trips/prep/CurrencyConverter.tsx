import { useEffect, useId, useState } from "react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { AMOUNT_TEXT_MAX, formatAmountInput, minorDigits } from "../budget/budget"
import { CurrencySelect } from "../budget/CostField"
import { loadRates } from "../budget/rates"
import { converted, rateReference, type Side } from "./conversion"
import { prep as p } from "./prep.stylex"

type Rate = { status: "loading" } | { status: "ready"; rate: number } | { status: "none" }

/** Today's rate from `local` to `home`, from Frankfurter (cached for the session by `loadRates`). */
function useRate(local: string, home: string): Rate {
  const [answer, setAnswer] = useState<{ key: string; rate: number | null } | null>(null)
  const key = `${local}>${home}`
  useEffect(() => {
    if (local === home) return
    let live = true
    void loadRates(local, [home]).then((rates) => {
      if (live) setAnswer({ key: `${local}>${home}`, rate: rates[home] ?? null })
    })
    return () => {
      live = false
    }
  }, [local, home])
  // Picked the country's own money as "yours": one to one, and the picker stays to change it back.
  if (local === home) return { status: "ready", rate: 1 }
  if (answer?.key !== key) return { status: "loading" }
  return answer.rate === null ? { status: "none" } : { status: "ready", rate: answer.rate }
}

/**
 * Two linked amounts: the country's money and the viewer's own. Typing in
 * either fills the other at today's rate; what was typed is the one fact
 * kept, the other side is worked out from it.
 */
export function CurrencyConverter({ local, home, onHome }: { local: string; home: string; onHome: (code: string) => void }) {
  const id = useId()
  const rate = useRate(local, home)
  const [typed, setTyped] = useState<{ side: Side; text: string }>({ side: "local", text: "" })
  const ready = rate.status === "ready"
  const other = ready && typed.text.trim() ? converted(typed.text, typed.side, local, home, rate.rate) : null
  const value = (side: Side) => {
    if (typed.side === side) return typed.text
    return other === null ? "" : formatAmountInput(other, side === "local" ? local : home)
  }
  const field = (side: Side) => {
    const code = side === "local" ? local : home
    return (
      <span {...sx(p.convertField)}>
        <label htmlFor={`${id}-${side}`} {...sx(a.srOnly)}>
          {side === "local" ? `Amount in ${local}` : `Amount in ${home}, your currency`}
        </label>
        <input
          id={`${id}-${side}`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          maxLength={AMOUNT_TEXT_MAX}
          disabled={!ready}
          placeholder={minorDigits(code) === 0 ? "0" : "0.00"}
          value={value(side)}
          onChange={(event) => setTyped({ side, text: event.target.value })}
          {...sx(a.field, p.convertInput, side === "local" && p.convertCoded)}
        />
        {side === "local" && (
          <span {...sx(p.convertCode)} aria-hidden>
            {local}
          </span>
        )}
      </span>
    )
  }
  return (
    <div {...sx(p.convert)}>
      <div {...sx(p.convertRow)}>
        {field("local")}
        {/* "=" leads the second half, so a wrapped row reads as the equation's next line. */}
        <span {...sx(p.convertHome)}>
          <span aria-hidden {...sx(p.convertEquals)}>
            =
          </span>
          {field("home")}
          <CurrencySelect value={home} label="Your currency" onChange={onHome} />
        </span>
      </div>
      <p {...sx(a.small, p.convertNote)} aria-live="polite">
        {rate.status === "ready"
          ? `${rateReference(local, home, rate.rate)} at today’s rate`
          : rate.status === "loading"
            ? "Getting today’s rate…"
            : `No rate between ${local} and ${home} right now.`}
      </p>
    </div>
  )
}
