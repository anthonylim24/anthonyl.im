import { describe, expect, it } from "vitest"
import { useState } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import type { Money } from "../../types"
import { CostField } from "../CostField"

function renderField(initial?: Money) {
  const reports: Array<Money | undefined> = []
  let set: (next?: Money) => void = () => {}
  function Harness() {
    const [value, setValue] = useState<Money | undefined>(initial)
    set = setValue
    return (
      <CostField
        value={value}
        defaultCurrency="EUR"
        onChange={(next) => {
          reports.push(next)
          setValue(next)
        }}
      />
    )
  }
  render(<Harness />)
  return { reports, setFromOutside: (next?: Money) => set(next) }
}

const amountBox = () => screen.getByRole("textbox", { name: "Cost" })
const currencyBox = () => screen.getByRole("combobox", { name: "Cost currency" })

describe("CostField", () => {
  it("reports what is typed and tidies it on blur", () => {
    const { reports } = renderField()
    fireEvent.change(amountBox(), { target: { value: "1200,5" } })
    expect(reports[reports.length - 1]).toEqual({ amount: 1200.5, currency: "EUR" })
    expect(amountBox()).toHaveValue("1200,5")
    fireEvent.blur(amountBox())
    expect(amountBox()).toHaveValue("1,200.50")
  })

  it("keeps a half-typed amount as typed", () => {
    const { reports } = renderField()
    fireEvent.change(amountBox(), { target: { value: "12." } })
    expect(amountBox()).toHaveValue("12.")
    expect(reports[reports.length - 1]).toEqual({ amount: 12, currency: "EUR" })
  })

  it("reports nothing once cleared", () => {
    const { reports } = renderField({ amount: 40, currency: "EUR" })
    expect(amountBox()).toHaveValue("40")
    fireEvent.change(amountBox(), { target: { value: "" } })
    expect(reports[reports.length - 1]).toBeUndefined()
    expect(reports).toHaveLength(1)
  })

  it("changes the currency of an amount", () => {
    const { reports } = renderField({ amount: 12.5, currency: "EUR" })
    fireEvent.change(currencyBox(), { target: { value: "JPY" } })
    expect(reports[reports.length - 1]).toEqual({ amount: 13, currency: "JPY" })
  })

  it("remembers a currency picked before the amount is typed", () => {
    const { reports } = renderField()
    fireEvent.change(currencyBox(), { target: { value: "KRW" } })
    expect(reports).toHaveLength(0)
    fireEvent.change(amountBox(), { target: { value: "42,000" } })
    expect(reports[reports.length - 1]).toEqual({ amount: 42000, currency: "KRW" })
  })

  it("says so when the text isn't an amount, and stores none", () => {
    const { reports } = renderField({ amount: 5, currency: "EUR" })
    fireEvent.change(amountBox(), { target: { value: "1.2.3" } })
    expect(reports[reports.length - 1]).toBeUndefined()
    fireEvent.blur(amountBox())
    expect(amountBox()).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByText("Enter an amount, like 12.50")).toBeInTheDocument()
  })

  it("takes a new value from outside, such as Undo", () => {
    const { setFromOutside } = renderField({ amount: 5, currency: "EUR" })
    fireEvent.change(amountBox(), { target: { value: "7" } })
    act(() => setFromOutside({ amount: 300, currency: "USD" }))
    expect(amountBox()).toHaveValue("300")
    expect(currencyBox()).toHaveValue("USD")
  })
})
