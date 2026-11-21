import { describe, expect, it } from "vitest"
import { makeSummary, makeTrip } from "../../__tests__/tripFixtures"
import { memoryStore, noStore, type DeviceStore } from "../deviceStore"
import {
  KEEP_TRIPS,
  claimDevice,
  cookieSession,
  deviceOwner,
  dropDraft,
  forgetDevice,
  keepDraft,
  keepList,
  keepTrip,
  readDraft,
  readList,
  readTrip,
} from "../tripCopies"

const token = (sub: string) => {
  const body = btoa(JSON.stringify({ sub, exp: 1 })).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")
  return `eyJhbGciOiJSUzI1NiJ9.${body}.signature`
}

describe("trips kept on this device", () => {
  it("keeps the newest ten opened trips and finds them by id or link name", async () => {
    const store = memoryStore()
    for (let n = 0; n < KEEP_TRIPS + 2; n++) await keepTrip(store, "u1", makeTrip({ id: `t${n}`, slug: `trip-${n}` }), n)
    expect((await readTrip(store, "u1", "t0")).copy).toBeNull()
    expect((await readTrip(store, "u1", "t1")).copy).toBeNull()
    expect((await readTrip(store, "u1", "t2")).copy?.trip.id).toBe("t2")
    expect((await readTrip(store, "u1", "trip-11")).copy).toMatchObject({ trip: { id: "t11" }, savedAt: 11 })
  })

  it("opening a kept trip again moves it to the front", async () => {
    const store = memoryStore()
    for (let n = 0; n < KEEP_TRIPS; n++) await keepTrip(store, "u1", makeTrip({ id: `t${n}` }))
    await keepTrip(store, "u1", makeTrip({ id: "t0", name: "Opened again" }))
    await keepTrip(store, "u1", makeTrip({ id: "new" }))
    expect((await readTrip(store, "u1", "t0")).copy?.trip.name).toBe("Opened again")
    expect((await readTrip(store, "u1", "t1")).copy).toBeNull()
  })

  it("two trips kept at once both stay listed", async () => {
    const store = memoryStore()
    await Promise.all([keepTrip(store, "u1", makeTrip({ id: "a" })), keepTrip(store, "u1", makeTrip({ id: "b" }))])
    for (let n = 0; n < KEEP_TRIPS - 2; n++) await keepTrip(store, "u1", makeTrip({ id: `t${n}` }))
    expect((await readTrip(store, "u1", "a")).copy).not.toBeNull()
    expect((await readTrip(store, "u1", "b")).copy).not.toBeNull()
  })

  it("keeps the trip list and unsaved edits, and drops edits once saved", async () => {
    const store = memoryStore()
    const base = makeTrip({ id: "t1" })
    await keepList(store, "u1", [makeSummary({ id: "t1" })], 5)
    await keepDraft(store, "u1", { doc: { ...base, name: "Edited" }, base, savedAt: 6 })
    expect(await readList(store, "u1")).toMatchObject({ savedAt: 5, trips: [{ id: "t1" }] })
    expect((await readDraft(store, "u1", "t1"))?.doc.name).toBe("Edited")
    expect((await readTrip(store, "u1", "t1")).draft?.doc.name).toBe("Edited")
    await dropDraft(store, "u1", "t1")
    expect(await readDraft(store, "u1", "t1")).toBeNull()
  })

  it("another account signing in forgets the last one's trips", async () => {
    const store = memoryStore()
    await claimDevice(store, "u1")
    await keepTrip(store, "u1", makeTrip({ id: "t1" }))
    await claimDevice(store, "u1")
    expect((await readTrip(store, "u1", "t1")).copy).not.toBeNull()
    await claimDevice(store, "u2")
    expect(await deviceOwner(store)).toBe("u2")
    expect((await readTrip(store, "u1", "t1")).copy).toBeNull()
    expect(store.size()).toBe(1)
  })

  it("signing out forgets everything", async () => {
    const store = memoryStore()
    await claimDevice(store, "u1")
    await keepTrip(store, "u1", makeTrip({ id: "t1" }))
    await forgetDevice(store)
    expect(await deviceOwner(store)).toBeNull()
    expect(store.size()).toBe(0)
  })

  it("a device that keeps nothing reads as empty", async () => {
    const store: DeviceStore = noStore
    await keepTrip(store, "u1", makeTrip({ id: "t1" }))
    expect(await readTrip(store, "u1", "t1")).toEqual({ copy: null, draft: null })
  })
})

describe("who Clerk's cookies say is signed in", () => {
  it("reads the user from the session token while the last sign-in stands", () => {
    expect(cookieSession(`theme=dark; __client_uat=1700000000; __session=${token("user_1")}`)).toBe("user_1")
    expect(cookieSession(`__client_uat_Ab12=1700000000; __session_Ab12=${token("user_1")}`)).toBe("user_1")
  })

  it("is nobody after a sign-out, with no cookies, or with a token it can't read", () => {
    expect(cookieSession(`__client_uat=0; __session=${token("user_1")}`)).toBeNull()
    expect(cookieSession(`__client_uat=1700000000; __client_uat_Ab12=0; __session=${token("user_1")}`)).toBeNull()
    expect(cookieSession("")).toBeNull()
    expect(cookieSession("__client_uat=1700000000")).toBeNull()
    expect(cookieSession("__client_uat=1700000000; __session=not-a-token")).toBeNull()
  })

  it("is nobody when two tokens name different people", () => {
    expect(cookieSession(`__client_uat=1; __session=${token("user_1")}; __session_Ab12=${token("user_2")}`)).toBeNull()
  })
})
