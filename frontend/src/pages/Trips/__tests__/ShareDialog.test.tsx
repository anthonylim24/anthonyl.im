import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { Trip, TripAccess } from "../types"
import { makeTrip } from "./tripFixtures"

const mockGetTrip = vi.fn()
const mockUpdateTrip = vi.fn()
const mockCreateInvite = vi.fn()
const mockRevokeInvite = vi.fn()
const mockLeaveTrip = vi.fn()

vi.mock("../tripsApi", () => ({
  getTrip: (...args: unknown[]) => mockGetTrip(...args),
  updateTrip: (...args: unknown[]) => mockUpdateTrip(...args),
  createInvite: (...args: unknown[]) => mockCreateInvite(...args),
  revokeInvite: (...args: unknown[]) => mockRevokeInvite(...args),
  leaveTrip: (...args: unknown[]) => mockLeaveTrip(...args),
}))

import { inviteUrl, ShareDialog } from "../components/ShareDialog"

const getToken = async () => "test-token"
const writeText = vi.fn()
const onClose = vi.fn()
const onChanged = vi.fn()
const onLeft = vi.fn()

const joinUrl = (token: string) => `${window.location.origin}/trips/join/${token}`

function renderShare(trip: Trip, access: TripAccess, viewerId: string | null = "u1") {
  mockGetTrip.mockResolvedValue({ trip, access })
  return render(
    <ShareDialog open tripId={trip.id} getToken={getToken} viewerId={viewerId} onClose={onClose} onChanged={onChanged} onLeft={onLeft} />,
  )
}

const mina = { userId: "u2", role: "viewer" as const, name: "Mina" }
const joon = { userId: "u3", role: "editor" as const }

describe("ShareDialog", () => {
  beforeEach(() => {
    writeText.mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    mockCreateInvite.mockImplementation(async (_getToken: unknown, _id: string, role: "viewer" | "editor") => ({
      token: `tok-${role}`,
      role,
      createdAt: "2026-06-01T00:00:00Z",
    }))
    mockRevokeInvite.mockResolvedValue({ ok: true })
    mockLeaveTrip.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("builds the join URL from the page origin", () => {
    expect(inviteUrl("abc")).toBe(joinUrl("abc"))
  })

  it("loads the trip it was asked to share", async () => {
    let resolve: (value: { trip: Trip; access: TripAccess }) => void = () => {}
    mockGetTrip.mockReturnValue(new Promise((r) => (resolve = r)))
    render(<ShareDialog open tripId="lisbon" getToken={getToken} viewerId="u1" onClose={onClose} />)
    const dialog = await screen.findByRole("dialog", { name: "Share this trip" })
    expect(within(dialog).getByRole("status")).toHaveTextContent("Loading sharing…")

    resolve({ trip: makeTrip(), access: "owner" })
    expect(await within(dialog).findByText("Invite people to Lisbon Long Weekend.")).toBeInTheDocument()
    expect(mockGetTrip).toHaveBeenCalledWith(getToken, "lisbon")
    expect(within(dialog).getByText("Only you so far. Copy the link above to bring someone along.")).toBeInTheDocument()
  })

  it("shows an error when sharing can't be loaded", async () => {
    mockGetTrip.mockRejectedValue(new Error("HTTP 500"))
    render(<ShareDialog open tripId="lisbon" getToken={getToken} viewerId="u1" onClose={onClose} />)
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t load sharing for this trip. (HTTP 500)")
    expect(screen.queryByRole("button", { name: "Copy invite link" })).toBeNull()
  })

  it("owner: copies a new invite link for the selected role", async () => {
    renderShare(makeTrip(), "owner")
    const copy = await screen.findByRole("button", { name: "Copy invite link" })
    expect(screen.getByRole("radio", { name: "Can view" })).toHaveAttribute("aria-checked", "true")
    // No link exists yet, so there is nothing to show.
    expect(screen.queryByRole("textbox", { name: "Invite link" })).toBeNull()

    fireEvent.click(screen.getByRole("radio", { name: "Can edit" }))
    expect(screen.getByRole("radio", { name: "Can edit" })).toHaveAttribute("aria-checked", "true")
    fireEvent.click(copy)

    expect(await screen.findByRole("button", { name: "Link copied" })).toBeInTheDocument()
    expect(mockCreateInvite).toHaveBeenCalledTimes(1)
    expect(mockCreateInvite).toHaveBeenCalledWith(getToken, "lisbon", "editor")
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(joinUrl("tok-editor"))
    expect(screen.getByText("Anyone who opens it and signs in joins this trip.")).toBeInTheDocument()
    const link = screen.getByRole("textbox", { name: "Invite link" })
    expect(link).toHaveValue(joinUrl("tok-editor"))
    expect(link).toHaveAttribute("readonly")

    // The link now exists, so copying again does not mint another.
    fireEvent.click(screen.getByRole("button", { name: "Link copied" }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2))
    expect(mockCreateInvite).toHaveBeenCalledTimes(1)
  })

  it("owner: reuses an existing invite for that role", async () => {
    const trip = makeTrip({ invites: [{ token: "existing-view", role: "viewer", createdAt: "2026-05-01T00:00:00Z" }] })
    renderShare(trip, "owner")

    expect(await screen.findByRole("textbox", { name: "Invite link" })).toHaveValue(joinUrl("existing-view"))
    fireEvent.click(screen.getByRole("button", { name: "Copy invite link" }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(joinUrl("existing-view")))
    expect(mockCreateInvite).not.toHaveBeenCalled()

    // The other role has no link yet, so that one is created.
    fireEvent.click(screen.getByRole("radio", { name: "Can edit" }))
    expect(screen.queryByRole("button", { name: "Turn off link" })).toBeNull()
    expect(screen.queryByRole("textbox", { name: "Invite link" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Copy invite link" }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(joinUrl("tok-editor")))
    expect(mockCreateInvite).toHaveBeenCalledWith(getToken, "lisbon", "editor")
  })

  it("owner: turns off an existing link", async () => {
    const trip = makeTrip({ invites: [{ token: "existing-view", role: "viewer", createdAt: "2026-05-01T00:00:00Z" }] })
    renderShare(trip, "owner")

    fireEvent.click(await screen.findByRole("button", { name: "Turn off link" }))
    await waitFor(() => expect(mockRevokeInvite).toHaveBeenCalledWith(getToken, "lisbon", "existing-view"))
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Invite link" })).toBeNull())
    expect(screen.queryByRole("button", { name: "Turn off link" })).toBeNull()
    expect(screen.getByRole("button", { name: "Copy invite link" })).toBeEnabled()
  })

  it("owner: keeps the new invite and says so when the browser blocks copying", async () => {
    writeText.mockRejectedValue(new Error("NotAllowedError"))
    renderShare(makeTrip(), "owner")

    fireEvent.click(await screen.findByRole("button", { name: "Copy invite link" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Your browser blocked copying. Select the link above and copy it yourself.")
    expect(mockCreateInvite).toHaveBeenCalledTimes(1)
    // The link is still there to select by hand, and is not reported as copied.
    expect(screen.getByRole("textbox", { name: "Invite link" })).toHaveValue(joinUrl("tok-viewer"))
    expect(screen.queryByRole("button", { name: "Link copied" })).toBeNull()
    expect(screen.queryByText("Anyone who opens it and signs in joins this trip.")).toBeNull()

    // Trying again reuses the invite rather than minting a second one.
    writeText.mockResolvedValue(undefined)
    fireEvent.click(screen.getByRole("button", { name: "Copy invite link" }))
    expect(await screen.findByRole("button", { name: "Link copied" })).toBeInTheDocument()
    expect(mockCreateInvite).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("owner: changes a guest's role", async () => {
    const trip = makeTrip({ collaborators: [mina, joon] })
    mockUpdateTrip.mockImplementation(async (_t: unknown, _id: string, patch: { collaborators: Trip["collaborators"] }) => ({
      ...trip,
      collaborators: patch.collaborators,
    }))
    renderShare(trip, "owner")

    const select = await screen.findByRole("combobox", { name: "Role for Mina" })
    expect(select).toHaveValue("viewer")
    expect(screen.getByRole("combobox", { name: "Role for guest 2" })).toHaveValue("editor")

    fireEvent.change(select, { target: { value: "editor" } })
    await waitFor(() => expect(mockUpdateTrip).toHaveBeenCalledTimes(1))
    expect(mockUpdateTrip).toHaveBeenCalledWith(getToken, "lisbon", { collaborators: [{ ...mina, role: "editor" }, joon] })
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Role for Mina" })).toHaveValue("editor"))
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ collaborators: [{ ...mina, role: "editor" }, joon] }))
  })

  it("owner: removes a guest", async () => {
    const trip = makeTrip({ collaborators: [mina, joon] })
    mockUpdateTrip.mockImplementation(async (_t: unknown, _id: string, patch: { collaborators: Trip["collaborators"] }) => ({
      ...trip,
      collaborators: patch.collaborators,
    }))
    renderShare(trip, "owner")

    fireEvent.click(await screen.findByRole("button", { name: "Remove Mina" }))
    await waitFor(() => expect(mockUpdateTrip).toHaveBeenCalledWith(getToken, "lisbon", { collaborators: [joon] }))
    await waitFor(() => expect(screen.queryByText("Mina")).toBeNull())
    expect(screen.getByText("Guest 1")).toBeInTheDocument()
  })

  it("owner: keeps the invite links after a collaborator save", async () => {
    const invite = { token: "existing-view", role: "viewer" as const, createdAt: "2026-05-01T00:00:00Z" }
    const trip = makeTrip({ collaborators: [mina], invites: [invite] })
    // The PATCH response does not echo invites back.
    mockUpdateTrip.mockResolvedValue(makeTrip({ collaborators: [] }))
    renderShare(trip, "owner")

    fireEvent.click(await screen.findByRole("button", { name: "Remove Mina" }))
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ collaborators: [], invites: [invite] })))
    expect(screen.getByRole("button", { name: "Turn off link" })).toBeInTheDocument()
  })

  it("shows what went wrong when a change fails", async () => {
    mockUpdateTrip.mockRejectedValue(new Error("HTTP 409"))
    renderShare(makeTrip({ collaborators: [mina] }), "owner")

    fireEvent.click(await screen.findByRole("button", { name: "Remove Mina" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("That didn’t go through. (HTTP 409)")
    expect(screen.getByText("Mina")).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it("guest: sees no invite controls and can leave", async () => {
    renderShare(makeTrip({ collaborators: [mina, joon] }), "edit", "u3")

    const leave = await screen.findByRole("button", { name: "Leave this trip" })
    expect(screen.queryByRole("button", { name: "Copy invite link" })).toBeNull()
    expect(screen.queryByRole("radiogroup")).toBeNull()
    expect(screen.queryByRole("combobox")).toBeNull()
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull()
    // Roles are read-only labels; the viewer's own row says "You".
    const people = within(screen.getByRole("region", { name: "People on this trip" }))
    expect(people.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Trip ownerOwner", "MMinaCan view", "YouCan edit"])

    fireEvent.click(leave)
    await waitFor(() => expect(mockLeaveTrip).toHaveBeenCalledWith(getToken, "lisbon"))
    await waitFor(() => expect(onLeft).toHaveBeenCalledTimes(1))
    expect(mockCreateInvite).not.toHaveBeenCalled()
    expect(mockUpdateTrip).not.toHaveBeenCalled()
  })

  it("does not offer Leave to someone who isn't a collaborator", async () => {
    renderShare(makeTrip({ sharedWithAllUsers: true }), "edit", "u9")
    expect(await screen.findByText("Everyone with an account can already see and edit this trip.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Leave this trip" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Copy invite link" })).toBeNull()
  })
})
