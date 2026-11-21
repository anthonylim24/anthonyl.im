import { useId, useState } from "react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { ws } from "../workspace.stylex"
import type { Money } from "../types"
import { currencyChoices, minorDigits, roundMinor } from "./budget"
import { b } from "./budget.stylex"
import { useAmountDraft } from "./useAmountDraft"

export const AMOUNT_HINT = "Enter an amount, like 12.50"

/** A currency picker: code and name in the list, the code where space is short. */
export function CurrencySelect({
  value,
  label,
  disabled,
  id,
  onChange,
}: {
  value: string
  label: string
  disabled?: boolean
  id?: string
  onChange: (currency: string) => void
}) {
  return (
    <select
      id={id}
      aria-label={label}
      value={value}
      disabled={disabled}
      {...sx(a.field, b.currency)}
      onChange={(event) => onChange(event.target.value)}
    >
      {currencyChoices(value).map((choice) => (
        <option key={choice.code} value={choice.code}>
          {choice.name === choice.code ? choice.code : `${choice.code} · ${choice.name}`}
        </option>
      ))}
    </select>
  )
}

/**
 * What a stop costs: an amount typed the way people write it ("1,200.50",
 * "1200,5") and its currency. Clearing the amount reports `undefined`.
 */
export function CostField({
  value,
  defaultCurrency,
  disabled,
  onChange,
  id,
  label = "Cost",
}: {
  value?: Money
  defaultCurrency: string
  disabled?: boolean
  onChange: (next?: Money) => void
  id?: string
  label?: string
}) {
  const ownId = useId()
  const fieldId = id ?? ownId
  const errorId = `${fieldId}-error`
  // The currency to use while there is no amount (a cost needs both).
  const [picked, setPicked] = useState(value?.currency ?? defaultCurrency)
  if (value && value.currency !== picked) setPicked(value.currency)
  const currency = value?.currency ?? picked
  const draft = useAmountDraft(value?.amount, currency, (amount) => onChange(amount === undefined ? undefined : { amount, currency }))

  return (
    <div>
      <label htmlFor={fieldId} {...sx(ws.miniLabel)}>
        {label}
      </label>
      <div {...sx(b.amountRow)}>
        <input
          id={fieldId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={draft.text}
          disabled={disabled}
          placeholder={minorDigits(currency) === 0 ? "0" : "0.00"}
          aria-invalid={draft.bad || undefined}
          aria-describedby={draft.bad ? errorId : undefined}
          {...sx(a.field, b.amountInput)}
          onChange={(event) => draft.change(event.target.value)}
          onBlur={draft.blur}
        />
        <CurrencySelect
          value={currency}
          label={`${label} currency`}
          disabled={disabled}
          onChange={(next) => {
            setPicked(next)
            if (value) onChange({ amount: roundMinor(value.amount, next), currency: next })
          }}
        />
      </div>
      {draft.bad && (
        <p id={errorId} {...sx(a.errorText)}>
          {AMOUNT_HINT}
        </p>
      )}
    </div>
  )
}
