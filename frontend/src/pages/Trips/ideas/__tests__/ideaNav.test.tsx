import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, render } from "@testing-library/react"

// A router that, like BrowserRouter in a browser, shows a navigation a moment
// after the browser has made it: `setParams` and `navigate` record the call
// and move `window.history`, and the page shows the new entry only on `land`.
interface Entry {
  search: string
  key: string
  state: unknown
}

const shown: { entry: Entry } = { entry: { search: "", key: "k1", state: null } }
const calls: { kind: "push" | "replace" | "back"; search?: string; state?: unknown }[] = []
let keys = 1

vi.mock("react-router-dom", () => ({
  useSearchParams: () => [
    new URLSearchParams(shown.entry.search),
    (next: (prev: URLSearchParams) => URLSearchParams, options: { replace?: boolean; state?: unknown } = {}) => {
      const search = next(new URLSearchParams(shown.entry.search)).toString()
      const key = `k${++keys}`
      calls.push({ kind: options.replace ? "replace" : "push", search, state: options.state })
      const idx = (window.history.state as { idx: number }).idx + (options.replace ? 0 : 1)
      window.history.replaceState({ key, idx, usr: options.state }, "")
    },
  ],
  useLocation: () => ({ search: shown.entry.search, key: shown.entry.key, state: shown.entry.state }),
  useNavigate: () => (delta: number) => calls.push({ kind: "back", search: String(delta) }),
}))

import { ideaOpenState, useIdeaNav } from "../ideaNav"

type Nav = ReturnType<typeof useIdeaNav>
const hold: { nav: Nav | null } = { nav: null }
const keep = (nav: Nav) => (hold.nav = nav)
function Probe({ onNav = keep }: { onNav?: (nav: Nav) => void }) {
  onNav(useIdeaNav())
  return null
}
/** The hook as last rendered. */
const nav = new Proxy({} as Nav, { get: (_, name: keyof Nav) => hold.nav![name] })

/** The page shows an entry: the browser's own record, then the router's. */
function land(entry: Entry, idx: number, view: ReturnType<typeof render>) {
  window.history.replaceState({ key: entry.key, idx, usr: entry.state }, "")
  shown.entry = entry
  view.rerender(<Probe />)
}

const list: Entry = { search: "tab=wishlist", key: "k1", state: null }
const opened = (idea: string): Entry => ({ search: `tab=wishlist&idea=${idea}`, key: "k-open", state: ideaOpenState("row") })

beforeEach(() => {
  calls.length = 0
  keys = 100
})
afterEach(() => window.history.replaceState(null, ""))

describe("useIdeaNav while the browser is ahead of the page", () => {
  it("adds one entry for a double press on a row", () => {
    const view = render(<Probe />)
    land(list, 1, view)
    act(() => nav.open("a", "row"))
    // The second press lands before the router shows the first.
    act(() => nav.open("a", "row"))
    expect(calls.map((c) => c.kind)).toEqual(["push"])
    land(opened("a"), 2, view)
    expect(calls.map((c) => c.kind)).toEqual(["push"])
  })

  it("opens another place pressed while a close's Back is on its way, on the entry Back lands on", () => {
    const view = render(<Probe />)
    land(opened("a"), 2, view)
    act(() => nav.close())
    act(() => nav.open("b", "row"))
    expect(calls).toEqual([{ kind: "back", search: "-1" }])
    land(list, 1, view)
    expect(calls).toHaveLength(2)
    expect(calls[1]).toMatchObject({ kind: "push", search: "tab=wishlist&idea=b", state: ideaOpenState("row") })
  })

  it("goes back once, whoever closes", () => {
    const view = render(<Probe />)
    land(opened("a"), 2, view)
    act(() => nav.close())
    act(() => nav.close())
    expect(calls).toEqual([{ kind: "back", search: "-1" }])
    land(list, 1, view)
    expect(calls).toHaveLength(1)
  })

  it("ignores a close that names a place no longer open", () => {
    const view = render(<Probe />)
    land(opened("b"), 2, view)
    // The popover of `a`, pressed outside as `b` opened, closing after `b` shows.
    act(() => nav.close("a"))
    expect(calls).toEqual([])
    act(() => nav.close("b"))
    expect(calls).toEqual([{ kind: "back", search: "-1" }])
    land(list, 1, view)
  })

  it("replaces rather than going back from a page's first entry", () => {
    const view = render(<Probe />)
    land({ ...opened("a"), key: "default" }, 0, view)
    act(() => nav.close())
    expect(calls).toEqual([{ kind: "replace", search: "tab=wishlist", state: undefined }])
  })

  it("changes the tab on the entry before an opened place, so the visit keeps one entry", () => {
    const view = render(<Probe />)
    land(opened("a"), 2, view)
    const toBudget = (params: URLSearchParams) => {
      params.set("tab", "budget")
      return params
    }
    act(() => nav.replaceClosing(toBudget))
    // The popover's own close, from the press on the tab, adds nothing.
    act(() => nav.close())
    expect(calls).toEqual([{ kind: "back", search: "-1" }])
    land(list, 1, view)
    expect(calls[1]).toEqual({ kind: "replace", search: "tab=budget", state: undefined })
  })

  it("makes a tab change and a pin pressed in the same moment both, in order", () => {
    const view = render(<Probe />)
    land(opened("a"), 2, view)
    act(() => {
      nav.replaceClosing(toTab("budget"))
      nav.open("b", "map")
    })
    expect(calls).toEqual([{ kind: "back", search: "-1" }])
    land(list, 1, view)
    // The tab first, on the entry Back lands on; the pin waits for that to show.
    expect(calls.slice(1)).toEqual([{ kind: "replace", search: "tab=budget", state: undefined }])
    land({ search: "tab=budget", key: "k-budget", state: null }, 1, view)
    expect(calls.slice(2)).toEqual([{ kind: "push", search: "tab=budget&idea=b", state: ideaOpenState("map") }])
  })

  describe("when a Back takes longer than a second to land (a busy main thread)", () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it("still goes back only once, so a second close never leaves the trip", () => {
      const view = render(<Probe />)
      land(opened("a"), 2, view)
      act(() => nav.close())
      act(() => vi.advanceTimersByTime(5000))
      act(() => nav.close())
      expect(calls).toEqual([{ kind: "back", search: "-1" }])
      land(list, 1, view)
      expect(calls).toHaveLength(1)
    })

    it("holds a press made meanwhile for the entry Back lands on", () => {
      const view = render(<Probe />)
      land({ ...opened("a"), key: "k-open-slow" }, 2, view)
      act(() => nav.close())
      act(() => vi.advanceTimersByTime(5000))
      act(() => nav.open("b", "row"))
      expect(calls).toEqual([{ kind: "back", search: "-1" }])
      land(list, 1, view)
      expect(calls.slice(1)).toEqual([{ kind: "push", search: "tab=wishlist&idea=b", state: ideaOpenState("row") }])
    })
  })

  describe("another panel's `add` (Budget's ?add=expense)", () => {
    const budget: Entry = { search: "tab=budget&add=expense", key: "k1", state: null }

    it("survives a tab change with no place open", () => {
      const view = render(<Probe />)
      land(budget, 1, view)
      act(() => nav.replaceClosing(toTab("wishlist")))
      expect(calls).toEqual([{ kind: "replace", search: "tab=wishlist&add=expense", state: undefined }])
    })

    it("is not a place: a close with none open changes nothing", () => {
      const view = render(<Probe />)
      land(budget, 1, view)
      act(() => nav.close())
      expect(calls).toEqual([])
    })
  })
})

function toTab(tab: string) {
  return (params: URLSearchParams) => {
    params.set("tab", tab)
    return params
  }
}
