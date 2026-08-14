import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"

const clerkState = vi.hoisted(() => ({ enabled: false, signedIn: true }))

vi.mock("@/lib/clerk", () => ({
  get CLERK_ENABLED() {
    return clerkState.enabled
  },
}))

vi.mock("@clerk/clerk-react", () => ({
  SignedIn: ({ children }: { children: unknown }) => (clerkState.signedIn ? children : null),
  SignedOut: ({ children }: { children: unknown }) => (clerkState.signedIn ? null : children),
  SignInButton: ({ children }: { children: unknown }) => children,
  UserButton: () => <div>Account</div>,
}))

vi.mock("../../Korea/ThemeToggle", () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}))

vi.mock("../../Korea/koreaUtils", () => ({
  applyTheme: vi.fn(),
  getInitialTheme: () => "system",
}))

vi.mock("../TripChat", () => ({
  TripChat: () => <div>Trip chat</div>,
}))

import { SignedOutGate, TripsLayout } from "../TripsLayout"

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/trips" element={<TripsLayout />}>
          <Route index element={<div>Index page</div>} />
          <Route path="new" element={<div>Create page</div>} />
          <Route path=":tripId" element={<div>Trip page</div>} />
          <Route path=":tripId/day/:dayId" element={<div>Day page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe("TripsLayout", () => {
  beforeEach(() => {
    clerkState.enabled = false
    clerkState.signedIn = true
  })

  it("renders the skip link, wordmark, and theme toggle on the index", () => {
    renderAt("/trips")
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#trips-main")
    expect(screen.getByRole("link", { name: "Trips" })).toHaveAttribute("href", "/trips")
    expect(screen.queryByRole("link", { name: "All trips" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Theme" })).toBeInTheDocument()
    expect(document.getElementById("trips-main")).toBeTruthy()
  })

  it("shows a labelled All trips back link on interior routes", () => {
    renderAt("/trips/tokyo")
    const back = screen.getByRole("link", { name: "All trips" })
    expect(back).toHaveAttribute("href", "/trips")
    expect(back.querySelector("svg")).toBeTruthy()
  })

  it("pads the main column on overview and day routes, not on new", () => {
    const { unmount } = renderAt("/trips/tokyo")
    expect(document.getElementById("trips-main")?.className).toContain("pb-28")
    unmount()

    renderAt("/trips/tokyo/day/day-1")
    expect(document.getElementById("trips-main")?.className).toContain("pb-28")
  })

  it("does not add chat pad on the create route", () => {
    renderAt("/trips/new")
    expect(document.getElementById("trips-main")?.className).not.toContain("pb-28")
  })

  it("rebuilds the signed-out gate as a single-CTA split with the desk photo", () => {
    render(<SignedOutGate />)

    const photo = screen.getByRole("img", {
      name: "A travel-planning desk with unfolded maps, a notebook, and boarding passes under a desk lamp.",
    })
    expect(photo).toHaveAttribute("src", "/media/trip-start.webp")
    expect(screen.getByRole("heading", { name: "Your trips, in one place" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /continue/i })).not.toBeInTheDocument()
  })
})
