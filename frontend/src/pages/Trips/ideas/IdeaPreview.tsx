import { useState } from "react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import type { ItineraryItem, Trip } from "../types"
import { ideaPreview } from "./preview"
import { pv } from "./preview.stylex"
import { THEMES } from "./themes"

// What a wishlist pin's preview card says on the map: the category the
// Wishlist tab files it under and where it is, its name, the street, the
// first line of the traveller's notes, and a photo only when its details
// already loaded one. Read when the card shows, so it is never stale and
// never fetches.

export function IdeaPreview({ idea, trip, via }: { idea: ItineraryItem; trip: Pick<Trip, "days" | "destinations">; via: "pointer" | "focus" }) {
  const preview = ideaPreview(idea, trip)
  const [broken, setBroken] = useState(false)
  const { label, icon: Icon } = THEMES[preview.theme]
  const photo = broken ? null : preview.photo
  return (
    <>
      {photo && (
        <>
          <div {...sx(pv.frame)}>
            <img src={photo.url} alt="" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} {...sx(pv.img)} />
          </div>
          {photo.author && <p {...sx(pv.credit)}>Photo: {photo.author.name}</p>}
        </>
      )}
      <div {...sx(pv.body)}>
        <p {...sx(a.eyebrow, pv.eyebrow)}>
          <Icon size={12} strokeWidth={2} aria-hidden {...sx(pv.mark)} />
          <span {...sx(pv.eyebrowText)}>{[label, preview.area].filter(Boolean).join(" · ")}</span>
        </p>
        <p {...sx(a.display, pv.name)}>{preview.name}</p>
        {preview.street && <p {...sx(pv.street)}>{preview.street}</p>}
        {preview.note && <p {...sx(pv.note)}>{preview.note}</p>}
        <p {...sx(a.eyebrow, pv.hint)}>{via === "pointer" ? "Click for details" : "Enter for details"}</p>
      </div>
    </>
  )
}
