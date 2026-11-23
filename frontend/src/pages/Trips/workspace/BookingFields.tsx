import { useId, useMemo, useState, type ReactNode } from "react"
import { sx } from "@/styles/merge"
import { LIMITS } from "../limits"
import { a } from "../atlas.stylex"
import { Select } from "../components/Select"
import { ws as s } from "../workspace.stylex"
import type { ItineraryItem, Trip, TripDay } from "../types"
import { bk } from "../bookings/bookings.stylex"
import { endDateChoices, tripZones } from "../bookings/choices"
import {
  bookingForm,
  bookingTypeLabel,
  bookingTypeOptions,
  partyWords,
  RESERVATION_STATUS_LABEL,
  RESERVATION_STATUSES,
  reservationOf,
  type Reservation,
} from "../bookings/kinds"
import { cleanLinkInput } from "../bookings/lines"
import { TimeField } from "../bookings/TimeField"
import { ZoneField } from "../bookings/ZoneField"

export interface BookingFieldsProps {
  item: ItineraryItem
  /** A patch for the item: `reservation` always arrives whole, `time` / `endTime` alone. */
  onChange: (patch: Partial<ItineraryItem>) => void
  trip: Trip
  /** The day the booking sits on: its start date. */
  day: TripDay
  disabled?: boolean
}

/** Empty fields leave the document, so a cleared seat is gone, not "". */
function tidy(reservation: Reservation): Reservation {
  return Object.fromEntries(Object.entries(reservation).filter(([, value]) => value !== undefined && value !== "")) as Reservation
}

/**
 * The booking part of a stop's editor, by kind: a flight's airline, number,
 * airports, landing (with its date and zone), terminal and seat; a stay's
 * check-in and check-out; a car's pick-up and drop-off; a train's operator,
 * stations and seat. Every booking has its status, confirmation, contact and
 * a https link. Its start and end times are the item's own `time` / `endTime`.
 */
export function BookingFields({ item, onChange, trip, day, disabled }: BookingFieldsProps) {
  const r = reservationOf(item)
  const form = bookingForm(r.type)
  const words = partyWords(r.type)
  const zones = useMemo(() => tripZones(trip), [trip])
  const legendId = useId()
  const set = (patch: Partial<Reservation>) => onChange({ reservation: tidy({ ...r, ...patch }) })
  const text = (key: keyof Reservation, label: string, max: number, extra: { placeholder?: string; code?: boolean; wide?: boolean } = {}) => (
    <TextField
      key={key}
      label={label}
      value={(r[key] as string | undefined) ?? ""}
      max={max}
      placeholder={extra.placeholder}
      code={extra.code}
      wide={extra.wide}
      disabled={disabled}
      onChange={(value) => set({ [key]: value || undefined })}
    />
  )
  // An airport code reads in capitals; a station or a pick-up desk keeps its case.
  const airport = (key: "from" | "to", label: string, placeholder: string) => (
    <TextField
      key={key}
      label={label}
      value={r[key] ?? ""}
      max={LIMITS.bookingPlace}
      placeholder={placeholder}
      code
      disabled={disabled}
      normalize={(value) => (/^[a-z]{3}$/i.test(value.trim()) ? value.trim().toUpperCase() : value)}
      onChange={(value) => set({ [key]: value || undefined })}
    />
  )
  const time = (key: "time" | "endTime", label: string) => (
    <TimeField key={key} label={label} value={item[key]} disabled={disabled} onChange={(value) => onChange({ [key]: value })} />
  )
  const endDate = (label: string) => (
    <SelectField
      key="endDate"
      label={label}
      value={r.endDate ?? ""}
      disabled={disabled}
      options={endDateChoices(form, day.date, trip.endDate, r.endDate)}
      onChange={(value) => set({ endDate: value || undefined })}
    />
  )

  let specific: ReactNode[]
  if (form === "flight") {
    specific = [
      text("provider", words.provider, LIMITS.provider, { placeholder: "e.g. Hawaiian Airlines" }),
      text("number", words.number, LIMITS.bookingNumber, { placeholder: "e.g. HA 11", code: true }),
      airport("from", "From", "e.g. SFO"),
      airport("to", "To", "e.g. HNL"),
      time("time", "Departs"),
      time("endTime", "Lands"),
      endDate("Lands on"),
      text("terminal", "Terminal", LIMITS.terminal, { placeholder: "e.g. 2" }),
      <ZoneField
        key="zone"
        label="Arrival time zone"
        value={r.endTimezone}
        tripZones={zones}
        date={r.endDate ?? day.date}
        disabled={disabled}
        onChange={(endTimezone) => set({ endTimezone })}
      />,
      text("seat", "Seat", LIMITS.seat, { placeholder: "e.g. 14A", code: true }),
    ]
  } else if (form === "stay") {
    specific = [time("time", "Check-in"), endDate("Check-out"), time("endTime", "Check-out time"), text("provider", words.provider, LIMITS.provider, { placeholder: "e.g. Booking.com" })]
  } else if (form === "car") {
    specific = [
      text("provider", words.provider, LIMITS.provider, { placeholder: "e.g. Hertz", wide: true }),
      text("from", "Pick-up place", LIMITS.bookingPlace, { placeholder: "e.g. HNL airport desk" }),
      time("time", "Pick-up"),
      text("to", "Drop-off place", LIMITS.bookingPlace, { placeholder: "Same as pick-up if empty" }),
      time("endTime", "Drop-off"),
      endDate("Drop-off day"),
    ]
  } else if (form === "ride") {
    specific = [
      text("provider", words.provider, LIMITS.provider, { placeholder: "e.g. JR Central" }),
      text("number", words.number, LIMITS.bookingNumber, { placeholder: "e.g. Nozomi 21", code: true }),
      text("from", "From", LIMITS.bookingPlace, { placeholder: "Station or stop" }),
      text("to", "To", LIMITS.bookingPlace, { placeholder: "Station or stop" }),
      time("time", "Departs"),
      time("endTime", "Arrives"),
      endDate("Arrives on"),
      text("seat", "Seat", LIMITS.seat, { placeholder: "e.g. Car 7, 12A", code: true }),
    ]
  } else {
    specific = [time("time", "Time"), time("endTime", "Ends")]
  }

  return (
    <fieldset {...sx(bk.fields)} aria-labelledby={legendId}>
      <legend id={legendId} {...sx(a.srOnly)}>
        Booking details
      </legend>
      <SelectField
        label="Type"
        value={r.type}
        disabled={disabled}
        options={bookingTypeOptions(r.type).map((type) => ({ value: type, label: bookingTypeLabel(type) }))}
        onChange={(type) => set({ type })}
      />
      <SelectField
        label="Booking status"
        value={r.status}
        disabled={disabled}
        options={RESERVATION_STATUSES.map((status) => ({ value: status, label: RESERVATION_STATUS_LABEL[status] }))}
        onChange={(status) => set({ status })}
      />
      {specific}
      {text("confirmation", "Confirmation", LIMITS.confirmation, { placeholder: "Code or reference", code: true })}
      {text("contact", "Contact", LIMITS.contact, { placeholder: "Phone or email" })}
      <LinkField value={r.url} disabled={disabled} onChange={(url) => set({ url })} />
    </fieldset>
  )
}

function TextField({
  label,
  value,
  max,
  placeholder,
  code,
  wide,
  disabled,
  normalize,
  onChange,
}: {
  label: string
  value: string
  max: number
  placeholder?: string
  code?: boolean
  wide?: boolean
  disabled?: boolean
  /** Tidies the value when the field is left ("sfo" → "SFO"). */
  normalize?: (value: string) => string
  onChange: (value: string) => void
}) {
  return (
    <label {...sx(wide && bk.wide)}>
      <span {...sx(s.miniLabel)}>{label}</span>
      <input
        value={value}
        maxLength={max}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={code ? false : undefined}
        {...sx(a.field, code && bk.code)}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          const tidied = normalize?.(value)
          if (tidied !== undefined && tidied !== value) onChange(tidied)
        }}
      />
    </label>
  )
}

function SelectField<V extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string
  value: V
  options: { value: V; label: string }[]
  disabled?: boolean
  onChange: (value: V) => void
}) {
  return (
    <label>
      <span {...sx(s.miniLabel)}>{label}</span>
      <Select label={label} value={value} disabled={disabled} options={options} onChange={onChange} />
    </label>
  )
}

/** A https link, saved when it is one: "example.com/b/1" gains https://, anything else is refused in place. */
function LinkField({ value, disabled, onChange }: { value: string | undefined; disabled?: boolean; onChange: (url: string | undefined) => void }) {
  const id = useId()
  const [text, setText] = useState(value ?? "")
  const [bad, setBad] = useState(false)
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setText(value ?? "")
    setBad(false)
  }
  const commit = () => {
    const cleaned = cleanLinkInput(text)
    if (!cleaned.ok) {
      setBad(true)
      return
    }
    setBad(false)
    setText(cleaned.value ?? "")
    if (cleaned.value !== value) onChange(cleaned.value)
  }
  return (
    <div {...sx(bk.wide)}>
      <label htmlFor={id} {...sx(s.miniLabel)}>
        Booking link
      </label>
      <input
        id={id}
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        value={text}
        maxLength={LIMITS.reservationUrl}
        disabled={disabled}
        placeholder="https://…"
        aria-invalid={bad || undefined}
        aria-describedby={bad ? `${id}-error` : undefined}
        {...sx(a.field)}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            commit()
          }
        }}
      />
      {bad && (
        <span id={`${id}-error`} {...sx(a.errorText)} role="alert" style={{ display: "block" }}>
          Only https:// links can be saved.
        </span>
      )}
    </div>
  )
}
