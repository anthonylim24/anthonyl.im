import { useEffect, useId, useRef, useState } from "react"
import { Check, ChevronDown, Sparkles } from "lucide-react"
import { sx } from "@/styles/merge"
import { errorMessage } from "../../../effect/errors"
import type { GetToken } from "../../../effect/http"
import { a } from "../atlas.stylex"
import { Select } from "../components/Select"
import { Modal, Spinner } from "../components/kit"
import { dayShort } from "../conciergeProposal"
import { ItemIcon } from "../ItemIcon"
import { LIMITS } from "../limits"
import { formatRange } from "../meta"
import { prep as p } from "../prep/prep.stylex"
import type { ItineraryItem, Trip, TripDay } from "../types"
import { BookingFields } from "../workspace/BookingFields"
import { Parts } from "../workspace/Parts"
import { ws as s } from "../workspace.stylex"
import { draftsFrom, pickedEntries, type BookingDraft, type BookingEntry } from "./addBookings"
import { bk } from "./bookings.stylex"
import { BookingSummaryLines } from "./BookingSummary"
import { MAX_PASTE_CHARS, parseBookings } from "./bookingsApi"
import { bookingTypeLabel } from "./kinds"
import { bookingWhen } from "./lines"

// "Paste a confirmation": paste an email, the server reads the bookings out
// of it, and each comes back as a card to check, fix and tick. Nothing is
// added until "Add N bookings". A lazy chunk: the workspace loads it on
// first open.

type Step = { k: "paste"; error: string | null } | { k: "reading" } | { k: "review"; drafts: BookingDraft[] }

export interface PasteBookingsSheetProps {
  trip: Trip
  getToken: GetToken
  onClose: () => void
  /** The ticked bookings, each with the day it goes on. Called once; the sheet closes after. */
  onAdd: (entries: BookingEntry[]) => void
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`

export function PasteBookingsSheet({ trip, getToken, onClose, onAdd }: PasteBookingsSheetProps) {
  const [text, setText] = useState("")
  const [step, setStep] = useState<Step>({ k: "paste", error: null })
  const reading = useRef<AbortController | null>(null)
  const fieldId = useId()

  // Closing mid-read drops the answer: its owner is gone.
  useEffect(() => () => reading.current?.abort(), [])

  const read = () => {
    if (!text.trim() || step.k === "reading") return
    reading.current?.abort()
    const controller = new AbortController()
    reading.current = controller
    setStep({ k: "reading" })
    parseBookings(getToken, trip.id, text, controller.signal).then(
      (found) => {
        if (controller.signal.aborted) return
        setStep({ k: "review", drafts: draftsFrom(found, trip) })
      },
      (err: unknown) => {
        if (controller.signal.aborted) return
        setStep({ k: "paste", error: errorMessage(err) })
      },
    )
  }

  const stop = () => {
    reading.current?.abort()
    setStep({ k: "paste", error: null })
  }

  const drafts = step.k === "review" ? step.drafts : []
  const entries = pickedEntries(drafts)
  const update = (key: string, change: (draft: BookingDraft) => BookingDraft) =>
    setStep((current) => (current.k === "review" ? { ...current, drafts: current.drafts.map((d) => (d.key === key ? change(d) : d)) } : current))

  const footer =
    step.k === "review" ? (
      <>
        <button type="button" {...sx(a.btn, a.btnGhost)} onClick={() => setStep({ k: "paste", error: null })}>
          Back to the text
        </button>
        <button
          type="button"
          {...sx(a.btn, a.btnPrimary)}
          disabled={entries.length === 0}
          onClick={() => {
            onAdd(entries)
            onClose()
          }}
        >
          {entries.length === 0 ? "Add bookings" : `Add ${plural(entries.length, "booking")}`}
        </button>
      </>
    ) : (
      <>
        {step.k === "reading" ? (
          <button type="button" {...sx(a.btn, a.btnGhost)} onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="button" {...sx(a.btn, a.btnGhost)} onClick={onClose}>
            Cancel
          </button>
        )}
        <button type="button" {...sx(a.btn, a.btnAccent)} disabled={!text.trim() || step.k === "reading"} onClick={read}>
          {step.k === "reading" ? <Spinner /> : <Sparkles size={16} strokeWidth={1.75} aria-hidden />}
          {step.k === "reading" ? "Reading…" : "Find bookings"}
        </button>
      </>
    )

  return (
    <Modal
      open
      onClose={onClose}
      wide
      accent={trip.appearance?.accent}
      title="Paste a confirmation"
      description="A flight, stay, car, train or table. AI reads out the dates, times and codes; nothing is added until you choose."
      footer={footer}
    >
      {step.k === "review" ? (
        <Review trip={trip} drafts={drafts} picked={entries.length} onUpdate={update} />
      ) : (
        <div {...sx(a.stack)}>
          <div>
            <div {...sx(a.between)}>
              <label htmlFor={fieldId} {...sx(s.miniLabel)}>
                Confirmation email or page
              </label>
              {text.length > MAX_PASTE_CHARS * 0.75 && (
                <span {...sx(bk.count)}>
                  {text.length.toLocaleString("en-US")} / {MAX_PASTE_CHARS.toLocaleString("en-US")}
                </span>
              )}
            </div>
            <textarea
              id={fieldId}
              value={text}
              maxLength={MAX_PASTE_CHARS}
              disabled={step.k === "reading"}
              autoFocus
              rows={8}
              placeholder="Paste the whole email here."
              aria-describedby={step.k === "paste" && step.error ? `${fieldId}-error` : undefined}
              {...sx(a.field, a.textarea, bk.paste)}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  read()
                }
              }}
            />
          </div>
          {step.k === "paste" && step.error && (
            <p id={`${fieldId}-error`} role="alert" {...sx(a.alert)}>
              {step.error}
            </p>
          )}
          <p role="status" {...sx(bk.status)}>
            {step.k === "reading" && (
              <>
                <Spinner />
                Reading the confirmation…
              </>
            )}
          </p>
        </div>
      )}
    </Modal>
  )
}

function Review({
  trip,
  drafts,
  picked,
  onUpdate,
}: {
  trip: Trip
  drafts: BookingDraft[]
  picked: number
  onUpdate: (key: string, change: (draft: BookingDraft) => BookingDraft) => void
}) {
  if (drafts.length === 0) {
    return (
      <p role="status" {...sx(a.body)}>
        No bookings found in that text. Paste the part with the dates and times, or add the booking by hand from the overview.
      </p>
    )
  }
  return (
    <div {...sx(a.stack)}>
      <p role="status" {...sx(a.body)}>
        {drafts.length === 1 ? "Found 1 booking." : `Found ${drafts.length} bookings.`} {picked > 0 ? "Check the details, then add the ones that are ticked." : "Tick the ones to add."}
      </p>
      <ul {...sx(bk.found)}>
        {drafts.map((draft) => (
          <DraftCard key={draft.key} trip={trip} draft={draft} onUpdate={(change) => onUpdate(draft.key, change)} />
        ))}
      </ul>
    </div>
  )
}

function DraftCard({ trip, draft, onUpdate }: { trip: Trip; draft: BookingDraft; onUpdate: (change: (draft: BookingDraft) => BookingDraft) => void }) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const checkId = useId()
  const day: TripDay = trip.days.find((d) => d.id === draft.dayId) ?? { id: "", date: draft.date, items: [] }
  const outside = !trip.days.some((d) => d.date === draft.date)
  const title = draft.item.title || bookingTypeLabel(draft.item.reservation?.type)
  const patch = (change: Partial<ItineraryItem>) => onUpdate((d) => ({ ...d, item: { ...d.item, ...change } }))
  const dayChoice = (
    <label>
      <span {...sx(s.miniLabel)}>Day</span>
      <Select
        label="Day"
        value={draft.dayId ?? ""}
        placeholder="Choose a day"
        options={trip.days.map((d, i) => ({ value: d.id, label: `Day ${i + 1} · ${dayShort(d)}` }))}
        onChange={(dayId) => onUpdate((d) => ({ ...d, dayId, picked: d.picked }))}
      />
    </label>
  )

  return (
    <li {...sx(bk.card, !draft.picked && bk.cardOff)}>
      <div {...sx(bk.cardHead)}>
        <label {...sx(p.check, bk.cardCheck)} htmlFor={checkId}>
          <input
            id={checkId}
            type="checkbox"
            checked={draft.picked}
            disabled={draft.dayId === null}
            aria-label={`Add ${title}`}
            onChange={(event) => onUpdate((d) => ({ ...d, picked: event.target.checked }))}
            {...sx(p.box, draft.picked && p.boxOn)}
          />
          <Check size={14} strokeWidth={3} aria-hidden {...sx(p.mark, draft.picked && p.markOn)} />
        </label>
        <span {...sx(bk.tile)} aria-hidden>
          <ItemIcon kind="reservation" reservationType={draft.item.reservation?.type} size={16} strokeWidth={1.75} />
        </span>
        <span {...sx(bk.cardText)}>
          <span {...sx(bk.cardTitle)}>{title}</span>
          <span {...sx(bk.cardWhen)}>
            <Parts parts={[bookingTypeLabel(draft.item.reservation?.type), ...bookingWhen(draft.item, { date: draft.date })]} />
          </span>
          <BookingSummaryLines item={draft.item} trip={trip} day={day} />
          {outside && (
            <span {...sx(bk.cardOutside)}>
              {dayShort({ date: draft.date })} is outside this trip ({formatRange(trip.startDate, trip.endDate)}).
              {draft.dayId === null ? " Choose a day to add it to." : ""}
            </span>
          )}
          {draft.already && (
            <span {...sx(bk.cardOutside)}>Already on the trip, on {dayShort(draft.already)}.</span>
          )}
        </span>
        <button
          type="button"
          {...sx(a.btn, a.btnGhost, a.btnSm)}
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={`${open ? "Hide" : "Edit"} details of ${title}`}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Done" : "Edit"}
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden {...sx(s.chevron, open && s.chevronOpen)} />
        </button>
      </div>
      {outside && !open && <div {...sx(bk.cardBody)}>{dayChoice}</div>}
      {open && (
        <div id={bodyId} {...sx(bk.cardBody)}>
          <label {...sx(bk.wide)}>
            <span {...sx(s.miniLabel)}>Name</span>
            <input value={draft.item.title} maxLength={LIMITS.itemTitle} {...sx(a.field)} onChange={(event) => patch({ title: event.target.value })} />
          </label>
          {dayChoice}
          <BookingFields item={draft.item} trip={trip} day={day} onChange={patch} />
        </div>
      )}
    </li>
  )
}
