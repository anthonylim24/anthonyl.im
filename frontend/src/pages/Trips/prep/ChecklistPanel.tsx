import { useEffect, useId, useRef, useState, type FocusEvent, type FormEvent } from "react"
import { Check, ListChecks, Plus, UserPlus, X } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { Menu, type MenuItem } from "../components/kit"
import type { UndoMark } from "../editorMachine"
import { composing, holdEnterWhileComposing } from "../ime"
import { LIMITS } from "../limits"
import { plural, tripTiming } from "../meta"
import type { ChecklistGroup, ChecklistItem, Trip, TripPerson } from "../types"
import {
  GROUPS,
  addItems,
  assignItem,
  hasText,
  initials,
  newChecklistItem,
  progress,
  removeItems,
  renameItem,
  restoreItems,
  setDone,
  suggestChecklist,
  type Removed,
} from "./checklist"
import { countriesFor, countryForZone, viewerTimeZone } from "./essentials"
import { prep as p } from "./prep.stylex"

// The trip's checklist: packing, jobs before you go, documents. Every write
// is one `onEdit` updater over `doc.checklist`. The trip-wide undo history
// covers the plan, not the checklist, so a removal is undone here, from an
// inline "Removed · Undo" line that lasts 10 s (held while hovered or focused).

const UNDO_MS = 10_000
const NOTICE_MS = 8_000

const PLACEHOLDER: Record<ChecklistGroup, string> = {
  packing: "Add something to pack",
  todo: "Add a job to do",
  documents: "Add a document",
}

type Edit = (fn: (doc: Trip) => Trip, mark?: UndoMark) => void

interface Undoable {
  seq: number
  /** "Removed “Sunscreen”", "Cleared 4 checked items". */
  label: string
  removed: Removed[]
  /** A single removal shows where its row was; a clear shows under the progress bar. */
  anchor: { group: ChecklistGroup; at: number } | null
}

export function ChecklistPanel({
  trip,
  editable,
  locked,
  people,
  homeCountry,
  onEdit,
}: {
  trip: Trip
  editable: boolean
  /** An AI run owns the document: controls show, disabled. */
  locked: boolean
  /** Who can be assigned an entry; defaults to `trip.party`. Assignment shows from two people. */
  people?: TripPerson[]
  /**
   * ISO2 of where the traveller lives, for adapter and passport suggestions.
   * Undefined: read from the viewer's time zone. Null: unknown (suggest generically).
   */
  homeCountry?: string | null
  onEdit: Edit
}) {
  const uid = useId()
  const list = trip.checklist ?? []
  const team = (people ?? trip.party ?? []).filter((person) => person.name.trim())
  const assignable = team.length >= 2 ? team : null
  const [undo, setUndo] = useState<Undoable | null>(null)
  const [held, setHeld] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const [composing, setComposing] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    if (!undo || held) return
    const timer = setTimeout(() => setUndo(null), UNDO_MS)
    return () => clearTimeout(timer)
  }, [undo, held])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  const write = (label: string, fn: (items: ChecklistItem[]) => ChecklistItem[]) =>
    onEdit((doc) => {
      const before = doc.checklist ?? []
      const after = fn(before)
      return after === before ? doc : { ...doc, checklist: after }
    }, { label })

  const focusSoon = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus())
  const boxId = (itemId: string) => `${uid}-box-${itemId}`
  const undoId = `${uid}-undo`

  const suggest = () => {
    const found = suggestChecklist(trip, list, homeCountry === undefined ? inferHome(trip) : (homeCountry ?? undefined))
    if (found.length === 0) {
      setNotice("Your list already covers the plan")
      setAnnouncement("Your list already covers the plan")
      return
    }
    const fresh = found.map((s) => newChecklistItem(s.text, s.group))
    write("Suggested from the plan", (current) => addItems(current, fresh.filter((item) => !hasText(current, item.text))))
    const message = `Added ${found.length} from your plan`
    setNotice(message)
    setAnnouncement(message)
    setComposing(false)
  }

  const add = (group: ChecklistGroup, text: string) => {
    const item = newChecklistItem(text, group)
    write("Added to the checklist", (current) => addItems(current, [item]))
  }

  const remove = (item: ChecklistItem) => {
    const index = list.findIndex((entry) => entry.id === item.id)
    if (index < 0) return
    const at = list.filter((entry) => entry.group === item.group).findIndex((entry) => entry.id === item.id)
    write("Removed from the checklist", (current) => removeItems(current, [item.id]).list)
    seq.current += 1
    setUndo({ seq: seq.current, label: `Removed “${item.text}”`, removed: [{ item, index }], anchor: { group: item.group, at } })
    setHeld(false)
    setAnnouncement(`Removed “${item.text}”`)
    focusSoon(undoId)
  }

  const clearChecked = () => {
    const ids = list.filter((item) => item.done).map((item) => item.id)
    const { removed } = removeItems(list, ids)
    if (removed.length === 0) return
    write("Cleared checked items", (current) => removeItems(current, ids).list)
    const label = `Cleared ${plural(removed.length, "checked item")}`
    seq.current += 1
    setUndo({ seq: seq.current, label, removed, anchor: null })
    setHeld(false)
    setNotice(null)
    setAnnouncement(label)
    focusSoon(undoId)
  }

  const restore = () => {
    if (!undo) return
    write("Put back on the checklist", (current) => restoreItems(current, undo.removed))
    setUndo(null)
    setHeld(false)
    setAnnouncement(undo.removed.length === 1 ? `Put back “${undo.removed[0]?.item.text}”` : `Put back ${plural(undo.removed.length, "item")}`)
    const first = undo.removed[0]
    if (first) focusSoon(boxId(first.item.id))
  }

  // Focus moves to Undo after every removal. Only keyboard focus holds the
  // line (the browser's focus-visible heuristic): after a click the pointer
  // has moved on, and the line should still go after 10 s.
  const hold = {
    onMouseEnter: () => setHeld(true),
    onMouseLeave: () => setHeld(false),
    onFocus: (event: FocusEvent<HTMLElement>) => {
      if (keyboardFocus(event.target)) setHeld(true)
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeld(false)
    },
  }

  const undoLine = (undoable: Undoable, style: Parameters<typeof sx>[0]) => (
    <div key={`undo-${undoable.seq}`} {...sx(style)} {...hold}>
      <span id={`${undoId}-what`} {...sx(a.small, a.wrap)}>
        {undoable.label}
      </span>
      <button
        id={undoId}
        type="button"
        disabled={locked}
        aria-describedby={`${undoId}-what`}
        onClick={restore}
        {...sx(a.btn, a.btnSm, a.btnGhost)}
      >
        Undo
      </button>
    </div>
  )

  // Packing and visa suggestions are for before the trip; after it, the list is for what is left to do.
  const ended = tripTiming(trip).phase === "past"
  const tally = progress(list)
  const allDone = tally.total > 0 && tally.done === tally.total
  const showGroups = list.length > 0 || composing || undo !== null

  return (
    <div {...sx(p.root)}>
      <p {...sx(a.srOnly)} role="status" aria-live="polite">
        {announcement}
      </p>

      {(list.length > 0 || undo) && (
        <header {...sx(p.head)}>
          <div {...sx(p.headRow)}>
            <p {...sx(a.mono, p.tally)}>
              {tally.total === 0
                ? "Nothing left on the list"
                : allDone
                  ? `All ${tally.total} done`
                  : `${tally.done} of ${tally.total} done`}
            </p>
            {editable && (
              <div {...sx(a.rowWrap)}>
                {!ended && (
                  <button type="button" disabled={locked} onClick={suggest} {...sx(a.btn, a.btnSm, a.btnSecondary)}>
                    <ListChecks size={15} strokeWidth={1.75} aria-hidden />
                    Suggest from your plan
                  </button>
                )}
                <button type="button" disabled={locked || tally.done === 0} onClick={clearChecked} {...sx(a.btn, a.btnSm, a.btnGhost)}>
                  Clear checked
                </button>
              </div>
            )}
          </div>
          <div {...sx(p.bar)} aria-hidden>
            <div {...sx(p.barFill)} style={{ transform: `scaleX(${tally.total ? tally.done / tally.total : 0})` }} />
          </div>
          {undo && !undo.anchor ? (
            undoLine(undo, a.row)
          ) : notice ? (
            <p {...sx(a.small, p.status)}>{notice}</p>
          ) : allDone ? (
            <p {...sx(a.small, p.status)}>Everything is checked off.</p>
          ) : null}
        </header>
      )}

      {list.length === 0 && !undo && !composing && (
        editable ? (
          <section {...sx(p.empty)} aria-labelledby={`${uid}-empty`}>
            <p {...sx(a.eyebrow)}>Checklist</p>
            {ended ? (
              <>
                <h2 id={`${uid}-empty`} {...sx(a.display, p.emptyTitle)}>
                  After the <em {...sx(a.italic)}>trip</em>
                </h2>
                <p {...sx(a.body, p.measure)}>
                  Anything still to do now you’re back: expenses to settle, photos to send, things to return.
                </p>
              </>
            ) : (
              <>
                <h2 id={`${uid}-empty`} {...sx(a.display, p.emptyTitle)}>
                  Ready when you <em {...sx(a.italic)}>go</em>
                </h2>
                <p {...sx(a.body, p.measure)}>
                  Packing, documents and the jobs to do before you leave, in one list the whole trip can tick off. Suggestions
                  come from your plan: its weather, places and bookings.
                </p>
              </>
            )}
            {notice && <p {...sx(a.small)}>{notice}</p>}
            <div {...sx(a.rowWrap)}>
              {!ended && (
                <button type="button" disabled={locked} onClick={suggest} {...sx(a.btn, a.btnPrimary)}>
                  <ListChecks size={16} strokeWidth={1.75} aria-hidden />
                  Suggest from your plan
                </button>
              )}
              <button
                type="button"
                disabled={locked}
                onClick={() => {
                  setComposing(true)
                  focusSoon(`${uid}-add-packing`)
                }}
                {...sx(a.btn, ended ? a.btnPrimary : a.btnSecondary)}
              >
                Add your own
              </button>
            </div>
          </section>
        ) : (
          <p {...sx(a.body)}>Nothing on the checklist yet.</p>
        )
      )}

      {showGroups &&
        GROUPS.map((group) => {
          const items = list.filter((item) => item.group === group.id)
          if (!editable && items.length === 0) return null
          const count = progress(items)
          const ghost = undo?.anchor?.group === group.id ? undo : null
          const rows = items.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              boxId={boxId(item.id)}
              editable={editable}
              locked={locked}
              people={assignable}
              onToggle={(done) => write(done ? "Checked off" : "Unchecked", (current) => setDone(current, item.id, done))}
              onRename={(text) => write("Renamed a checklist item", (current) => renameItem(current, item.id, text))}
              onAssign={(personId) => write("Assigned a checklist item", (current) => assignItem(current, item.id, personId))}
              onRemove={() => remove(item)}
            />
          ))
          if (ghost?.anchor) {
            rows.splice(Math.min(ghost.anchor.at, rows.length), 0, <li key={`undo-${ghost.seq}`}>{undoLine(ghost, p.ghost)}</li>)
          }
          return (
            <section key={group.id} {...sx(p.group)} aria-labelledby={`${uid}-${group.id}`}>
              <div {...sx(p.groupHead)}>
                <h2 id={`${uid}-${group.id}`} {...sx(a.display, p.groupTitle)}>
                  {group.label}
                </h2>
                {count.total > 0 && (
                  <span {...sx(a.mono, a.muted)}>
                    {count.done} of {count.total}
                  </span>
                )}
              </div>
              {rows.length > 0 && <ul {...sx(p.list)}>{rows}</ul>}
              {editable && (
                <AddRow
                  id={`${uid}-add-${group.id}`}
                  label={`Add to ${group.label}`}
                  placeholder={PLACEHOLDER[group.id]}
                  disabled={locked}
                  onAdd={(text) => add(group.id, text)}
                />
              )}
            </section>
          )
        })}
    </div>
  )
}

function keyboardFocus(element: Element): boolean {
  try {
    return element.matches(":focus-visible")
  } catch {
    return false
  }
}

/** Home is where the viewer's clock is, unless that is the destination: then it is unknown. */
function inferHome(trip: Trip): string | undefined {
  const here = countryForZone(viewerTimeZone())
  if (!here) return undefined
  return countriesFor(trip).some((country) => country.code === here.code) ? undefined : here.code
}

function ChecklistRow({
  item,
  boxId,
  editable,
  locked,
  people,
  onToggle,
  onRename,
  onAssign,
  onRemove,
}: {
  item: ChecklistItem
  boxId: string
  editable: boolean
  locked: boolean
  people: TripPerson[] | null
  onToggle: (done: boolean) => void
  onRename: (text: string) => void
  onAssign: (personId: string | undefined) => void
  onRemove: () => void
}) {
  // null: showing the text; a string: editing it.
  const [draft, setDraft] = useState<string | null>(null)
  const textRef = useRef<HTMLButtonElement>(null)
  // Escape unmounts the editor; a blur that follows must not save the draft.
  const cancelled = useRef(false)
  const assignee = people?.find((person) => person.id === item.assignee)

  const commit = (value: string) => {
    const clean = value.trim()
    if (clean && clean !== item.text) onRename(clean)
    setDraft(null)
  }
  const refocus = () => requestAnimationFrame(() => textRef.current?.focus())

  if (!editable) {
    return (
      <li {...sx(p.row)}>
        <span {...sx(p.check, p.checkStatic)} aria-hidden>
          <span {...sx(p.box, p.checkStatic, item.done && p.boxOn)} />
          <Check size={14} strokeWidth={3} {...sx(p.mark, item.done && p.markOn)} />
        </span>
        <span {...sx(p.text, a.wrap, item.done && p.textDone)}>
          <span {...sx(a.srOnly)}>{item.done ? "Done: " : "To do: "}</span>
          {item.text}
        </span>
        {assignee && people && (
          <span {...sx(p.initials, p.initialsStatic)} title={assignee.name}>
            <span aria-hidden>{initials(assignee.name)}</span>
            <span {...sx(a.srOnly)}>{assignee.name}</span>
          </span>
        )}
      </li>
    )
  }

  return (
    <li {...sx(p.row)}>
      <label {...sx(p.check)}>
        <input
          id={boxId}
          type="checkbox"
          checked={item.done}
          disabled={locked}
          aria-label={item.text}
          onChange={(event) => onToggle(event.target.checked)}
          {...sx(p.box, item.done && p.boxOn)}
        />
        <Check size={14} strokeWidth={3} aria-hidden {...sx(p.mark, item.done && p.markOn)} />
      </label>

      {draft !== null ? (
        <textarea
          // The editor replaces the text that was just pressed, so focus moves into it.
          autoFocus
          rows={1}
          maxLength={LIMITS.checklistText}
          value={draft}
          aria-label={`Edit “${item.text}”`}
          onChange={(event) => setDraft(event.target.value.replace(/\n/g, " "))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              // The Enter that confirms a Korean or Japanese word is the input method's, not ours.
              if (composing(event)) return
              event.preventDefault()
              commit(draft)
              refocus()
            } else if (event.key === "Escape") {
              event.preventDefault()
              event.stopPropagation()
              cancelled.current = true
              setDraft(null)
              refocus()
            }
          }}
          onBlur={() => {
            if (cancelled.current) return
            commit(draft)
          }}
          {...sx(p.editor, a.wrap)}
        />
      ) : (
        <button
          ref={textRef}
          type="button"
          disabled={locked}
          aria-label={`Edit “${item.text}”`}
          onClick={() => {
            cancelled.current = false
            setDraft(item.text)
          }}
          {...sx(p.text, p.textButton, a.wrap, item.done && p.textDone)}
        >
          {item.text}
        </button>
      )}

      {people &&
        (locked ? (
          assignee && (
            <span {...sx(p.initials, p.initialsStatic)} title={assignee.name}>
              <span aria-hidden>{initials(assignee.name)}</span>
              <span {...sx(a.srOnly)}>{assignee.name}</span>
            </span>
          )
        ) : (
          <Menu
            label={assignee ? `“${item.text}” is with ${assignee.name}. Reassign` : `Assign “${item.text}”`}
            trigger={
              <span {...sx(p.initials, !assignee && p.initialsEmpty)} aria-hidden>
                {assignee ? initials(assignee.name) : <UserPlus size={13} strokeWidth={1.75} />}
              </span>
            }
            triggerStyle={p.assign}
            items={assignItems(people, item.assignee, onAssign)}
          />
        ))}

      <button
        type="button"
        disabled={locked}
        aria-label={`Remove “${item.text}”`}
        onClick={onRemove}
        {...sx(a.iconBtn, a.iconBtnSm, p.quiet)}
      >
        <X size={16} strokeWidth={1.75} aria-hidden />
      </button>
    </li>
  )
}

function assignItems(people: TripPerson[], current: string | undefined, onAssign: (personId: string | undefined) => void): MenuItem[] {
  const mark = (on: boolean) =>
    on ? <Check size={14} strokeWidth={2.25} aria-hidden /> : <span {...sx(p.menuSpacer)} aria-hidden />
  const seen = new Map<string, number>()
  const named = people.map((person) => {
    const n = (seen.get(person.name) ?? 0) + 1
    seen.set(person.name, n)
    // Menu keys items by label, so two people called Alex become "Alex" and "Alex (2)".
    return { person, label: n === 1 ? person.name : `${person.name} (${n})` }
  })
  return [
    { label: "Nobody", icon: mark(current === undefined), onSelect: () => onAssign(undefined) },
    ...named.map(({ person, label }, i) => ({
      label,
      icon: mark(person.id === current),
      onSelect: () => onAssign(person.id),
      separated: i === 0,
    })),
  ]
}

function AddRow({
  id,
  label,
  placeholder,
  disabled,
  onAdd,
}: {
  id: string
  label: string
  placeholder: string
  disabled: boolean
  onAdd: (text: string) => void
}) {
  const [text, setText] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim()) return
    onAdd(text)
    setText("")
    inputRef.current?.focus()
  }
  return (
    <form {...sx(p.addRow)} onSubmit={submit} onKeyDown={holdEnterWhileComposing}>
      <label htmlFor={id} {...sx(a.srOnly)}>
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        value={text}
        maxLength={LIMITS.checklistText}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="done"
        onChange={(event) => setText(event.target.value)}
        {...sx(a.field, p.addField)}
      />
      <button type="submit" disabled={disabled || !text.trim()} aria-label={label} {...sx(a.btn, a.btnSecondary, a.noShrink)}>
        <Plus size={16} strokeWidth={1.75} aria-hidden />
        Add
      </button>
    </form>
  )
}
