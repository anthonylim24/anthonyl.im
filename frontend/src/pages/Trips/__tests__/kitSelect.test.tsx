import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Select } from "../components/Select"
import { pickOption } from "./pickOption"

const OPTIONS = [
  { value: "", label: "No date" },
  { value: "day-1", label: "Fri 10 Jul" },
  { value: "day-2", label: "Sat 11 Jul", hint: "2 nights" },
]

function Harness({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState("day-1")
  return (
    <Select
      label="Day"
      value={value}
      options={OPTIONS}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

describe("Select", () => {
  it("shows the chosen label and hands back the value picked, an empty one too", () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const day = screen.getByRole("combobox", { name: "Day" })
    expect(day).toHaveTextContent("Fri 10 Jul")

    pickOption(day, /Sat 11 Jul/)
    expect(onChange).toHaveBeenLastCalledWith("day-2")
    expect(day).toHaveTextContent("Sat 11 Jul")
    expect(screen.queryByRole("listbox")).toBeNull()

    pickOption(day, "No date")
    expect(onChange).toHaveBeenLastCalledWith("")
    expect(day).toHaveTextContent("No date")
  })

  it("opens on the current choice, in the Trips token scope on <body>", async () => {
    render(<Harness onChange={() => {}} />)
    fireEvent.click(screen.getByRole("combobox", { name: "Day" }))
    const list = screen.getByRole("listbox")
    expect(list.closest(".trips.trips-portal")).not.toBeNull()
    await waitFor(() => expect(screen.getByRole("option", { name: "Fri 10 Jul" })).toHaveFocus())
    expect(screen.getByRole("option", { name: /Sat 11 Jul/ })).toHaveTextContent("2 nights")
  })

  it("shows the placeholder while nothing is chosen", () => {
    render(<Select label="Day" value="day-9" placeholder="Choose a day" options={OPTIONS} onChange={() => {}} />)
    expect(screen.getByRole("combobox", { name: "Day" })).toHaveTextContent("Choose a day")
  })
})
