import { useEffect, useReducer, useState } from "react"
import { sx } from "@/styles/merge"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { useGetToken } from "@/lib/safeAuth"
import { a } from "../atlas.stylex"
import type { ItineraryItem, Trip } from "../types"
import { prefetchPlaceDetails } from "./placeDetailsApi"
import { ideaPreview } from "./preview"
import { pv } from "./preview.stylex"
import { THEMES } from "./themes"

// The card mounts only once a mouse has rested on the pin, so the place is
// looked up then (one request per place, kept for its details). The photo's
// frame holds its room until the answer lands, so the card does not jump,
// and eases shut for a place with no photo.

/** A keyboard passes pins on its way elsewhere: a place is looked up once focus has rested on its pin this long. */
export const FOCUS_REST_MS = 400

export function IdeaPreview({ idea, trip, via }: { idea: ItineraryItem; trip: Pick<Trip, "days" | "destinations">; via: "pointer" | "focus" }) {
  const getToken = useLatestCallback(useGetToken())
  const preview = ideaPreview(idea, trip)
  const [broken, setBroken] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  // The answer lands in the session's cache, which `ideaPreview` reads: a render is all it needs.
  const [, answered] = useReducer((n: number) => n + 1, 0)
  const { lookup } = preview
  const lookupKey = lookup?.key ?? ""
  useEffect(() => {
    if (!lookup) return
    let live = true
    const timer = setTimeout(
      () =>
        prefetchPlaceDetails(getToken, lookup).then(
          () => live && answered(),
          () => live && setFailed(lookup.key),
        ),
      via === "focus" ? FOCUS_REST_MS : 0,
    )
    return () => {
      live = false
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `lookupKey` names the place; `lookup` is rebuilt on every render
  }, [lookupKey, getToken, via])

  const { label, icon: Icon } = THEMES[preview.theme]
  const photo = preview.photo && broken !== preview.photo.url ? preview.photo : null
  const waiting = lookup !== null && failed !== lookup.key
  const framed = photo !== null || waiting
  /** The place whose card has shown the photo's room: it stays, shutting, once there is no photo to put in it. */
  const [roomFor, setRoomFor] = useState<string | null>(null)
  if (framed && roomFor !== idea.id) setRoomFor(idea.id)
  return (
    <>
      {(framed || roomFor === idea.id) && (
        <div {...sx(pv.room, !framed && pv.roomGone)}>
          <div {...sx(pv.frame)}>
            {photo && (
              <>
                <img src={photo.url} alt="" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(photo.url)} {...sx(pv.img)} />
                {photo.author && <p {...sx(pv.credit)}>Photo: {photo.author.name}</p>}
              </>
            )}
          </div>
        </div>
      )}
      <div {...sx(pv.body)}>
        <p {...sx(a.eyebrow, pv.eyebrow)}>
          <Icon size={12} strokeWidth={2} aria-hidden {...sx(pv.mark)} />
          <span {...sx(pv.eyebrowText)}>{[label, preview.area].filter(Boolean).join(" · ")}</span>
        </p>
        <p {...sx(a.display, pv.name)}>{preview.name}</p>
        {preview.street && <p {...sx(pv.street)}>{preview.street}</p>}
        {preview.note && <p {...sx(pv.note)}>{preview.note}</p>}
      </div>
    </>
  )
}
