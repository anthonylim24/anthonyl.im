import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"

const { mockGetToken } = vi.hoisted(() => ({
  mockGetToken: vi.fn().mockResolvedValue("test-token"),
}))

vi.mock("@/lib/safeAuth", () => ({
  useGetToken: () => mockGetToken,
  useAuthReady: () => true,
  useViewer: () => ({ id: "u2", name: "Mina" }),
  clerkEnabled: true,
}))

const mockJoinTrip = vi.fn()

vi.mock("../tripsApi", () => ({
  joinTrip: (...args: unknown[]) => mockJoinTrip(...args),
}))

import { HttpStatusError } from "../../../effect/errors"
import { joinFailure } from "../joinFailure"
import { TripJoin } from "../TripJoin"

function Landing() {
  const { pathname } = useLocation()
  return <p data-testid="path">{pathname}</p>
}

function renderJoin(token = "tok-1") {
  return render(
    <MemoryRouter initialEntries={[`/trips/join/${token}`]}>
      <Routes>
        <Route path="/trips/join/:token" element={<TripJoin />} />
        <Route path="/trips/:tripId" element={<Landing />} />
        <Route path="/trips" element={<Landing />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe("TripJoin", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("joins with the invite token and opens the trip", async () => {
    mockJoinTrip.mockResolvedValue({ trip: { id: "t-1", slug: "lisbon-2026", name: "Lisbon" }, access: "view" })
    renderJoin("tok-1")

    expect(screen.getByRole("status")).toHaveTextContent("Adding you to the trip…")
    expect(await screen.findByTestId("path")).toHaveTextContent("/trips/lisbon-2026")
    expect(mockJoinTrip).toHaveBeenCalledTimes(1)
    const [getToken, token, name] = mockJoinTrip.mock.calls[0]!
    expect(token).toBe("tok-1")
    expect(name).toBe("Mina")
    await expect((getToken as () => Promise<string | null>)()).resolves.toBe("test-token")
  })

  it("falls back to the trip id when there is no slug", async () => {
    mockJoinTrip.mockResolvedValue({ trip: { id: "t-1", name: "Lisbon" }, access: "edit" })
    renderJoin()
    expect(await screen.findByTestId("path")).toHaveTextContent("/trips/t-1")
  })

  it("explains an expired or revoked link", async () => {
    mockJoinTrip.mockRejectedValue(new Error("invite_not_found"))
    renderJoin("dead")

    expect(await screen.findByRole("heading", { level: 1, name: "This link has expired." })).toBeInTheDocument()
    expect(screen.getByText("The trip’s owner turned it off or made a new one. Ask them to send a fresh link.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Go to your trips" })).toHaveAttribute("href", "/trips")
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.queryByTestId("path")).toBeNull()
  })

  it("calls a 404 from the server an expired link, whatever the body says", async () => {
    mockJoinTrip.mockRejectedValue(new HttpStatusError({ status: 404, message: "HTTP 404" }))
    renderJoin("dead")
    expect(await screen.findByRole("heading", { level: 1, name: "This link has expired." })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
  })

  it("does not call a network or server failure expired, and tries again", async () => {
    mockJoinTrip
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce({ trip: { id: "t-1", slug: "lisbon-2026", name: "Lisbon" }, access: "view" })
    renderJoin()

    expect(await screen.findByRole("heading", { level: 1, name: "Couldn’t join just now." })).toBeInTheDocument()
    expect(screen.getByText(/Check your connection and try again\. \(Failed to fetch\)/)).toBeInTheDocument()
    expect(screen.queryByText(/expired/)).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByTestId("path")).toHaveTextContent("/trips/lisbon-2026")
    expect(mockJoinTrip).toHaveBeenCalledTimes(2)
  })

  it("treats a 5xx as worth retrying", () => {
    expect(joinFailure(new HttpStatusError({ status: 503, message: "Service unavailable" }))).toEqual({
      kind: "retry",
      detail: "Service unavailable",
    })
    expect(joinFailure(new HttpStatusError({ status: 410, message: "gone" }))).toEqual({ kind: "dead" })
  })
})
