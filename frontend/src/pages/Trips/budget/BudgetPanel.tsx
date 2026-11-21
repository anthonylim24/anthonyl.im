import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"
import { Plus } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { ws } from "../workspace.stylex"
import type { UndoMark } from "../editorMachine"
import { formatTripDate, plural, todayIsoIn } from "../meta"
import type { ItineraryItem, Trip, TripBudget, TripDay, TripExpense, TripPerson } from "../types"
import {
  budgetSummary,
  balances,
  CATEGORY_LABEL,
  cleanExpense,
  convert,
  costCategory,
  expenseGroups,
  formatMoney,
  localCurrency,
  missingMembers,
  NAME_MAX,
  newExpense,
  newPerson,
  peopleFor,
  personLabel,
  restoreAt,
  settleUp,
  type BudgetSummary,
  type ExpenseDraft,
  type ExpenseGroup,
  type Rates,
  type Viewer,
} from "./budget"
import { b } from "./budget.stylex"
import { BudgetHead } from "./BudgetHead"
import { CATEGORY_ICON } from "./categoryIcon"
import { ExpenseForm, type ExpenseFields } from "./ExpenseForm"
import { PartyList } from "./PartyList"
import { useRates } from "./useRates"

export interface BudgetPanelProps {
  trip: Trip
  editable: boolean
  locked: boolean
  viewer: Viewer
  onEdit: (fn: (doc: Trip) => Trip, mark?: UndoMark) => void
  onOpenItem?: (dayId: string, itemId: string) => void
}

type Editing = { k: "new"; fields: ExpenseFields } | { k: "edit"; id: string; fields: ExpenseFields } | null

/** A removal the trip-wide Undo can't reach (it covers days and dates only), undone here instead. */
interface Removal {
  id: number
  section: "budget" | "spent" | "party"
  label: string
  restore: (doc: Trip) => Trip
}

const UNDO_MS = 10_000

const titleOf = (expense: TripExpense) => expense.title.trim() || CATEGORY_LABEL[expense.category]

function fieldsOf(expense: TripExpense): ExpenseFields {
  return {
    title: expense.title,
    amount: expense.amount,
    currency: expense.currency,
    category: expense.category,
    date: expense.date ?? "",
    paidBy: expense.paidBy ?? "",
    splitWith: expense.splitWith && expense.splitWith.length > 0 ? expense.splitWith : null,
  }
}

/**
 * The trip's money, as a tab of the overview: the budget and how much of it
 * is spent or planned, spending by category, the expenses themselves, the
 * costs carried by stops, who is travelling, and who owes whom.
 */
export function BudgetPanel({ trip, editable, locked, viewer, onEdit, onOpenItem }: BudgetPanelProps) {
  const { rates, loading, foreign } = useRates(trip)
  const summary = useMemo(() => budgetSummary(trip, rates), [trip, rates])
  const people = peopleFor(trip, viewer)
  const me = viewer.id === null ? undefined : people.find((person) => person.userId === viewer.id)
  const expenses = useMemo(() => trip.expenses ?? [], [trip.expenses])
  const groups = useMemo(() => expenseGroups(expenses), [expenses])
  const plannedStops = useMemo(
    () => trip.days.flatMap((day, index) => day.items.filter((item) => item.cost).map((item) => ({ day, index, item }))),
    [trip.days],
  )
  const [editing, setEditing] = useState<Editing>(null)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [removal, setRemoval] = useState<Removal | null>(null)
  const [holding, setHolding] = useState(false)
  const [announce, setAnnounce] = useState("")
  const removals = useRef(0)
  const logButton = useRef<HTMLButtonElement>(null)
  const focusRow = useRef<string | null>(null)

  useEffect(() => {
    if (!removal || holding) return
    const timer = window.setTimeout(() => setRemoval((current) => (current?.id === removal.id ? null : current)), UNDO_MS)
    return () => window.clearTimeout(timer)
  }, [removal, holding])

  // ── Writes. Records are made here, once; the edit functions only place them. ──

  /** The saved party, or the derived one about to be saved because something now refers to it. */
  const partyOf = (doc: Trip) => doc.party ?? peopleFor(doc, viewer)

  const offerUndo = (section: Removal["section"], label: string, restore: Removal["restore"]) => {
    removals.current += 1
    setHolding(false)
    setRemoval({ id: removals.current, section, label, restore })
    setAnnounce(label)
  }

  const undoRemoval = () => {
    if (!removal) return
    onEdit(removal.restore, { label: removal.label.replace(/^Removed/, "Restored") })
    setAnnounce(removal.label.replace(/^Removed/, "Restored"))
    setRemoval(null)
    setHolding(false)
  }

  const addExpense = (expense: TripExpense, label: string) => {
    const namesPeople = !!(expense.paidBy || expense.splitWith)
    onEdit(
      (doc) => ({
        ...doc,
        ...(namesPeople && !doc.party ? { party: peopleFor(doc, viewer) } : {}),
        expenses: [...(doc.expenses ?? []), expense],
      }),
      { label },
    )
    setAnnounce(`${label}, ${formatMoney(expense.amount, expense.currency)}`)
  }

  const startLog = () => {
    if (editing?.k === "new") return
    const today = todayIsoIn(trip.timezone)
    setBudgetOpen(false)
    setEditing({
      k: "new",
      fields: {
        title: "",
        amount: undefined,
        currency: expenses[expenses.length - 1]?.currency ?? localCurrency(trip) ?? summary.currency,
        category: "food",
        date: trip.days.some((day) => day.date === today) ? today : "",
        paidBy: me?.id ?? "",
        splitWith: null,
      },
    })
  }

  const submitNew = (draft: ExpenseDraft) => {
    const expense = newExpense(draft)
    addExpense(expense, `Logged “${titleOf(expense)}”`)
    setEditing(null)
    logButton.current?.focus()
  }

  const submitEdit = (id: string, draft: ExpenseDraft) => {
    const before = expenses.find((expense) => expense.id === id) ?? newExpense(draft)
    const updated = cleanExpense({
      ...before,
      id,
      title: draft.title,
      amount: draft.amount,
      currency: draft.currency,
      category: draft.category,
      date: draft.date,
      paidBy: draft.paidBy,
      splitWith: draft.splitWith,
    })
    const namesPeople = !!(updated.paidBy || updated.splitWith)
    onEdit(
      (doc) => {
        const list = doc.expenses ?? []
        return {
          ...doc,
          ...(namesPeople && !doc.party ? { party: peopleFor(doc, viewer) } : {}),
          // Someone else removed it meanwhile: saving brings it back.
          expenses: list.some((e) => e.id === id) ? list.map((e) => (e.id === id ? updated : e)) : [...list, updated],
        }
      },
      { label: `Updated “${titleOf(updated)}”` },
    )
    setAnnounce(`Updated “${titleOf(updated)}”`)
    focusRow.current = id
    setEditing(null)
  }

  const removeExpense = (expense: TripExpense) => {
    const index = expenses.findIndex((e) => e.id === expense.id)
    const label = `Removed “${titleOf(expense)}”`
    onEdit((doc) => ({ ...doc, expenses: (doc.expenses ?? []).filter((e) => e.id !== expense.id) }), { label })
    setEditing(null)
    offerUndo("spent", label, (doc) =>
      (doc.expenses ?? []).some((e) => e.id === expense.id) ? doc : { ...doc, expenses: restoreAt(doc.expenses ?? [], expense, index) },
    )
  }

  const markPaid = (day: TripDay, item: ItineraryItem) => {
    if (!item.cost) return
    const expense = newExpense({
      title: item.title.trim() || "Untitled stop",
      amount: item.cost.amount,
      currency: item.cost.currency,
      category: costCategory(item),
      date: day.date,
      itemId: item.id,
      paidBy: me?.id,
    })
    addExpense(expense, `Paid “${titleOf(expense)}”`)
  }

  const saveBudget = (budget: TripBudget) => {
    onEdit((doc) => ({ ...doc, budget }), {
      label: budget.total !== undefined ? `Set the budget to ${formatMoney(budget.total, budget.currency)}` : `Showed costs in ${budget.currency}`,
    })
    setBudgetOpen(false)
  }

  const removeBudget = () => {
    const before = trip.budget
    onEdit((doc) => ({ ...doc, budget: undefined }), { label: "Removed the budget" })
    setBudgetOpen(false)
    if (before) offerUndo("budget", "Removed the budget", (doc) => (doc.budget ? doc : { ...doc, budget: before }))
  }

  const addPerson = (entry: TripPerson | string) => {
    const person = typeof entry === "string" ? newPerson(entry) : entry
    onEdit((doc) => {
      const party = partyOf(doc)
      return party.some((p) => p.id === person.id) ? { ...doc, party } : { ...doc, party: [...party, person] }
    }, { label: `Added ${person.name}` })
    setAnnounce(`Added ${person.name}`)
  }

  const renamePerson = (id: string, name: string) =>
    onEdit((doc) => ({ ...doc, party: partyOf(doc).map((p) => (p.id === id ? { ...p, name: name.slice(0, NAME_MAX) } : p)) }), {
      label: "Renamed someone on the trip",
      key: `person:${id}`,
    })

  const removePerson = (person: TripPerson) => {
    const index = people.findIndex((p) => p.id === person.id)
    const label = `Removed ${personLabel(person, viewer) === "You" ? "you" : person.name || "someone"}`
    onEdit((doc) => ({ ...doc, party: partyOf(doc).filter((p) => p.id !== person.id) }), { label })
    offerUndo("party", label, (doc) => {
      const party = partyOf(doc)
      return party.some((p) => p.id === person.id) ? doc : { ...doc, party: restoreAt(party, person, index) }
    })
  }

  const undoRow = (section: Removal["section"]) =>
    removal?.section === section ? (
      <UndoRow
        label={removal.label}
        onUndo={undoRemoval}
        onHold={setHolding}
      />
    ) : null

  const fresh = !trip.budget && expenses.length === 0 && plannedStops.length === 0
  const live = (
    <p {...sx(a.srOnly)} role="status" aria-live="polite">
      {announce}
    </p>
  )

  if (fresh && editing === null && !budgetOpen && removal === null) {
    return (
      <div {...sx(b.root)}>
        <EmptyBudget editable={editable} locked={locked} onLog={startLog} onSetBudget={() => setBudgetOpen(true)} />
        {live}
      </div>
    )
  }

  const pending = loading ? foreign.filter((code) => !(code in rates)) : []
  const balanceList = balances(trip, rates, people)
  const transfers = settleUp(balanceList, summary.currency)
  const known = new Set(people.map((p) => p.id))
  const unpaid = expenses.filter((e) => !e.paidBy || !known.has(e.paidBy)).length
  const settles = people.length >= 2 && expenses.some((e) => e.paidBy && known.has(e.paidBy))

  return (
    <div {...sx(b.root)}>
      <div {...sx(b.section)}>
        <BudgetHead
          summary={summary}
          budget={trip.budget}
          editable={editable}
          locked={locked}
          editing={budgetOpen}
          notice={undoRow("budget")}
          onEditing={(open) => {
            setBudgetOpen(open)
            if (open) setEditing(null)
          }}
          onSave={saveBudget}
          onRemove={removeBudget}
        />
        {pending.length > 0 ? (
          <p {...sx(b.note)}>
            Converting {pending.join(", ")} to {summary.currency}…
          </p>
        ) : !loading && summary.unconverted.length > 0 ? (
          <p {...sx(b.note)} role="status">
            Couldn’t convert {summary.unconverted.join(", ")} to {summary.currency}, so {summary.unconverted.length === 1 ? "those amounts aren’t" : "amounts in them aren’t"} in the totals.
          </p>
        ) : null}
      </div>

      {summary.byCategory.length > 0 && <CategoryLedger summary={summary} />}

      <SpentSection
        trip={trip}
        groups={groups}
        count={expenses.length}
        summary={summary}
        rates={rates}
        converting={loading}
        people={people}
        viewer={viewer}
        editable={editable}
        locked={locked}
        editing={editing}
        notice={undoRow("spent")}
        logButton={logButton}
        focusRow={focusRow}
        onLog={startLog}
        onOpen={(expense) => {
          setBudgetOpen(false)
          setEditing({ k: "edit", id: expense.id, fields: fieldsOf(expense) })
        }}
        onCancel={() => {
          if (editing?.k === "edit") focusRow.current = editing.id
          else logButton.current?.focus()
          setEditing(null)
        }}
        onSubmitNew={submitNew}
        onSubmitEdit={submitEdit}
        onRemove={removeExpense}
      />

      {(plannedStops.length > 0 || editable) && (
        <PlannedSection
          trip={trip}
          stops={plannedStops}
          expenses={expenses}
          currency={summary.currency}
          rates={rates}
          converting={loading}
          editable={editable}
          locked={locked}
          onOpenItem={onOpenItem}
          onMarkPaid={markPaid}
        />
      )}

      <PartyList
        people={people}
        viewer={viewer}
        missing={missingMembers(trip, viewer)}
        editable={editable}
        locked={locked}
        notice={undoRow("party")}
        onRename={renamePerson}
        onRemove={removePerson}
        onAdd={addPerson}
      />

      {settles && (
        <SettleUp people={people} viewer={viewer} transfers={transfers} currency={summary.currency} unpaid={unpaid} />
      )}
      {live}
    </div>
  )
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function EmptyBudget({
  editable,
  locked,
  onLog,
  onSetBudget,
}: {
  editable: boolean
  locked: boolean
  onLog: () => void
  onSetBudget: () => void
}) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} {...sx(b.empty)}>
      <p {...sx(a.eyebrow)}>Budget</p>
      <h2 id={titleId} {...sx(a.display, b.emptyTitle)}>
        What the trip <em {...sx(a.italic)}>costs</em>
      </h2>
      <p {...sx(a.body, b.measure)}>
        {editable
          ? "Log what you spend as you go, set a budget, and see who owes whom."
          : "Nothing spent or planned yet."}
      </p>
      {editable && (
        <div {...sx(a.rowWrap)}>
          <button type="button" disabled={locked} {...sx(a.btn, a.btnPrimary)} onClick={onLog}>
            <Plus size={16} strokeWidth={1.75} aria-hidden />
            Log an expense
          </button>
          <button type="button" disabled={locked} {...sx(a.btn, a.btnSecondary)} onClick={onSetBudget}>
            Set a budget
          </button>
        </div>
      )}
    </section>
  )
}

function UndoRow({ label, onUndo, onHold }: { label: string; onUndo: () => void; onHold: (hold: boolean) => void }) {
  return (
    <div
      {...sx(b.undo)}
      onMouseEnter={() => onHold(true)}
      onMouseLeave={() => onHold(false)}
      onFocus={() => onHold(true)}
      onBlur={() => onHold(false)}
    >
      <span {...sx(a.wrap)}>{label}</span>
      <button type="button" {...sx(a.btn, a.btnGhost, a.btnSm)} onClick={onUndo}>
        Undo
      </button>
    </div>
  )
}

function CategoryLedger({ summary }: { summary: BudgetSummary }) {
  const titleId = useId()
  const peak = Math.max(1, ...summary.byCategory.map((line) => Math.max(line.planned, line.spent)))
  const width = (amount: number) => `${(amount / peak) * 100}%`
  const figure = (amount: number) =>
    amount === 0 ? <span {...sx(b.nil)}>–</span> : formatMoney(amount, summary.currency, { compact: true })
  return (
    <section aria-labelledby={titleId} {...sx(b.section)}>
      <h2 id={titleId} {...sx(a.display, ws.sectionTitle)}>
        By category
      </h2>
      <div>
        <div {...sx(b.ledgerHead)} aria-hidden>
          <span />
          <span />
          <span {...sx(b.figures, b.figureHead)}>
            <span>Planned</span>
            <span>Spent</span>
          </span>
        </div>
        <ul {...sx(b.list)}>
          {summary.byCategory.map((line) => {
            const Icon = CATEGORY_ICON[line.category]
            return (
              <li key={line.category} {...sx(b.catRow)}>
                <span {...sx(ws.iconTile)}>
                  <Icon size={16} strokeWidth={1.75} aria-hidden />
                </span>
                <span {...sx(b.catBody)}>
                  <span {...sx(b.rowTitle)}>{CATEGORY_LABEL[line.category]}</span>
                  <span {...sx(b.bar)} aria-hidden>
                    <span {...sx(b.barPlanned)} style={{ width: width(line.planned) }} />
                    <span {...sx(b.barSpent)} style={{ width: width(line.spent) }} />
                  </span>
                </span>
                <span {...sx(b.figures)}>
                  <span>
                    <span {...sx(a.srOnly)}>Planned </span>
                    {figure(line.planned)}
                  </span>
                  <span>
                    <span {...sx(a.srOnly)}>Spent </span>
                    {figure(line.spent)}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

/** An amount in the budget currency, with the original under it when it was converted. */
function Amount({
  amount,
  currency,
  budgetCurrency,
  rates,
  converting,
}: {
  amount: number
  currency: string
  budgetCurrency: string
  rates: Rates
  /** Rates are still loading, so a missing one may yet arrive. */
  converting: boolean
}) {
  const converted = convert(amount, currency, budgetCurrency, rates)
  if (currency === budgetCurrency) return <span {...sx(b.money)}>{formatMoney(amount, currency)}</span>
  return (
    <span {...sx(b.money)}>
      {converted === null ? formatMoney(amount, currency) : formatMoney(converted, budgetCurrency)}
      <span {...sx(b.moneySub)}>
        {converted !== null ? `${formatMoney(amount, currency)} ${currency}` : converting ? currency : `${currency} · not in totals`}
      </span>
    </span>
  )
}

function SpentSection({
  trip,
  groups,
  count,
  summary,
  rates,
  converting,
  people,
  viewer,
  editable,
  locked,
  editing,
  notice,
  logButton,
  focusRow,
  onLog,
  onOpen,
  onCancel,
  onSubmitNew,
  onSubmitEdit,
  onRemove,
}: {
  trip: Trip
  groups: ExpenseGroup[]
  count: number
  summary: BudgetSummary
  rates: Rates
  converting: boolean
  people: readonly TripPerson[]
  viewer: Viewer
  editable: boolean
  locked: boolean
  editing: Editing
  notice: ReactNode
  logButton: RefObject<HTMLButtonElement | null>
  focusRow: RefObject<string | null>
  onLog: () => void
  onOpen: (expense: TripExpense) => void
  onCancel: () => void
  onSubmitNew: (draft: ExpenseDraft) => void
  onSubmitEdit: (id: string, draft: ExpenseDraft) => void
  onRemove: (expense: TripExpense) => void
}) {
  const titleId = useId()
  const currency = summary.currency
  const byId = new Map(people.map((p) => [p.id, p]))
  const dayLabel = (date: string | null) => {
    if (!date) return "No date"
    const index = trip.days.findIndex((day) => day.date === date)
    const when = formatTripDate(date, trip.timezone, index === -1 ? { year: "numeric" } : undefined)
    return index === -1 ? when : `Day ${index + 1} · ${when}`
  }
  const who = (expense: TripExpense) => {
    const parts = [CATEGORY_LABEL[expense.category]]
    if (expense.paidBy) {
      const payer = byId.get(expense.paidBy)
      parts.push(payer ? `Paid by ${personLabel(payer, viewer) === "You" ? "you" : personLabel(payer, viewer)}` : "Payer no longer on the trip")
    }
    const split = (expense.splitWith ?? []).filter((id) => byId.has(id))
    if (people.length > 1 && split.length > 0 && split.length < people.length) {
      const only = split.length === 1 ? byId.get(split[0]) : undefined
      parts.push(only ? `For ${personLabel(only, viewer) === "You" ? "you" : personLabel(only, viewer)}` : `Split ${split.length} ways`)
    }
    return parts.join(" · ")
  }
  const form = (fields: ExpenseFields, existing?: TripExpense) => (
    <ExpenseForm
      key={existing?.id ?? "new"}
      trip={trip}
      people={people}
      viewer={viewer}
      initial={fields}
      existing={existing ? titleOf(existing) : undefined}
      disabled={locked}
      onSubmit={(draft) => (existing ? onSubmitEdit(existing.id, draft) : onSubmitNew(draft))}
      onCancel={onCancel}
      onRemove={existing ? () => onRemove(existing) : undefined}
    />
  )

  return (
    <section aria-labelledby={titleId} {...sx(b.section)}>
      <div {...sx(b.sectionHead)}>
        <div {...sx(b.headTitle)}>
          <h2 id={titleId} {...sx(a.display, ws.sectionTitle)}>
            Spent
          </h2>
          {count > 0 && <span {...sx(a.mono, a.muted)}>{plural(count, "expense")}</span>}
        </div>
        {editable && (
          <button ref={logButton} type="button" disabled={locked} {...sx(a.btn, a.btnSecondary, a.btnSm)} onClick={onLog}>
            <Plus size={14} strokeWidth={1.75} aria-hidden />
            Log an expense
          </button>
        )}
      </div>
      {notice}
      {editable && editing?.k === "new" && form(editing.fields)}
      {count === 0 && editing?.k !== "new" && (
        <p {...sx(a.small)}>
          {editable ? "Nothing logged yet. Log what you spend and it counts against the budget." : "Nothing logged yet."}
        </p>
      )}
      {groups.map((group) => {
        const total = group.expenses.reduce((sum, e) => sum + (convert(e.amount, e.currency, currency, rates) ?? 0), 0)
        return (
          <div key={group.date ?? "none"}>
            <div {...sx(b.groupHead)}>
              <h3 {...sx(a.eyebrow)}>{dayLabel(group.date)}</h3>
              <span {...sx(a.mono, a.muted)}>{formatMoney(total, currency)}</span>
            </div>
            <ul {...sx(b.list)}>
              {group.expenses.map((expense) => {
                if (editable && editing?.k === "edit" && editing.id === expense.id) {
                  return (
                    <li key={expense.id} {...sx(b.rowItem)} style={{ paddingBlock: "0.5rem" }}>
                      {form(editing.fields, expense)}
                    </li>
                  )
                }
                const Icon = CATEGORY_ICON[expense.category]
                const content = (
                  <>
                    <span {...sx(ws.iconTile)}>
                      <Icon size={16} strokeWidth={1.75} aria-hidden />
                    </span>
                    <span {...sx(b.rowText)}>
                      <span {...sx(b.rowTitle, a.wrap)}>{titleOf(expense)}</span>
                      <span {...sx(a.small, a.wrap)}>{who(expense)}</span>
                    </span>
                    <Amount amount={expense.amount} currency={expense.currency} budgetCurrency={currency} rates={rates} converting={converting} />
                  </>
                )
                return (
                  <li key={expense.id} {...sx(b.rowItem)}>
                    {editable ? (
                      <button
                        type="button"
                        disabled={locked}
                        aria-label={`Edit “${titleOf(expense)}”, ${formatMoney(expense.amount, expense.currency)}`}
                        ref={(node) => {
                          if (node && focusRow.current === expense.id) {
                            focusRow.current = null
                            node.focus()
                          }
                        }}
                        {...sx(b.row, b.rowButton)}
                        onClick={() => onOpen(expense)}
                      >
                        {content}
                      </button>
                    ) : (
                      <div {...sx(b.row)}>{content}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </section>
  )
}

function PlannedSection({
  trip,
  stops,
  expenses,
  currency,
  rates,
  converting,
  editable,
  locked,
  onOpenItem,
  onMarkPaid,
}: {
  trip: Trip
  stops: Array<{ day: TripDay; index: number; item: ItineraryItem }>
  expenses: readonly TripExpense[]
  currency: string
  rates: Rates
  converting: boolean
  editable: boolean
  locked: boolean
  onOpenItem?: (dayId: string, itemId: string) => void
  onMarkPaid: (day: TripDay, item: ItineraryItem) => void
}) {
  const titleId = useId()
  const paid = new Set(expenses.map((e) => e.itemId).filter(Boolean))
  return (
    <section aria-labelledby={titleId} {...sx(b.section)}>
      <h2 id={titleId} {...sx(a.display, ws.sectionTitle)}>
        Planned from your stops
      </h2>
      {stops.length === 0 ? (
        <p {...sx(a.small)}>Give a stop a cost in its editor and it shows here, counted as planned.</p>
      ) : (
        <ul {...sx(b.list)}>
          {stops.map(({ day, index, item }) => {
            if (!item.cost) return null
            const Icon = CATEGORY_ICON[costCategory(item)]
            const title = item.title.trim() || "Untitled stop"
            const content = (
              <>
                <span {...sx(ws.iconTile)}>
                  <Icon size={16} strokeWidth={1.75} aria-hidden />
                </span>
                <span {...sx(b.rowText)}>
                  <span {...sx(a.eyebrow)}>
                    Day {index + 1} · {formatTripDate(day.date, trip.timezone)}
                  </span>
                  <span {...sx(b.rowTitle, a.wrap)}>{title}</span>
                </span>
                <Amount amount={item.cost.amount} currency={item.cost.currency} budgetCurrency={currency} rates={rates} converting={converting} />
              </>
            )
            return (
              <li key={item.id} {...sx(b.planned)}>
                {onOpenItem ? (
                  <button
                    type="button"
                    aria-label={`Open “${title}” on day ${index + 1}`}
                    {...sx(b.row, b.rowButton)}
                    onClick={() => onOpenItem(day.id, item.id)}
                  >
                    {content}
                  </button>
                ) : (
                  <div {...sx(b.row)}>{content}</div>
                )}
                {paid.has(item.id) ? (
                  <span {...sx(a.chip, a.chipOk, b.trailing)}>Paid</span>
                ) : editable ? (
                  <button
                    type="button"
                    disabled={locked}
                    aria-label={`Mark “${title}” paid`}
                    {...sx(a.btn, a.btnGhost, a.btnSm, b.trailing)}
                    onClick={() => onMarkPaid(day, item)}
                  >
                    Mark paid
                  </button>
                ) : (
                  <span />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function SettleUp({
  people,
  viewer,
  transfers,
  currency,
  unpaid,
}: {
  people: readonly TripPerson[]
  viewer: Viewer
  transfers: ReturnType<typeof settleUp>
  currency: string
  unpaid: number
}) {
  const titleId = useId()
  const byId = new Map(people.map((p) => [p.id, p]))
  const subject = (id: string) => {
    const person = byId.get(id)
    return person ? personLabel(person, viewer) : "Someone"
  }
  return (
    <section aria-labelledby={titleId} {...sx(b.section)}>
      <h2 id={titleId} {...sx(a.display, ws.sectionTitle)}>
        Settle up
      </h2>
      {transfers.length === 0 ? (
        <p {...sx(a.body)}>Everyone’s square.</p>
      ) : (
        <ul {...sx(b.list)}>
          {transfers.map((transfer) => {
            const from = subject(transfer.from)
            const to = subject(transfer.to)
            return (
              <li key={`${transfer.from}>${transfer.to}`} {...sx(b.person)}>
                <span {...sx(a.grow, a.body, a.wrap)}>
                  <strong {...sx(a.ink)}>{from}</strong> {from === "You" ? "pay" : "pays"}{" "}
                  <strong {...sx(a.ink)}>{to === "You" ? "you" : to}</strong>
                </span>
                <span {...sx(b.money)}>{formatMoney(transfer.amount, currency)}</span>
              </li>
            )
          })}
        </ul>
      )}
      {unpaid > 0 && (
        <p {...sx(a.small)}>
          {plural(unpaid, "expense")} {unpaid === 1 ? "doesn’t say" : "don’t say"} who paid, so {unpaid === 1 ? "it isn’t" : "they aren’t"} split.
        </p>
      )}
    </section>
  )
}
