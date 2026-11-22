import { useEffect, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { Presence } from "../components/presence"
import { dayFull, ideaToDay, removeIdea } from "../tripEdits"
import type { ItineraryItem } from "../types"
import { announce, prepareAnnouncer } from "./announce"
import { IDEA_ADD_PARAM, IDEA_ANCHOR_ATTR, IDEA_PARAM, withIdea, type IdeaOverlayProps } from "./contract"
import { IdeaDayPicker } from "./IdeaDayPicker"
import { IdeaDetails } from "./IdeaDetails"
import { ThemeSelect } from "./ThemeMenu"

// What the wishlist opens over the page, driven by the URL: `?idea=<id>`
// shows that idea's details, `&add=1` its day picker instead. One thing at
// a time: the picker replaces the details (and Cancel goes back to them
// when they opened it). TripWorkspace mounts this once inside a Presence
// keyed on `?idea`, so a list row and a map pin open the same thing.

const ideaName = (idea: ItineraryItem) => idea.title || idea.location?.name || "Untitled place"

/**
 * The list row to anchor an idea's details on: its name, when it is on the
 * page and in view. A row in a hidden pane (the phone's map view) or
 * scrolled away (a map pin opened it) is no anchor: the details open as a
 * sheet. The id is compared, never put into a selector.
 */
function anchorFor(ideaId: string): HTMLElement | null {
  if (typeof document === "undefined") return null
  for (const node of document.querySelectorAll<HTMLElement>(`[${IDEA_ANCHOR_ATTR}]`)) {
    if (node.getAttribute(IDEA_ANCHOR_ATTR) !== ideaId || !node.isConnected) continue
    const box = node.getBoundingClientRect()
    const inView = box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight
    return inView ? node : null
  }
  return null
}

export function IdeaOverlay({ trip, editable, locked, getToken, onEdit }: IdeaOverlayProps) {
  const [params, setParams] = useSearchParams()
  const asked = params.has(IDEA_PARAM)
  const ideaId = params.get(IDEA_PARAM)
  const idea = ideaId ? (trip.ideas?.find((i) => i.id === ideaId) ?? null) : null
  const adding = params.get(IDEA_ADD_PARAM) === "1" && editable && !locked

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
  // on a day, or an empty `?idea=`): close, without leaving a history entry.
  useEffect(() => {
    if (asked && !idea) setParams((prev) => withIdea(prev, null), { replace: true })
  }, [asked, idea, setParams])

  // Another idea, or none: a new opening starts fresh.
  useEffect(() => {
    finished.current = null
    addFromDetails.current = null
  }, [ideaId])

  const close = () => setParams((prev) => withIdea(prev, null), { replace: true })

  const settled = (id: string) => finished.current === id
  const canChange = editable && !locked

  const onAddToDay = (target: ItineraryItem) => {
    if (!canChange || settled(target.id)) return
    addFromDetails.current = target.id
    setParams((prev) => withIdea(prev, target.id, true), { replace: true })
  }

  const onPick = (target: ItineraryItem, dayId: string) => {
    if (!canChange || settled(target.id)) return
    const index = trip.days.findIndex((day) => day.id === dayId)
    const day = trip.days[index]
    if (!day || dayFull(day)) return
    const name = ideaName(target)
    onEdit((doc) => ideaToDay(doc, target.id, dayId), { label: `Added “${name}” to day ${index + 1}`, toast: true })
    announce(`Added ${name} to day ${index + 1}`)
    finished.current = target.id
    close()
  }

  const onPickerClose = (target: ItineraryItem) => {
    if (settled(target.id)) return
    if (addFromDetails.current === target.id) {
      addFromDetails.current = null
      setParams((prev) => withIdea(prev, target.id), { replace: true })
    } else close()
  }

  const onRemove = (target: ItineraryItem) => {
    if (!canChange || settled(target.id)) return
    const name = ideaName(target)
    onEdit((doc) => removeIdea(doc, target.id), { label: `Removed “${name}” from the wishlist`, toast: true })
    announce(`Removed ${name}`)
    finished.current = target.id
    close()
  }

  const onDetailsClose = (target: ItineraryItem) => {
    if (settled(target.id)) return
    close()
  }

  // Each piece leaves through its own Presence, which keeps showing the idea
  // it last had: going from the details to the picker animates one out and
  // the other in, and once `?idea` is cleared (or the idea is gone before the
  // URL catches up) both leave with what they showed.
  const details = idea && !adding ? idea : null
  const picking = idea && adding ? idea : null

  return (
    <>
      <Presence when={details}>{(shown) => (
        <IdeaDetails
          trip={trip}
          idea={shown}
          anchor={anchorFor(shown.id)}
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
