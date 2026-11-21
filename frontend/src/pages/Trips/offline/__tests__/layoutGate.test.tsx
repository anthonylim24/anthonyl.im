import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { makeTrip } from "../../__tests__/tripFixtures"
import { memoryStore } from "../deviceStore"
import { claimDevice, deviceOwner, keepTrip } from "../tripCopies"
import { useTripsDevice } from "../tripsDevice"

// The sign-in gate decides whose kept trips may be shown. Clerk, the stall
// probe and the device store are stand-ins; the decisions are real.

// A local `.env` may set the dev bearer, which skips sign-in altogether.
vi.hoisted(() => vi.stubEnv("VITE_DEV_BEARER", ""))

const auth = vi.hoisted(() => ({ isLoaded: false, isSignedIn: false as boolean | undefined, userId: null as string | null, status: "loading" }))
const stall = vi.hoisted(() => ({ stalled: false }))
const shared = vi.hoisted(() => ({ store: null as unknown }))

vi.mock("@/lib/clerk", () => ({ CLERK_ENABLED: true, CLERK_PROXY_URL: undefined, CLERK_PUBLISHABLE_KEY: "pk_test" }))
vi.mock("@/lib/authStall", () => ({ useAuthStall: () => (stall.stalled ? { stalled: true, cause: "auth" } : { stalled: false, cause: null }) }))
vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isLoaded: auth.isLoaded, isSignedIn: auth.isSignedIn, userId: auth.userId }),
  useClerk: () => ({ status: auth.status, on: () => undefined, off: () => undefined }),
  SignedIn: ({ children }: { children: ReactNode }) => (auth.isSignedIn ? <>{children}</> : null),
  SignedOut: ({ children }: { children: ReactNode }) => (auth.isSignedIn ? null : <>{children}</>),
  SignInButton: ({ children }: { children: ReactNode }) => <>{children}</>,
  UserButton: () => null,
}))
vi.mock("../../TripChatLauncher", () => ({ TripChatLauncher: () => <p>Chat</p> }))
vi.mock("../deviceStore", async (original) => ({
  ...(await original<typeof import("../deviceStore")>()),
  deviceStore: () => shared.store,
}))

import { TripsLayout } from "../../TripsLayout"

function Page({ name }: { name: string }) {
  const device = useTripsDevice()
  return <p>{`${name} · ${device.mode} · ${device.owner ?? "nobody"}`}</p>
}

function open(path = "/trips") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/trips" element={<TripsLayout />}>
          <Route index element={<Page name="Index" />} />
          <Route path="new" element={<Page name="Create" />} />
          <Route path=":tripId" element={<Page name="Trip" />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

const token = (sub: string) => `h.${btoa(JSON.stringify({ sub })).replace(/=+$/, "")}.s`

describe("the Trips sign-in gate and this device", () => {
  let store: ReturnType<typeof memoryStore>
  beforeEach(async () => {
    store = memoryStore()
    shared.store = store
    Object.assign(auth, { isLoaded: false, isSignedIn: undefined, userId: null, status: "loading" })
    stall.stalled = false
    await claimDevice(store, "user_1")
    await keepTrip(store, "user_1", makeTrip({ id: "t1" }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    document.cookie = "__client_uat=; max-age=0"
    document.cookie = "__session=; max-age=0"
  })

  it("signed in: the pages are live, for that account", async () => {
    Object.assign(auth, { isLoaded: true, isSignedIn: true, userId: "user_1", status: "ready" })
    open()
    expect(await screen.findByText("Index · live · user_1")).toBeInTheDocument()
    expect(screen.getByText("Chat")).toBeInTheDocument()
  })

  it("another account signing in forgets the last one's trips first", async () => {
    Object.assign(auth, { isLoaded: true, isSignedIn: true, userId: "user_2", status: "ready" })
    open()
    expect(await screen.findByText("Index · live · user_2")).toBeInTheDocument()
    expect(await deviceOwner(store)).toBe("user_2")
    expect(store.size()).toBe(1)
  })

  it("offline before sign-in loads: the kept trips, read-only, while the cookies still name their owner", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    document.cookie = "__client_uat=1700000000"
    document.cookie = `__session=${token("user_1")}`
    open()
    expect(await screen.findByText("Index · copy · user_1")).toBeInTheDocument()
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("Offline · showing what’s saved on this device")
    expect(screen.queryByText("Chat")).toBeNull()
    expect(screen.queryByRole("link", { name: "New trip" })).toBeNull()
  })

  it("creating a trip needs a connection", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    document.cookie = "__client_uat=1700000000"
    document.cookie = `__session=${token("user_1")}`
    open("/trips/new")
    expect(await screen.findByRole("heading", { name: "This needs a connection" })).toBeInTheDocument()
    expect(screen.queryByText(/Create/)).toBeNull()
  })

  it("sign-in blocked (stalled), still signed in: the kept trips", async () => {
    stall.stalled = true
    document.cookie = "__client_uat=1700000000"
    document.cookie = `__session=${token("user_1")}`
    open("/trips/t1")
    expect(await screen.findByText("Trip · copy · user_1")).toBeInTheDocument()
  })

  it("never shows one account's kept trips to another, or after a sign-out", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    document.cookie = "__client_uat=1700000000"
    document.cookie = `__session=${token("user_2")}`
    const first = open()
    await waitFor(() => expect(screen.getByRole("status", { name: "Checking sign-in" })).toBeInTheDocument())
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText(/Index/)).toBeNull()
    first.unmount()

    document.cookie = "__client_uat=0"
    document.cookie = `__session=${token("user_1")}`
    open()
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText(/Index/)).toBeNull()
  })

  it("signed out for certain: forgets the kept trips and asks to sign in", async () => {
    Object.assign(auth, { isLoaded: true, isSignedIn: false, userId: null, status: "ready" })
    open()
    expect(await screen.findByRole("button", { name: "Sign in to continue" })).toBeInTheDocument()
    await waitFor(() => expect(store.size()).toBe(0))
  })

  it("signed out while offline: keeps the trips (it may not be a real sign-out) but shows none without a session", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    Object.assign(auth, { isLoaded: true, isSignedIn: false, userId: null, status: "degraded" })
    open()
    expect(await screen.findByRole("button", { name: "Sign in to continue" })).toBeInTheDocument()
    expect(store.size()).toBeGreaterThan(0)
  })
})
