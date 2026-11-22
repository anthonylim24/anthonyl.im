import { useId, useState } from "react"
import { CalendarPlus, X } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { ws as s } from "../workspace.stylex"
import type { UndoMark } from "../editorMachine"
import { ItemIcon } from "../ItemIcon"
import { LIMITS } from "../limits"
import type { LngLat } from "../map/geo"
import { formatTripDate, plural } from "../meta"
import { addIdea, dayFull, ideaToDay, ideasFull, removeIdea } from "../tripEdits"
import type { ItineraryItem, Trip } from "../types"
import { AddStop } from "./AddStop"
import { Presence } from "../components/presence"
import { DayPicker, type DayChoice } from "./DayPicker"
import { LinkChip } from "./LinkChip"
import { stopLink } from "./stopLinks"

// Places saved for later: not on any day yet. One field saves a place (the
// same search a day uses); each idea can go onto a day, where it joins the
// route above any "To schedule" heading, or be let go. Every write is one
// `onEdit` updater over the trip, as the other overview tabs do.

type Edit = (fn: (doc: Trip) => Trip, undo?: UndoMark) => void

export interface IdeasPanelProps {
  trip: Trip
  /** The traveller can change the trip (owner or editor). Viewers get the list only. */
  editable: boolean
  /** An AI run or a conflict owns the document for now. */
  locked: boolean
  /** Search bias for the place field. */
  near: LngLat | null
  onEdit: Edit
}

export function IdeasPanel({ trip, editable, locked, near, onEdit }: IdeasPanelProps) {
  const uid = useId()
  const [placing, setPlacing] = useState<ItineraryItem | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const ideas = trip.ideas ?? []
  const full = ideasFull(trip)

  const save = (item: ItineraryItem) => {
    onEdit((doc) => addIdea(doc, item), { label: `Saved “${item.title}” for later` })
    setAnnouncement(`Saved ${item.title} for later`)
  }

  const remove = (idea: ItineraryItem) => {
    onEdit((doc) => removeIdea(doc, idea.id), { label: `Removed “${idea.title}” from the wishlist`, toast: true })
    setAnnouncement(`Removed ${idea.title}`)
  }

  const toDay = (idea: ItineraryItem, dayId: string) => {
    const index = trip.days.findIndex((d) => d.id === dayId)
    if (index < 0) return
    const label = `Added “${idea.title}” to day ${index + 1}`
    onEdit((doc) => ideaToDay(doc, idea.id, dayId), { label, toast: true })
    setAnnouncement(`Added ${idea.title} to day ${index + 1}`)
  }

  const choices: DayChoice[] = trip.days.map((day, i) => ({
    id: day.id,
    label: `Day ${i + 1} · ${formatTripDate(day.date, day.timezone ?? trip.timezone)}`,
    detail: [day.city, plural(day.items.filter((item) => item.kind !== "section").length, "stop")].filter(Boolean).join(" · "),
    off: dayFull(day) ? "Full" : undefined,
  }))

  return (
    <section {...sx(a.stack)} style={{ gap: "1.25rem" }} aria-labelledby={`${uid}-title`}>
      <p {...sx(a.srOnly)} role="status" aria-live="polite">
        {announcement}
      </p>
      <header {...sx(a.stack)} style={{ gap: "0.375rem" }}>
        <h2 id={`${uid}-title`} {...sx(a.eyebrow)}>
          Wishlist
        </h2>
        <p {...sx(a.body, a.muted, a.wrap)} style={{ margin: 0 }}>
          Places you might fit in. Add one to a day when you know where it goes.
        </p>
      </header>

      {editable && (
        <div {...sx(a.stack)} style={{ gap: "0.375rem" }}>
          <AddStop
            near={near}
            disabled={locked || full}
            kinds={["place"]}
            label="Save a place for later"
            placeholder="Save a place for later…"
            below
            onAdd={save}
          />
          {full && <p {...sx(a.small)}>The list is full at {LIMITS.ideas}. Remove one to save another.</p>}
        </div>
      )}

      {ideas.length === 0 ? (
        <p {...sx(a.body, a.muted)} style={{ margin: 0 }}>
          {editable ? "Nothing saved yet. Search for a place above, or use Save for later on any stop." : "Nothing saved for later yet."}
        </p>
      ) : (
        <ul {...sx(s.ideaList)} aria-label={plural(ideas.length, "place") + " on the wishlist"}>
          {ideas.map((idea) => (
            <IdeaRow
              key={idea.id}
              idea={idea}
              editable={editable}
              locked={locked}
              onPlace={() => setPlacing(idea)}
              onRemove={() => remove(idea)}
            />
          ))}
        </ul>
      )}

      <Presence when={placing}>{(placing) => (
        <DayPicker
          title={`Add “${placing.title}” to a day`}
          description="It joins that day’s route, above anything still to schedule."
          choices={choices}
          onPick={(dayId) => toDay(placing, dayId)}
          onClose={() => setPlacing(null)}
        />
      )}</Presence>
    </section>
  )
}

function IdeaRow({
  idea,
  editable,
  locked,
  onPlace,
  onRemove,
}: {
  idea: ItineraryItem
  editable: boolean
  locked: boolean
  onPlace: () => void
  onRemove: () => void
}) {
  const name = idea.title || idea.location?.name || "Untitled place"
  const where = idea.location?.address ?? (idea.location?.category ? idea.location.category.replace(/_/g, " ") : undefined)
  const links = (idea.links ?? []).map(stopLink).filter((link): link is NonNullable<typeof link> => link !== null)
  return (
    <li {...sx(s.ideaRow)}>
      <span {...sx(s.ideaIcon)} aria-hidden>
        <ItemIcon kind={idea.kind} category={idea.location?.category} reservationType={idea.reservation?.type} size={16} strokeWidth={1.75} />
      </span>
      <div {...sx(s.ideaText)}>
        <span {...sx(s.ideaTitle, a.wrap)}>{name}</span>
        {where && <span {...sx(a.small, a.wrap)}>{where}</span>}
        {idea.notes && <span {...sx(a.small, a.wrap)}>{idea.notes}</span>}
        {links.length > 0 && (
          <ul {...sx(s.links)} aria-label="Links">
            {links.map((link) => (
              <li key={link.href}>
                <LinkChip link={link} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {editable && (
        <div {...sx(s.ideaActions)}>
          <button
            type="button"
            {...sx(a.btn, a.btnGhost, a.btnSm)}
            aria-label={`Add to day: ${name}`}
            disabled={locked}
            onClick={onPlace}
          >
            <CalendarPlus size={16} strokeWidth={1.75} aria-hidden />
            Add to day
          </button>
          <button
            type="button"
            {...sx(a.iconBtn, a.iconBtnSm)}
            aria-label={`Remove ${name}`}
            disabled={locked}
            onClick={onRemove}
          >
            <X size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      )}
    </li>
  )
}
