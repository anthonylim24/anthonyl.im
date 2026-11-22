import { useEffect, useRef } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { useLatestCallback } from "../../../hooks/useLatestCallback"
import { IDEA_ADD_PARAM, IDEA_PARAM, withIdea, type IdeaOpener } from "./contract"

// Opening and closing an idea's details (or its day picker) through the URL,
// so Back behaves: opening pushes one history entry and marks it; closing
// goes back when the entry is one this page pushed, so Back never meets a
// dead entry, and replaces otherwise (a pasted `?idea=` link, whose earlier
// entry may be another site). Moving between the details and the picker, or
// to another idea while one is open, replaces and keeps the mark.

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

export function useIdeaNav() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  /**
   * The entry a Back was already sent from. In a browser, Back lands a moment
   * later; a second close before then (a removal, then the effect that sees
   * the idea gone) must not go back twice and leave the trip.
   */
  const backFrom = useRef<string | null>(null)
  /**
   * A close asked for while the browser was already on an entry React had yet
   * to show, and what was open then. Settled once the next entry shows.
   */
  const deferred = useRef<{ idea: string | null; add: string | null } | null>(null)

  /** Open `ideaId`'s details (or, with `add`, its day picker). Nothing happens when they are already open. */
  const open = useLatestCallback((ideaId: string, from: IdeaOpener, add?: boolean) => {
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
    setParams((prev) => withIdea(prev, ideaId, add), { replace: true, state: location.state })
  })

  const close = useLatestCallback(() => {
    if (!params.has(IDEA_PARAM) && !params.has(IDEA_ADD_PARAM)) return
    // The browser is already on another entry that React has yet to show (the
    // router commits navigations in a transition): a press outside that opened
    // another idea, or a Back on its way. What is open is about to change, and
    // closing it now would undo that navigation.
    // Once it shows, the close still stands if the same thing is open there (a
    // tab that kept `?idea`), and lapses if not.
    const live = (window.history.state as { key?: unknown } | null)?.key
    if (typeof live === "string" && live !== location.key) {
      deferred.current = { idea: params.get(IDEA_PARAM), add: params.get(IDEA_ADD_PARAM) }
      return
    }
    if (markOf(location.state)?.pushed) {
      if (backFrom.current === location.key) return
      backFrom.current = location.key
      navigate(-1)
      return
    }
    setParams((prev) => withIdea(prev, null), { replace: true })
  })

  const settle = useLatestCallback(() => {
    if (backFrom.current !== location.key) backFrom.current = null
    const wanted = deferred.current
    if (!wanted) return
    deferred.current = null
    if (params.get(IDEA_PARAM) === wanted.idea && params.get(IDEA_ADD_PARAM) === wanted.add) close()
  })
  useEffect(() => settle(), [location.key, settle])

  return { open, show, close }
}
