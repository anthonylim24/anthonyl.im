import { useId, useState, type ReactNode } from "react"
import { Trash2 } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { ws } from "../workspace.stylex"
import type { TripBudget } from "../types"
import { formatMoney, minorDigits, parseAmount, roundMinor, type BudgetSummary } from "./budget"
import { b } from "./budget.stylex"
import { AMOUNT_HINT, CurrencySelect } from "./CostField"
import { useAmountDraft } from "./useAmountDraft"

/**
 * The top of the budget tab: the budget as a display figure over one meter
 * (spent in ink, planned-but-unspent hatched), and what is left or over.
 * Without a budget, what has been spent and planned so far.
 */
export function BudgetHead({
  summary,
  budget,
  editable,
  locked,
  editing,
  notice,
  onEditing,
  onSave,
  onRemove,
}: {
  summary: BudgetSummary
  budget: TripBudget | undefined
  editable: boolean
  locked: boolean
  /** The set / change form is open. */
  editing: boolean
  /** An Undo row, shown under the head. */
  notice?: ReactNode
  onEditing: (open: boolean) => void
  onSave: (budget: TripBudget) => void
  onRemove: () => void
}) {
  const titleId = useId()
  const { currency, total, spent, outstanding, remaining } = summary
  const money = (amount: number) => formatMoney(amount, currency)

  if (editing && editable) {
    return (
      <section aria-labelledby={titleId} {...sx(b.section)}>
        <div {...sx(b.head)}>
          <h2 id={titleId} {...sx(a.eyebrow)}>
            {budget?.total !== undefined ? "Change the budget" : "Set a budget"}
          </h2>
          <BudgetForm
            budget={budget}
            currency={currency}
            disabled={locked}
            onSave={onSave}
            onCancel={() => onEditing(false)}
            onRemove={budget ? onRemove : undefined}
          />
        </div>
        {notice}
      </section>
    )
  }

  const change = editable && (
    <button
      type="button"
      {...sx(a.btn, a.btnGhost, a.btnSm)}
      disabled={locked}
      aria-label={total !== undefined ? "Change budget" : undefined}
      onClick={() => onEditing(true)}
    >
      {total !== undefined ? "Change" : "Set a budget"}
    </button>
  )

  if (total === undefined) {
    return (
      <section aria-labelledby={titleId} {...sx(b.section)}>
        <div {...sx(b.head)}>
          <div {...sx(a.between)}>
            <h2 id={titleId} {...sx(a.eyebrow)}>
              Costs in {currency}
            </h2>
            {change}
          </div>
          <dl {...sx(b.stats)} style={{ margin: 0 }}>
            <div {...sx(b.stat)}>
              <dt {...sx(a.eyebrow)}>Spent so far</dt>
              <dd {...sx(b.statFigure)} style={{ margin: 0 }}>
                {money(spent)}
              </dd>
            </div>
            <div {...sx(b.stat)}>
              <dt {...sx(a.eyebrow)}>Still planned</dt>
              <dd {...sx(b.statFigure, outstanding === 0 && a.muted)} style={{ margin: 0 }}>
                {money(outstanding)}
              </dd>
            </div>
          </dl>
        </div>
        {notice}
      </section>
    )
  }

  const committed = spent + outstanding
  const scale = Math.max(total, committed)
  const share = (amount: number) => (scale > 0 ? `${(amount / scale) * 100}%` : "0%")
  const over = remaining !== undefined && remaining < 0
  const standing = over ? `${money(-(remaining ?? 0))} over` : `${money(remaining ?? 0)} left`
  return (
    <section aria-labelledby={titleId} {...sx(b.section)}>
      <div {...sx(b.head)}>
        <div {...sx(a.between)}>
          <h2 id={titleId} {...sx(a.eyebrow)}>
            Budget
          </h2>
          {change}
        </div>
        <p {...sx(b.figureRow)} style={{ margin: 0 }}>
          <span {...sx(b.figure)}>{money(total)}</span>
          <span {...sx(a.mono, a.muted)}>{currency}</span>
        </p>
        <div
          role="meter"
          aria-label="Budget used"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.min(committed, total)}
          aria-valuetext={`${money(spent)} spent and ${money(outstanding)} planned of ${money(total)}: ${standing}`}
          {...sx(b.meter)}
        >
          <div {...sx(b.track)}>
            <span {...sx(b.spentFill)} style={{ width: share(spent) }} />
            <span {...sx(b.plannedFill)} style={{ width: share(outstanding) }} />
          </div>
          {over && <span {...sx(b.limit)} style={{ left: share(total) }} />}
        </div>
        <div {...sx(b.legend)}>
          <span {...sx(b.key)}>
            <span {...sx(b.swatch, b.swatchSpent)} aria-hidden />
            Spent {money(spent)}
          </span>
          <span {...sx(b.key)}>
            <span {...sx(b.swatch, b.swatchPlanned)} aria-hidden />
            Planned {money(outstanding)}
          </span>
          <span {...sx(b.left, over && b.over)}>{standing}</span>
        </div>
      </div>
      {notice}
    </section>
  )
}

function BudgetForm({
  budget,
  currency: shownIn,
  disabled,
  onSave,
  onCancel,
  onRemove,
}: {
  budget: TripBudget | undefined
  currency: string
  disabled: boolean
  onSave: (budget: TripBudget) => void
  onCancel: () => void
  onRemove?: () => void
}) {
  const id = useId()
  const [currency, setCurrency] = useState(budget?.currency ?? shownIn)
  const [amount, setAmount] = useState(budget?.total)
  const [tried, setTried] = useState(false)
  const draft = useAmountDraft(amount, currency, setAmount)
  const unreadable = draft.text.trim() !== "" && parseAmount(draft.text, currency) === null
  const invalid = draft.bad || (tried && unreadable)

  return (
    <form
      {...sx(b.form)}
      aria-labelledby={`${id}-amount-label`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        setTried(true)
        if (unreadable) return
        onSave({ currency, ...(amount !== undefined ? { total: roundMinor(amount, currency) } : {}) })
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      <div {...sx(b.span2)}>
        <label id={`${id}-amount-label`} htmlFor={`${id}-amount`} {...sx(ws.miniLabel)}>
          Budget for the whole trip
        </label>
        <div {...sx(b.amountRow)}>
          <input
            id={`${id}-amount`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            value={draft.text}
            disabled={disabled}
            placeholder={minorDigits(currency) === 0 ? "2,000,000" : "2,000"}
            aria-invalid={invalid || undefined}
            aria-describedby={`${id}-hint`}
            {...sx(a.field, b.amountInput)}
            onChange={(event) => draft.change(event.target.value)}
            onBlur={draft.blur}
          />
          <CurrencySelect value={currency} label="Budget currency" disabled={disabled} onChange={setCurrency} />
        </div>
        <p id={`${id}-hint`} {...sx(invalid ? a.errorText : a.hint)}>
          {invalid ? AMOUNT_HINT : "Every total on the trip is shown in this currency. Leave the amount empty for no limit."}
        </p>
      </div>
      <div {...sx(b.actions)}>
        <button type="submit" disabled={disabled} {...sx(a.btn, a.btnPrimary)}>
          Save budget
        </button>
        <button type="button" {...sx(a.btn, a.btnGhost)} onClick={onCancel}>
          Cancel
        </button>
        <span {...sx(a.grow)} />
        {onRemove && (
          <button type="button" disabled={disabled} {...sx(a.btn, a.btnGhost, a.btnSm)} onClick={onRemove}>
            <Trash2 size={14} strokeWidth={1.75} aria-hidden />
            Remove budget
          </button>
        )}
      </div>
    </form>
  )
}
