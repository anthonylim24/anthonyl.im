import { useEffect, useRef } from "react"
import { useLocation, useSearchParams } from "react-router-dom"
import { Presence } from "../components/presence"
import { dayFull, ideaToDay, removeIdea } from "../tripEdits"
import type { ItineraryItem } from "../types"
import { announce, prepareAnnouncer } from "./announce"
import { IDEA_ADD_PARAM, IDEA_PARAM, ideaName, type IdeaOverlayProps } from "./contract"
import { IdeaDayPicker } from "./IdeaDayPicker"
import { IdeaDetails } from "./IdeaDetails"
import { ideaOpenedFrom, useIdeaNav } from "./ideaNav"
import { ThemeSelect } from "./ThemeMenu"

// What the wishlist opens over the page, driven by the URL: `?idea=<id>`
// shows that idea's details, `&add=1` its day picker instead. One thing at
// a time: the picker replaces the details (and Cancel goes back to them
// when they opened it). TripWorkspace mounts this once inside a Presence
// keyed on `?idea`, so a list row and a map pin open the same thing.

export function IdeaOverlay({ trip, editable, locked, getToken, onEdit }: IdeaOverlayProps) {
  const [params] = useSearchParams()
  const location = useLocation()
  const nav = useIdeaNav()
  const asked = params.has(IDEA_PARAM)
  const ideaId = params.get(IDEA_PARAM)
  const idea = ideaId ? (trip.ideas?.find((i) => i.id === ideaId) ?? null) : null
  const adding = params.get(IDEA_ADD_PARAM) === "1" && editable && !locked
  // Who opened it (a row, a map pin, or a pasted link): the details decide
  // popover or sheet from this once, when they open.
  const from = ideaOpenedFrom(location.state)

  /** The picker was opened from the details, so Cancel goes back to them. */
  const addFromDetails = useRef<string | null>(null)
  /**
   * The idea just scheduled or removed. A picker may call `onClose` straight
   * after `onPick`, in the same click, while the URL still names the idea:
   * acting on it then would open the details of a place that is now on a day.
   */
  const finished = useRef<string | null>(null)

  useEffect(prepareAnnouncer, [])

  // Opened for an idea that is not on the list (removed, someone else put it
  // on a day, or an empty `?idea=`): close.
  const { close } = nav
  useEffect(() => {
    if (asked && !idea) close()
  }, [asked, idea, close])

  // Another idea, or none: a new opening starts fresh.
  useEffect(() => {
    finished.current = null
    addFromDetails.current = null
  }, [ideaId])

  const settled = (id: string) => finished.current === id
  /**
   * Whether `piece` is what the URL shows for `target` now, and the idea is
   * not yet scheduled or removed: details or a picker on their way out (the
   * other one took over, or another idea opened) change nothing.
   */
  const showing = (target: ItineraryItem, piece: "details" | "picker") =>
    target.id === ideaId && !settled(target.id) && (piece === "picker") === adding
  const canChange = editable && !locked

  const onAddToDay = (target: ItineraryItem) => {
    if (!canChange || !showing(target, "details")) return
    addFromDetails.current = target.id
    nav.show(target.id, true)
  }

  const onPick = (target: ItineraryItem, dayId: string) => {
    if (!canChange || !showing(target, "picker")) return
    const index = trip.days.findIndex((day) => day.id === dayId)
    const day = trip.days[index]
    if (!day || dayFull(day)) return
    const name = ideaName(target)
    onEdit((doc) => ideaToDay(doc, target.id, dayId), { label: `Added “${name}” to day ${index + 1}`, toast: true })
    announce(`Added ${name} to day ${index + 1}`)
    finished.current = target.id
    close(target.id)
  }

  const onPickerClose = (target: ItineraryItem) => {
    if (!showing(target, "picker")) return
    if (addFromDetails.current === target.id) {
      addFromDetails.current = null
      nav.show(target.id)
    } else close(target.id)
  }

  const onRemove = (target: ItineraryItem) => {
    if (!canChange || !showing(target, "details")) return
    const name = ideaName(target)
    onEdit((doc) => removeIdea(doc, target.id), { label: `Removed “${name}” from the wishlist`, toast: true })
    announce(`Removed ${name}`)
    finished.current = target.id
    close(target.id)
  }

  const onDetailsClose = (target: ItineraryItem) => {
    if (showing(target, "details")) close(target.id)
  }

  // Each piece leaves through its own Presence, which keeps showing the idea
  // it last had: going from the details to the picker animates one out and
  // the other in, and once `?idea` is cleared (or the idea is gone before the
  // URL catches up) both leave with what they showed. Keyed by idea, so
  // another idea opens fresh details that decide their own anchor.
  const details = idea && !adding ? idea : null
  const picking = idea && adding ? idea : null

  return (
    <>
      <Presence when={details}>{(shown) => (
        <IdeaDetails
          key={shown.id}
          trip={trip}
          idea={shown}
          from={from}
          editable={editable}
          locked={locked}
          getToken={getToken}
          themeControl={editable ? <ThemeSelect idea={shown} locked={locked} onEdit={onEdit} /> : undefined}
          onAddToDay={() => onAddToDay(shown)}
          onRemove={() => onRemove(shown)}
          onClose={() => onDetailsClose(shown)}
        />
      )}</Presence>
      <Presence when={picking}>{(shown) => (
        <IdeaDayPicker
          trip={trip}
          idea={shown}
          getToken={getToken}
          onPick={(dayId) => onPick(shown, dayId)}
          onClose={() => onPickerClose(shown)}
        />
      )}</Presence>
    </>
  )
}
