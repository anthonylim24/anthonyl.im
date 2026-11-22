import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Presence, useClosing } from "../components/presence"
import { dayFull, ideaToDay, removeIdea } from "../tripEdits"
import type { ItineraryItem } from "../types"
import { announce, prepareAnnouncer } from "./announce"
import { IDEA_ADD_PARAM, IDEA_ANCHOR_ATTR, IDEA_PARAM, withIdea, type IdeaOverlayProps } from "./contract"
import { IdeaDayPicker } from "./IdeaDayPicker"
import { IdeaDetails } from "./IdeaDetails"
import { ThemeMenu } from "./ThemeMenu"

// What the wishlist opens over the page, driven by the URL: `?idea=<id>`
// shows that idea's details, `&add=1` its day picker instead. One thing at
// a time: the picker replaces the details (and Cancel goes back to them
// when they opened it). TripWorkspace mounts this once inside a Presence
// keyed on `?idea`, so a list row and a map pin open the same thing.

interface View {
  idea: ItineraryItem
  mode: "details" | "add"
}

const ideaName = (idea: ItineraryItem) => idea.title || idea.location?.name || "Untitled place"

/** The list row an idea's details open from, if it is on the page. Compared, never put into a selector. */
function anchorFor(ideaId: string): HTMLElement | null {
  if (typeof document === "undefined") return null
  for (const node of document.querySelectorAll<HTMLElement>(`[${IDEA_ANCHOR_ATTR}]`)) {
    if (node.getAttribute(IDEA_ANCHOR_ATTR) === ideaId && node.isConnected) return node
  }
  return null
}

export function IdeaOverlay({ trip, editable, locked, getToken, onEdit }: IdeaOverlayProps) {
  const [params, setParams] = useSearchParams()
  // The surrounding Presence is letting go: `?idea` is gone and what was shown animates out.
  const closing = useClosing()
  const ideaId = params.get(IDEA_PARAM)
  const idea = ideaId ? (trip.ideas?.find((i) => i.id === ideaId) ?? null) : null
  const adding = params.get(IDEA_ADD_PARAM) === "1" && editable && !locked

  // What is on screen, held while it leaves: once `?idea` is cleared (or the
  // idea is scheduled elsewhere) there is nothing left to read it from.
  const [held, setHeld] = useState<View | null>(null)
  const live: View | null = idea ? { idea, mode: adding ? "add" : "details" } : null
  if (live && (live.idea !== held?.idea || live.mode !== held?.mode)) setHeld(live)
  const view = live ?? held

  /** The picker was opened from the details, so Cancel goes back to them. */
  const addFromDetails = useRef<string | null>(null)
  /**
   * The idea just scheduled or removed. A picker may call `onClose` straight
   * after `onPick`, in the same click, while the URL still names the idea:
   * acting on it then would open the details of a place that is now on a day.
   */
  const finished = useRef<string | null>(null)

  useEffect(prepareAnnouncer, [])

  // Opened for an idea that is not on the list (removed, or someone else put
  // it on a day): close, without leaving a history entry for it.
  useEffect(() => {
    if (ideaId && !idea) setParams((prev) => withIdea(prev, null), { replace: true })
  }, [ideaId, idea, setParams])

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

  // Each piece leaves through its own Presence, so going from the details to
  // the picker animates one out and the other in. When the whole overlay is
  // closing, both are let go.
  const details = !closing && view?.mode === "details" ? view.idea : null
  const picking = !closing && view?.mode === "add" ? view.idea : null

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
          themeControl={editable ? <ThemeMenu idea={shown} locked={locked} onEdit={onEdit} /> : undefined}
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
