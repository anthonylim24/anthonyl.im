import { useId, useState, type ReactNode } from "react"
import { Plus, X } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { share, ws } from "../workspace.stylex"
import { holdEnterWhileComposing } from "../ime"
import type { TripPerson } from "../types"
import { NAME_MAX, personLabel, type Viewer } from "./budget"
import { b } from "./budget.stylex"

/** Who's travelling: the people costs are split between. */
export function PartyList({
  people,
  viewer,
  missing,
  editable,
  locked,
  notice,
  onRename,
  onRemove,
  onAdd,
}: {
  people: readonly TripPerson[]
  viewer: Viewer
  /** Members of the trip the saved party doesn't list yet. */
  missing: readonly TripPerson[]
  editable: boolean
  locked: boolean
  /** An Undo row, shown above the list. */
  notice?: ReactNode
  onRename: (id: string, name: string) => void
  onRemove: (person: TripPerson) => void
  onAdd: (person: TripPerson | string) => void
}) {
  const titleId = useId()
  const [name, setName] = useState("")

  return (
    <section aria-labelledby={titleId} {...sx(b.section)}>
      <div {...sx(b.sectionHead)}>
        <h2 id={titleId} {...sx(a.display, ws.sectionTitle)}>
          Who’s travelling
        </h2>
        <span {...sx(a.small)}>Costs are split between these people.</span>
      </div>
      {notice}
      {people.length === 0 ? (
        <p {...sx(a.small)}>{editable ? "Add the people on this trip to split costs between them." : "No one listed yet."}</p>
      ) : (
        <ul {...sx(b.list)}>
          {people.map((person) => {
            const label = personLabel(person, viewer)
            const you = label === "You"
            return (
              <li key={person.id} {...sx(b.person)}>
                <span {...sx(share.avatar)} aria-hidden>
                  {(person.name.trim() || label).charAt(0).toUpperCase()}
                </span>
                {editable ? (
                  <input
                    value={person.name}
                    maxLength={NAME_MAX}
                    disabled={locked}
                    aria-label={you ? "Your name" : `Name of ${label}`}
                    placeholder="Name"
                    {...sx(a.fieldBare, b.nameInput, a.focusable)}
                    onChange={(event) => onRename(person.id, event.target.value)}
                  />
                ) : (
                  <span {...sx(a.grow, a.wrap, share.personName)}>{label}</span>
                )}
                {editable && you && <span {...sx(a.chip, a.noShrink)}>You</span>}
                {editable && (
                  <button
                    type="button"
                    {...sx(a.iconBtn, a.iconBtnSm)}
                    disabled={locked}
                    aria-label={you ? "Remove yourself" : `Remove ${label}`}
                    onClick={() => onRemove(person)}
                  >
                    <X size={16} strokeWidth={1.75} aria-hidden />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {editable && missing.length > 0 && (
        <div {...sx(a.rowWrap)}>
          <span {...sx(a.small)}>Also on this trip:</span>
          {missing.map((person) => (
            <button key={person.id} type="button" disabled={locked} {...sx(a.btn, a.btnSecondary, a.btnSm)} onClick={() => onAdd(person)}>
              <Plus size={14} strokeWidth={1.75} aria-hidden />
              Add {personLabel(person, viewer)}
            </button>
          ))}
        </div>
      )}
      {editable && (
        <form
          {...sx(b.addRow)}
          onKeyDown={holdEnterWhileComposing}
          onSubmit={(event) => {
            event.preventDefault()
            const trimmed = name.trim()
            if (!trimmed) return
            onAdd(trimmed)
            setName("")
          }}
        >
          <input
            value={name}
            maxLength={NAME_MAX}
            disabled={locked}
            aria-label="Name of someone else on the trip"
            placeholder="Add a name"
            autoComplete="off"
            {...sx(a.field)}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" disabled={locked || !name.trim()} {...sx(a.btn, a.btnSecondary, a.noShrink)}>
            Add
          </button>
        </form>
      )}
    </section>
  )
}
