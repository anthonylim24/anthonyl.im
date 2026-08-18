import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { EnhanceButton } from "../editor/EnhanceButton"

function renderButton(onRun = vi.fn()) {
  render(
    <EnhanceButton
      label="Enhance trip"
      busyLabel="Reviewing trip…"
      busy={false}
      disabled={false}
      variant="outline"
      promptPlaceholder="Optional focus"
      onRun={onRun}
    />,
  )
  return onRun
}

describe("EnhanceButton", () => {
  it("runs immediately from the primary action", () => {
    const onRun = renderButton()
    fireEvent.click(screen.getByRole("button", { name: /^Enhance trip$/ }))
    expect(onRun).toHaveBeenCalledWith(undefined)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("opens an opaque dialog with a scrim and a Run enhance action", async () => {
    const onRun = renderButton()
    fireEvent.click(screen.getByRole("button", { name: "Enhance trip with a custom focus" }))

    const dialog = screen.getByRole("dialog", { name: "Focus this review" })
    expect(dialog).toBeInTheDocument()
    expect(dialog.closest(".trips")).not.toBeNull()
    expect(dialog.className).toContain("--trips-surface")
    expect(screen.getByRole("button", { name: "Run enhance" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Optional focus"), {
      target: { value: "more local food" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Run enhance" }))
    expect(onRun).toHaveBeenCalledWith("more local food")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("closes on Escape without running", async () => {
    const onRun = renderButton()
    fireEvent.click(screen.getByRole("button", { name: "Enhance trip with a custom focus" }))
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onRun).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })
})
