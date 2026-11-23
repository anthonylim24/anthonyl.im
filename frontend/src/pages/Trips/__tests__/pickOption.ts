import { fireEvent, screen } from "@testing-library/react"

/** Chooses in a kit Select as a tap does: the closed control, then the option in its list. */
export function pickOption(select: HTMLElement, option: string | RegExp) {
  fireEvent.click(select)
  fireEvent.click(screen.getByRole("option", { name: option }))
}
