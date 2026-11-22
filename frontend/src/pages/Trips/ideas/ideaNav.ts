import { useEffect, useRef } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { useLatestCallback } from "../../../hooks/useLatestCallback"
import { IDEA_ADD_PARAM, IDEA_PARAM, withIdea, type IdeaOpener } from "./contract"

// Opening and closing an idea's details (or its day picker) through the URL,
// so Back behaves: opening pushes one history entry and marks it; closing
// goes back when the entry is one this page pushed, so Back never meets a
// dead entry, and replaces otherwise (a pasted `?idea=` link, whose earlier
// entry may be another site). Moving between the details and the picker, or
// to another idea while one is open, replaces and keeps the mark. Anything
// else that replaces the URL while a place is open (an overview tab) goes
// through `replaceClosing`, so the place's entry goes with it.
//
// The router shows a navigation a moment after the browser makes it (Back
// lands on `popstate`; every navigation commits in a transition). Acting on
// what is shown meanwhile would push twice, or replace the wrong entry, so
// every call made then is held, in order, and made once the next entry shows.
// One navigation per entry: a held call that navigates makes the rest wait
// for the entry it leads to.

const MARK = "wishlistIdea"

interface Mark {
  from: IdeaOpener
  /** This entry was pushed by opening: closing goes back to the one before it. */
  pushed: boolean
}

function markOf(state: unknown): Mark | null {
  const mark = (state as Record<string, unknown> | null)?.[MARK] as Partial<Mark> | undefined
  if (mark?.from !== "row" && mark?.from !== "map") return null
  return { from: mark.from, pushed: mark.pushed === true }
}

const marked = (mark: Mark) => ({ [MARK]: mark })

/** Who opened the idea named in the URL, when this page did; null for a pasted link. */
export function ideaOpenedFrom(state: unknown): IdeaOpener | null {
  return markOf(state)?.from ?? null
}

/** The history state of an entry opened by `from` (tests, and anything that navigates by hand). */
export function ideaOpenState(from: IdeaOpener, pushed = true) {
  return marked({ from, pushed })
}

/**
 * The entry a Back was sent from, until another entry shows. Shared by every
 * caller (the list, the map and the overlay each hold their own hook), so a
 * second close from anywhere never goes back twice and leaves the trip.
 *
 * It has no deadline on purpose. A Back is sent only from an entry this page
 * pushed, so it always lands; a timer could only fire early, on a main thread
 * busy for longer than it, and the next close would then send a second Back.
 */
let backFrom: string | null = null

/** The browser's own record of the current entry, which leads what the router shows. */
const liveEntry = () => window.history.state as { key?: unknown; idx?: unknown } | null

/** A call to make on the entry shown now, or once the next one shows. */
type Call =
  | { call: "open"; ideaId: string; from: IdeaOpener; add?: boolean }
  | { call: "show"; ideaId: string; add?: boolean }
  /** Closes only if this is still what is open (a held close lapses when another place took over). */
  | { call: "close"; ideaId: string | null; add: string | null }
  | { call: "replace"; update: (prev: URLSearchParams) => URLSearchParams }

export function useIdeaNav() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  /** Calls made while a navigation was on its way, oldest first. */
  const held = useRef<Call[]>([])

  /**
   * Whether the browser is on an entry the router has yet to show: a Back is
   * on its way, or a navigation is waiting for its transition to commit. A
   * page's first entry has no key in `history.state` until something navigates.
   */
  const pending = () => {
    if (backFrom === location.key) return true
    const live = liveEntry()?.key
    return typeof live === "string" && live !== location.key
  }

  /** Back to the entry before this one, when this page pushed it and it is not the first. */
  const goBack = () => {
    if (!markOf(location.state)?.pushed) return false
    const idx = liveEntry()?.idx
    if (typeof idx === "number" && idx < 1) return false
    backFrom = location.key
    navigate(-1)
    return true
  }

  /** Make `call` on the entry shown now. True when it navigated, so nothing more may happen until the next entry shows. */
  const perform = (call: Call): boolean => {
    switch (call.call) {
      case "open": {
        const { ideaId, from, add } = call
        if (params.get(IDEA_PARAM) === ideaId && (params.get(IDEA_ADD_PARAM) === "1") === Boolean(add)) return false
        const next = (prev: URLSearchParams) => withIdea(prev, ideaId, add)
        if (!params.has(IDEA_PARAM)) setParams(next, { state: ideaOpenState(from) })
        // Another idea while one is open: the same entry, so one Back still closes it.
        else setParams(next, { replace: true, state: ideaOpenState(from, markOf(location.state)?.pushed ?? false) })
        return true
      }
      case "show":
        if (params.get(IDEA_PARAM) !== call.ideaId) return false
        setParams((prev) => withIdea(prev, call.ideaId, call.add), { replace: true, state: location.state })
        return true
      case "close":
        if (params.get(IDEA_PARAM) !== call.ideaId || params.get(IDEA_ADD_PARAM) !== call.add) return false
        if (!goBack()) setParams((prev) => withIdea(prev, null), { replace: true })
        return true
      case "replace":
        // The place's own entry goes first; the change is made on the entry Back lands on.
        if (params.has(IDEA_PARAM) && goBack()) held.current.unshift(call)
        else setParams((prev) => withIdea(call.update(new URLSearchParams(prev)), null), { replace: true })
        return true
    }
  }

  /** Make `call` now, or after the calls already held, once the navigation on its way shows. */
  const request = (call: Call) => {
    if (pending() || held.current.length > 0) held.current.push(call)
    else perform(call)
  }

  /** Open `ideaId`'s details (or, with `add`, its day picker). Nothing happens when they are already open. */
  const open = useLatestCallback((ideaId: string, from: IdeaOpener, add?: boolean) => request({ call: "open", ideaId, from, add }))

  /** Switch between the open idea's details and its picker, keeping the entry and its mark. */
  const show = useLatestCallback((ideaId: string, add?: boolean) => request({ call: "show", ideaId, add }))

  /**
   * Close what is open. With `ideaId`, only while that idea is the one open:
   * a popover's close can land after another idea opened (a fast press on
   * another row reads to it as a press outside, and its timer outlives the
   * switch), and must not close the new one.
   */
  const close = useLatestCallback((ideaId?: string) => {
    if (!params.has(IDEA_PARAM)) return
    if (ideaId !== undefined && params.get(IDEA_PARAM) !== ideaId) return
    // A Back already on its way closes it.
    if (backFrom === location.key) return
    // Made while another entry is on its way (a press outside that opened
    // another idea, a tab, or a Back from the browser), the close still
    // stands if the same thing is open once that shows, and lapses if not.
    request({ call: "close", ideaId: params.get(IDEA_PARAM), add: params.get(IDEA_ADD_PARAM) })
  })

  /**
   * Replace the URL with `update` (an overview tab, say), closing any open
   * idea with it: an entry this page pushed is gone back from first, and the
   * change made on the entry Back lands on, so the visit keeps one entry.
   */
  const replaceClosing = useLatestCallback((update: (prev: URLSearchParams) => URLSearchParams) => request({ call: "replace", update }))

  const settle = useLatestCallback(() => {
    if (backFrom !== null && backFrom !== location.key) backFrom = null
    const queue = held.current
    while (queue.length > 0 && !pending()) {
      if (perform(queue.shift()!)) break
    }
  })
  useEffect(() => settle(), [location.key, settle])

  return { open, show, close, replaceClosing }
}
