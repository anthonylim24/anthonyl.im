import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { DateRange, formatRangeLong } from "../components/DateRange"

const onChange = vi.fn()

/** Controlled host, like the create form and the details dialog. */
function Host({ start = "2026-12-04", end = "2026-12-08", ...rest }: { start?: string; end?: string; disabled?: boolean; invalid?: boolean; label?: string }) {
  const [range, setRange] = useState({ start, end })
  return (
    <div>
      <DateRange
        start={range.start}
        end={range.end}
        onChange={(from, to) => {
          onChange(from, to)
          setRange({ start: from, end: to })
        }}
        {...rest}
      />
      <button type="button">Outside</button>
    </div>
  )
}

const trigger = () => screen.getByRole("button", { name: /Change dates$/ })
const panel = () => within(screen.getByRole("dialog", { name: "Choose dates" }))
const day = (name: string) => panel().getByRole("button", { name })
const pressed = () =>
  panel()
    .getAllByRole("button", { pressed: true })
    .map((b) => b.getAttribute("aria-label"))

afterEach(() => {
  vi.clearAllMocks()
})

describe("formatRangeLong", () => {
  it("prints one day once and a range with an arrow", () => {
    expect(formatRangeLong("2026-12-04", "2026-12-04")).toBe("Fri, Dec 4")
    expect(formatRangeLong("2026-12-04", "2026-12-08")).toBe("Fri, Dec 4 → Tue, Dec 8")
    expect(formatRangeLong("2026-12-30", "2027-01-02")).toBe("Wed, Dec 30 → Sat, Jan 2")
  })
})

describe("DateRange", () => {
  it("summarises the range on a closed trigger", () => {
    render(<Host />)
    expect(trigger()).toHaveAccessibleName("Dates: Fri, Dec 4 → Tue, Dec 8, 5 days. Change dates")
    expect(trigger()).toHaveTextContent("Fri, Dec 4 → Tue, Dec 8")
    expect(trigger()).toHaveTextContent("5 days")
    expect(trigger()).toHaveAttribute("aria-expanded", "false")
    expect(trigger()).toHaveAttribute("aria-haspopup", "dialog")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("uses a custom label for the trigger and the calendar", () => {
    render(<Host label="Trip dates" start="2026-12-04" end="2026-12-04" />)
    expect(trigger()).toHaveAccessibleName("Trip dates: Fri, Dec 4, 1 day. Change dates")
    fireEvent.click(trigger())
    expect(screen.getByRole("dialog", { name: "Choose trip dates" })).toBeInTheDocument()
  })

  it("opens on the start month and the one after, with the current range marked", () => {
    render(<Host />)
    fireEvent.click(trigger())

    expect(trigger()).toHaveAttribute("aria-expanded", "true")
    expect(panel().getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual(["December 2026", "January 2027"])
    expect(panel().getByRole("status")).toHaveTextContent("Pick the first day")
    expect(pressed()).toEqual(["Friday, December 4, 2026", "Tuesday, December 8, 2026"])
    // 31 days in each of the two months.
    expect(within(panel().getByRole("group", { name: "December 2026" })).getAllByRole("button")).toHaveLength(31)
    expect(within(panel().getByRole("group", { name: "January 2027" })).getAllByRole("button")).toHaveLength(31)
  })

  it("focuses the start day on opening, so the arrow keys work straight away", async () => {
    render(<Host />)
    fireEvent.click(trigger())
    await waitFor(() => expect(day("Friday, December 4, 2026")).toHaveFocus())

    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" })
    await waitFor(() => expect(day("Saturday, December 5, 2026")).toHaveFocus())
  })

  it("keeps a single tab stop among the days, which follows the keyboard cursor", async () => {
    render(<Host />)
    fireEvent.click(trigger())
    const stops = () =>
      panel()
        .getAllByRole("button")
        .filter((b) => b.hasAttribute("data-day") && b.getAttribute("tabindex") === "0")
        .map((b) => b.getAttribute("aria-label"))

    expect(stops()).toEqual(["Friday, December 4, 2026"])
    expect(day("Saturday, December 5, 2026")).toHaveAttribute("tabindex", "-1")

    await waitFor(() => expect(day("Friday, December 4, 2026")).toHaveFocus())
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" })
    await waitFor(() => expect(day("Friday, December 11, 2026")).toHaveFocus())
    expect(stops()).toEqual(["Friday, December 11, 2026"])
  })

  it("lays out a leap February with 29 days", () => {
    render(<Host start="2028-02-10" end="2028-02-12" />)
    fireEvent.click(trigger())
    const february = within(panel().getByRole("group", { name: "February 2028" }))
    expect(february.getAllByRole("button")).toHaveLength(29)
    expect(february.getByRole("button", { name: "Tuesday, February 29, 2028" })).toBeInTheDocument()
  })

  it("takes the first click as the first day and the second as the last, then closes", () => {
    render(<Host />)
    fireEvent.click(trigger())

    fireEvent.click(day("Thursday, December 10, 2026"))
    expect(onChange).not.toHaveBeenCalled()
    expect(panel().getByRole("status")).toHaveTextContent("Now pick the last day")
    expect(pressed()).toEqual(["Thursday, December 10, 2026"])

    fireEvent.click(day("Monday, December 14, 2026"))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith("2026-12-10", "2026-12-14")
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(trigger()).toHaveAccessibleName("Dates: Thu, Dec 10 → Mon, Dec 14, 5 days. Change dates")
    expect(trigger()).toHaveFocus()
  })

  it("orders the two clicks, so picking backwards still gives a valid range", () => {
    render(<Host />)
    fireEvent.click(trigger())
    fireEvent.click(day("Monday, December 14, 2026"))
    fireEvent.click(day("Thursday, December 10, 2026"))
    expect(onChange).toHaveBeenCalledWith("2026-12-10", "2026-12-14")
  })

  it("makes a one-day trip from clicking the same day twice", () => {
    render(<Host />)
    fireEvent.click(trigger())
    fireEvent.click(day("Sunday, December 20, 2026"))
    fireEvent.click(day("Sunday, December 20, 2026"))
    expect(onChange).toHaveBeenCalledWith("2026-12-20", "2026-12-20")
    expect(trigger()).toHaveAccessibleName("Dates: Sun, Dec 20, 1 day. Change dates")
  })

  it("previews the range while hovering towards the last day", () => {
    render(<Host />)
    fireEvent.click(trigger())
    fireEvent.click(day("Thursday, December 10, 2026"))

    fireEvent.mouseEnter(day("Saturday, December 12, 2026"))
    expect(pressed()).toEqual(["Thursday, December 10, 2026", "Saturday, December 12, 2026"])
    fireEvent.mouseEnter(day("Tuesday, December 8, 2026"))
    expect(pressed()).toEqual(["Tuesday, December 8, 2026", "Thursday, December 10, 2026"])
    expect(onChange).not.toHaveBeenCalled()
  })

  it("pages through months and can pick across them", () => {
    render(<Host />)
    fireEvent.click(trigger())

    fireEvent.click(panel().getByRole("button", { name: "Later months" }))
    expect(panel().getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual(["January 2027", "February 2027"])
    fireEvent.click(panel().getByRole("button", { name: "Earlier months" }))
    fireEvent.click(panel().getByRole("button", { name: "Earlier months" }))
    expect(panel().getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual(["November 2026", "December 2026"])

    fireEvent.click(day("Monday, November 30, 2026"))
    fireEvent.click(day("Wednesday, December 2, 2026"))
    expect(onChange).toHaveBeenCalledWith("2026-11-30", "2026-12-02")
  })

  it("moves between days with the arrow keys", async () => {
    render(<Host />)
    fireEvent.click(trigger())
    const from = day("Thursday, December 10, 2026")
    from.focus()

    fireEvent.keyDown(from, { key: "ArrowRight" })
    await waitFor(() => expect(day("Friday, December 11, 2026")).toHaveFocus())
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" })
    await waitFor(() => expect(day("Friday, December 18, 2026")).toHaveFocus())
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" })
    await waitFor(() => expect(day("Thursday, December 17, 2026")).toHaveFocus())
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" })
    await waitFor(() => expect(day("Thursday, December 10, 2026")).toHaveFocus())
    expect(onChange).not.toHaveBeenCalled()
  })

  it("follows the arrow keys into a month that isn't showing", async () => {
    render(<Host />)
    fireEvent.click(trigger())
    const first = day("Tuesday, December 1, 2026")
    first.focus()

    fireEvent.keyDown(first, { key: "ArrowLeft" })
    await waitFor(() => expect(day("Monday, November 30, 2026")).toHaveFocus())
    expect(panel().getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual(["November 2026", "December 2026"])
  })

  it("picks a range from the keyboard", async () => {
    render(<Host />)
    fireEvent.click(trigger())
    const from = day("Thursday, December 10, 2026")
    from.focus()
    fireEvent.click(from)

    fireEvent.keyDown(from, { key: "ArrowDown" })
    await waitFor(() => expect(day("Thursday, December 17, 2026")).toHaveFocus())
    expect(pressed()).toEqual(["Thursday, December 10, 2026", "Thursday, December 17, 2026"])
    fireEvent.click(document.activeElement!)
    expect(onChange).toHaveBeenCalledWith("2026-12-10", "2026-12-17")
  })

  it("closes on Escape without changing anything, and forgets a half-made pick", () => {
    render(<Host />)
    fireEvent.click(trigger())
    fireEvent.click(day("Thursday, December 10, 2026"))

    fireEvent.keyDown(day("Thursday, December 10, 2026"), { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
    expect(trigger()).toHaveFocus()
    expect(trigger()).toHaveAccessibleName("Dates: Fri, Dec 4 → Tue, Dec 8, 5 days. Change dates")

    fireEvent.click(trigger())
    expect(panel().getByRole("status")).toHaveTextContent("Pick the first day")
    expect(pressed()).toEqual(["Friday, December 4, 2026", "Tuesday, December 8, 2026"])
  })

  it("closes when the trigger is clicked again or the pointer goes outside", () => {
    render(<Host />)
    fireEvent.click(trigger())
    fireEvent.click(trigger())
    expect(screen.queryByRole("dialog")).toBeNull()

    fireEvent.click(trigger())
    fireEvent.pointerDown(day("Thursday, December 10, 2026"))
    expect(screen.getByRole("dialog", { name: "Choose dates" })).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it("reopens on the month of the new start", () => {
    render(<Host />)
    fireEvent.click(trigger())
    fireEvent.click(panel().getByRole("button", { name: "Later months" }))
    fireEvent.click(day("Monday, February 1, 2027"))
    fireEvent.click(day("Wednesday, February 3, 2027"))

    fireEvent.click(trigger())
    expect(panel().getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual(["February 2027", "March 2027"])
    expect(pressed()).toEqual(["Monday, February 1, 2027", "Wednesday, February 3, 2027"])
  })

  it("can be disabled or flagged invalid", () => {
    const { unmount } = render(<Host disabled />)
    expect(trigger()).toBeDisabled()
    expect(trigger()).not.toHaveAttribute("aria-invalid")
    unmount()

    render(<Host invalid />)
    expect(trigger()).toHaveAttribute("aria-invalid", "true")
    expect(trigger()).toBeEnabled()
  })
})
