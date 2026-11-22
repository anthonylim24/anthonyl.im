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
// every call made then waits for the next entry to show and runs again there.

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
 */
let backFrom: string | null = null
/** How long a Back may take to land before the page stops waiting for it. */
const BACK_LANDS_MS = 1000

/** The browser's own record of the current entry, which leads what the router shows. */
const liveEntry = () => window.history.state as { key?: unknown; idx?: unknown } | null

/** A call made while a navigation was on its way, made again once it shows. */
type Later =
  | { call: "open"; ideaId: string; from: IdeaOpener; add?: boolean }
  | { call: "show"; ideaId: string; add?: boolean }
  /** Closes only if the same thing is still open then. */
  | { call: "close"; ideaId: string | null; add: string | null }
  | { call: "replace"; update: (prev: URLSearchParams) => URLSearchParams }

export function useIdeaNav() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const deferred = useRef<Later | null>(null)

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
    const from = location.key
    backFrom = from
    setTimeout(() => {
      if (backFrom === from) backFrom = null
    }, BACK_LANDS_MS)
    navigate(-1)
    return true
  }

  /** Open `ideaId`'s details (or, with `add`, its day picker). Nothing happens when they are already open. */
  const open = useLatestCallback((ideaId: string, from: IdeaOpener, add?: boolean) => {
    if (pending()) {
      deferred.current = { call: "open", ideaId, from, add }
      return
    }
    if (params.get(IDEA_PARAM) === ideaId && (params.get(IDEA_ADD_PARAM) === "1") === Boolean(add)) return
    const next = (prev: URLSearchParams) => withIdea(prev, ideaId, add)
    if (!params.has(IDEA_PARAM)) {
      setParams(next, { state: ideaOpenState(from) })
      return
    }
    // Another idea while one is open: the same entry, so one Back still closes it.
    setParams(next, { replace: true, state: ideaOpenState(from, markOf(location.state)?.pushed ?? false) })
  })

  /** Switch between the open idea's details and its picker, keeping the entry and its mark. */
  const show = useLatestCallback((ideaId: string, add?: boolean) => {
    if (pending()) {
      deferred.current = { call: "show", ideaId, add }
      return
    }
    if (params.get(IDEA_PARAM) !== ideaId) return
    setParams((prev) => withIdea(prev, ideaId, add), { replace: true, state: location.state })
  })

  const close = useLatestCallback(() => {
    if (!params.has(IDEA_PARAM) && !params.has(IDEA_ADD_PARAM)) return
    // A Back already on its way closes it.
    if (backFrom === location.key) return
    if (pending()) {
      // A press outside that opened another idea, a tab, or a Back from the
      // browser: the close still stands if the same thing is open once that
      // shows, and lapses if not.
      deferred.current = { call: "close", ideaId: params.get(IDEA_PARAM), add: params.get(IDEA_ADD_PARAM) }
      return
    }
    if (goBack()) return
    setParams((prev) => withIdea(prev, null), { replace: true })
  })

  /**
   * Replace the URL with `update` (an overview tab, say), closing any open
   * idea with it: an entry this page pushed is gone back from first, and the
   * change made on the entry Back lands on, so the visit keeps one entry.
   */
  const replaceClosing = useLatestCallback((update: (prev: URLSearchParams) => URLSearchParams) => {
    if (pending() || (params.has(IDEA_PARAM) && goBack())) {
      deferred.current = { call: "replace", update }
      return
    }
    setParams((prev) => withIdea(update(new URLSearchParams(prev)), null), { replace: true })
  })

  const settle = useLatestCallback(() => {
    if (backFrom !== null && backFrom !== location.key) backFrom = null
    const later = deferred.current
    deferred.current = null
    if (later?.call === "open") open(later.ideaId, later.from, later.add)
    else if (later?.call === "show") show(later.ideaId, later.add)
    else if (later?.call === "replace") replaceClosing(later.update)
    else if (later?.call === "close" && params.get(IDEA_PARAM) === later.ideaId && params.get(IDEA_ADD_PARAM) === later.add) close()
  })
  useEffect(() => settle(), [location.key, settle])

  return { open, show, close, replaceClosing }
}
