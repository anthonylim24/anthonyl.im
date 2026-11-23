import { useId, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { Check, Trash2 } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { Select } from "../components/Select"
import { ws } from "../workspace.stylex"
import { holdEnterWhileComposing } from "../ime"
import { formatTripDate } from "../meta"
import type { ExpenseCategory, Trip, TripPerson } from "../types"
import {
  AMOUNT_TEXT_MAX,
  CATEGORY_LABEL,
  EXPENSE_CATEGORIES,
  minorDigits,
  personLabel,
  roundMinor,
  TITLE_MAX,
  type ExpenseDraft,
  type Viewer,
} from "./budget"
import { b } from "./budget.stylex"
import { CATEGORY_ICON } from "./categoryIcon"
import { AMOUNT_HINT, CurrencySelect } from "./CostField"
import { useAmountDraft } from "./useAmountDraft"

/** The form's working copy of an expense. */
export interface ExpenseFields {
  title: string
  amount: number | undefined
  currency: string
  category: ExpenseCategory
  /** ISO date, or "" for none. */
  date: string
  /** `TripPerson.id`, or "" for not set. */
  paidBy: string
  /** Who shares it; null is everyone. */
  splitWith: string[] | null
}

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

/** Log a new expense or edit one, inline in the Spent list. */
export function ExpenseForm({
  trip,
  people,
  viewer,
  initial,
  existing,
  disabled,
  onSubmit,
  onCancel,
  onRemove,
}: {
  trip: Trip
  people: readonly TripPerson[]
  viewer: Viewer
  initial: ExpenseFields
  /** The title of the expense being edited; absent when logging a new one. */
  existing?: string
  disabled: boolean
  onSubmit: (draft: ExpenseDraft) => void
  onCancel: () => void
  onRemove?: () => void
}) {
  const id = useId()
  const [fields, setFields] = useState(initial)
  const [error, setError] = useState<"amount" | "split" | null>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const categoriesRef = useRef<HTMLDivElement>(null)
  const set = (patch: Partial<ExpenseFields>) => setFields((current) => ({ ...current, ...patch }))
  const amount = useAmountDraft(fields.amount, fields.currency, (next) => {
    set({ amount: next })
    if (next !== undefined && error === "amount") setError(null)
  })

  const dayOptions = trip.days.map((day, index) => ({
    value: day.date,
    label: `Day ${index + 1} · ${formatTripDate(day.date, trip.timezone)}`,
  }))
  if (fields.date && !dayOptions.some((option) => option.value === fields.date)) {
    dayOptions.unshift({ value: fields.date, label: formatTripDate(fields.date, trip.timezone, { year: "numeric" }) })
  }
  const ids = people.map((p) => p.id)
  const sharing = (personId: string) => fields.splitWith === null || fields.splitWith.includes(personId)

  const toggleShare = (personId: string) => {
    const current = fields.splitWith ?? ids
    const next = ids.filter((pid) => (pid === personId ? !current.includes(pid) : current.includes(pid)))
    set({ splitWith: next.length === ids.length ? null : next })
    if (next.length > 0 && error === "split") setError(null)
  }

  const onCategoryKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const count = EXPENSE_CATEGORIES.length
    const at = EXPENSE_CATEGORIES.indexOf(fields.category)
    const to =
      event.key === "Home" ? 0 : event.key === "End" ? count - 1 : STEP[event.key] ? (at + STEP[event.key] + count) % count : null
    if (to === null) return
    event.preventDefault()
    const next = EXPENSE_CATEGORIES[to]
    set({ category: next })
    categoriesRef.current?.querySelector<HTMLElement>(`[data-category="${next}"]`)?.focus()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (fields.amount === undefined) {
      setError("amount")
      amountRef.current?.focus()
      return
    }
    if (fields.splitWith !== null && fields.splitWith.length === 0) {
      setError("split")
      return
    }
    onSubmit({
      title: fields.title.trim() || CATEGORY_LABEL[fields.category],
      amount: fields.amount,
      currency: fields.currency,
      category: fields.category,
      date: fields.date || undefined,
      paidBy: fields.paidBy || undefined,
      splitWith: fields.splitWith ?? undefined,
    })
  }

  const amountError = error === "amount" || amount.bad
  return (
    <form
      {...sx(b.form, b.formCard)}
      aria-label={existing ? `Edit “${existing}”` : "Log an expense"}
      noValidate
      onSubmit={submit}
      onKeyDown={(event) => {
        holdEnterWhileComposing(event)
        if (event.key === "Escape") {
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      <label {...sx(b.span2)}>
        <span {...sx(ws.miniLabel)}>What for</span>
        <input
          value={fields.title}
          maxLength={TITLE_MAX}
          disabled={disabled}
          autoFocus
          autoComplete="off"
          placeholder="Dinner, train tickets, museum…"
          {...sx(a.field)}
          onChange={(event) => set({ title: event.target.value })}
        />
      </label>

      <div {...sx(b.span2)}>
        <label htmlFor={`${id}-amount`} {...sx(ws.miniLabel)}>
          Amount
        </label>
        <div {...sx(b.amountRow)}>
          <input
            ref={amountRef}
            id={`${id}-amount`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            maxLength={AMOUNT_TEXT_MAX}
            value={amount.text}
            disabled={disabled}
            placeholder={minorDigits(fields.currency) === 0 ? "0" : "0.00"}
            aria-invalid={amountError || undefined}
            aria-describedby={amountError ? `${id}-amount-error` : undefined}
            {...sx(a.field, b.amountInput)}
            onChange={(event) => amount.change(event.target.value)}
            onBlur={amount.blur}
          />
          <CurrencySelect
            value={fields.currency}
            label="Currency"
            disabled={disabled}
            onChange={(currency) =>
              set({ currency, amount: fields.amount === undefined ? undefined : roundMinor(fields.amount, currency) })
            }
          />
        </div>
        {amountError && (
          <p id={`${id}-amount-error`} {...sx(a.errorText)}>
            {AMOUNT_HINT}
          </p>
        )}
      </div>

      <div {...sx(b.span2)}>
        <span id={`${id}-category`} {...sx(b.groupLabel)}>
          Category
        </span>
        <div ref={categoriesRef} role="radiogroup" aria-labelledby={`${id}-category`} {...sx(b.choices)} onKeyDown={onCategoryKey}>
          {EXPENSE_CATEGORIES.map((category) => {
            const on = fields.category === category
            const Icon = CATEGORY_ICON[category]
            return (
              <button
                key={category}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                data-category={category}
                disabled={disabled}
                {...sx(a.pill, on && a.pillOn)}
                onClick={() => set({ category })}
              >
                <Icon size={15} strokeWidth={1.75} aria-hidden />
                {CATEGORY_LABEL[category]}
              </button>
            )
          })}
        </div>
      </div>

      <label>
        <span {...sx(ws.miniLabel)}>Day</span>
        <Select
          label="Day"
          value={fields.date}
          disabled={disabled}
          options={[...dayOptions, { value: "", label: "No date" }]}
          onChange={(date) => set({ date })}
        />
      </label>

      {people.length > 0 && (
        <label>
          <span {...sx(ws.miniLabel)}>Paid by</span>
          <Select
            label="Paid by"
            value={fields.paidBy}
            disabled={disabled}
            options={[
              { value: "", label: "Not set" },
              ...people.map((person) => ({ value: person.id, label: personLabel(person, viewer) })),
              ...(fields.paidBy && !ids.includes(fields.paidBy) ? [{ value: fields.paidBy, label: "Someone no longer on the trip" }] : []),
            ]}
            onChange={(paidBy) => set({ paidBy })}
          />
        </label>
      )}

      {people.length > 1 && (
        <div {...sx(b.span2)}>
          <span id={`${id}-split`} {...sx(b.groupLabel)}>
            Split between
          </span>
          <div role="group" aria-labelledby={`${id}-split`} aria-describedby={error === "split" ? `${id}-split-error` : undefined} {...sx(b.choices)}>
            {people.map((person) => {
              const on = sharing(person.id)
              return (
                <button
                  key={person.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  disabled={disabled}
                  {...sx(a.pill, on && a.pillOn)}
                  onClick={() => toggleShare(person.id)}
                >
                  {on && <Check size={14} strokeWidth={2} aria-hidden />}
                  <span {...sx(a.truncate)} style={{ maxWidth: "12rem" }}>
                    {personLabel(person, viewer)}
                  </span>
                </button>
              )
            })}
          </div>
          {error === "split" && (
            <p id={`${id}-split-error`} {...sx(a.errorText)}>
              Pick at least one person to share it.
            </p>
          )}
        </div>
      )}

      <div {...sx(b.actions)}>
        <button type="submit" disabled={disabled} {...sx(a.btn, a.btnPrimary)}>
          {existing ? "Save expense" : "Log expense"}
        </button>
        <button type="button" {...sx(a.btn, a.btnGhost)} onClick={onCancel}>
          Cancel
        </button>
        <span {...sx(a.grow)} />
        {onRemove && (
          <button type="button" disabled={disabled} {...sx(a.btn, a.btnGhost, a.btnSm)} onClick={onRemove}>
            <Trash2 size={14} strokeWidth={1.75} aria-hidden />
            Remove
          </button>
        )}
      </div>
    </form>
  )
}
