import { useEffect, useState } from "react"
import { Check, Copy, ExternalLink } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { copyText } from "../print/copyItinerary"
import type { ItineraryItem, Trip, TripDay } from "../types"
import { Parts } from "../workspace/Parts"
import { bk } from "./bookings.stylex"
import { reservationOf } from "./kinds"
import { bookingLines, contactHref, httpsUrl, linkHost } from "./lines"

type Props = { item: ItineraryItem; trip: Pick<Trip, "timezone">; day: Pick<TripDay, "date" | "timezone"> }

const STATUS_NOTE = { tentative: "Tentative", pending: "Pending: not confirmed yet" } as const

/**
 * A booking's lines alone, with nothing to press: for inside a link (the
 * overview's bookings list), where a button or a second link can't go.
 */
export function BookingSummaryLines({ item, trip, day }: Props) {
  const lines = bookingLines(item, { trip, day })
  const status = reservationOf(item).status
  if (lines.length === 0 && status === "confirmed") return null
  return (
    <span {...sx(bk.lines)}>
      {lines.map((line, i) => (
        <span key={i} {...sx(bk.line, i === 0 && bk.lineLead)}>
          <Parts parts={line.split(" · ")} />
        </span>
      ))}
      {status !== "confirmed" && <span {...sx(bk.line)}>{STATUS_NOTE[status]}</span>}
    </span>
  )
}

/**
 * The read view of a booking: its lines, then the confirmation (with Copy),
 * a contact to call or write to, and its https link. Nothing here edits.
 */
export function BookingSummary({ item, trip, day }: Props) {
  const r = reservationOf(item)
  const confirmation = r.confirmation?.trim()
  const contact = r.contact?.trim()
  const call = contactHref(contact)
  const url = httpsUrl(r.url)
  return (
    <div {...sx(bk.summary)}>
      <BookingSummaryLines item={item} trip={trip} day={day} />
      {(confirmation || contact || url) && (
        <dl {...sx(bk.facts)}>
          {confirmation && (
            <>
              <dt {...sx(bk.factLabel)}>Confirmation</dt>
              <dd {...sx(bk.factValue)}>
                <span {...sx(bk.code, a.wrap)}>{confirmation}</span>
                <CopyButton text={confirmation} />
              </dd>
            </>
          )}
          {contact && (
            <>
              <dt {...sx(bk.factLabel)}>Contact</dt>
              <dd {...sx(bk.factValue)}>
                {call ? (
                  <a href={call} {...sx(a.link, a.wrap)}>
                    {contact}
                  </a>
                ) : (
                  <span {...sx(a.wrap)}>{contact}</span>
                )}
              </dd>
            </>
          )}
          {url && (
            <>
              <dt {...sx(bk.factLabel)}>Booking</dt>
              <dd {...sx(bk.factValue)}>
                <a href={url} target="_blank" rel="noreferrer noopener" {...sx(a.link, a.wrap)}>
                  {linkHost(url)}
                  <ExternalLink size={12} strokeWidth={2} aria-hidden style={{ display: "inline", marginLeft: 4, verticalAlign: "-1px" }} />
                </a>
              </dd>
            </>
          )}
        </dl>
      )}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [said, setSaid] = useState<"" | "Copied" | "Couldn’t copy">("")
  useEffect(() => {
    if (!said) return
    const timer = setTimeout(() => setSaid(""), 2000)
    return () => clearTimeout(timer)
  }, [said])
  return (
    <>
      <button
        type="button"
        {...sx(a.iconBtn, a.iconBtnSm)}
        aria-label={`Copy confirmation ${text}`}
        onClick={() => void copyText(text).then((result) => setSaid(result === "copied" ? "Copied" : "Couldn’t copy"))}
      >
        {said === "Copied" ? <Check size={15} strokeWidth={2} aria-hidden /> : <Copy size={15} strokeWidth={1.75} aria-hidden />}
      </button>
      <span role="status" {...sx(bk.copied)}>
        {said}
      </span>
    </>
  )
}
