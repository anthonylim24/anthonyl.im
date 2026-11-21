import type { DeviceStore } from "./deviceStore"
import type { Trip, TripSummary } from "../types"

// What this device keeps of someone's trips, so a trip still opens with no
// connection and nothing typed is lost to a closed tab:
// - a copy of the last trips opened (the server's version, newest ten);
// - the list of trips as the index last showed it;
// - per trip, edits not saved yet, with the copy they were made against.
//
// Everything is filed under the signed-in account. The device remembers
// whose it is, and forgets it all when someone else signs in or the owner
// signs out: one account's trips are never shown to another.

const V = "trips:v1"
const OWNER_KEY = `${V}:owner`
/** How many opened trips the device keeps. */
export const KEEP_TRIPS = 10

export interface TripCopy {
  trip: Trip
  /** When this copy was taken (ms since the epoch). */
  savedAt: number
}

export interface TripListCopy {
  trips: TripSummary[]
  savedAt: number
}

/** Unsaved edits: the working copy and the server's copy it was made against. */
export interface TripDraft {
  doc: Trip
  base: Trip
  savedAt: number
}

/** Most recent first: each opened trip by id, with its link name so a `/trips/<slug>` URL finds it. */
type Index = { id: string; slug?: string }[]

const tripKey = (owner: string, id: string) => `${V}:${owner}:trip:${id}`
const draftKey = (owner: string, id: string) => `${V}:${owner}:draft:${id}`
const indexKey = (owner: string) => `${V}:${owner}:index`
const listKey = (owner: string) => `${V}:${owner}:list`

/** The account the kept trips belong to, if any. */
export const deviceOwner = (store: DeviceStore) => store.get<string>(OWNER_KEY)

/**
 * `userId` is signed in on this device. If the device was keeping another
 * account's trips, they are forgotten first.
 */
export async function claimDevice(store: DeviceStore, userId: string): Promise<void> {
  const owner = await deviceOwner(store)
  if (owner === userId) return
  if (owner !== null) {
    await store.clear()
    forgetLastMoment()
  }
  await store.set(OWNER_KEY, userId)
}

/**
 * Signed out: forget every trip and list kept here. Edits that never reached
 * the server stay, for the same account to send once it signs back in (a
 * session that lapsed mid-trip loses nothing); they are only ever read for
 * that account, and another account signing in clears them with the rest.
 */
export async function forgetDevice(store: DeviceStore): Promise<void> {
  const keys = await store.keys()
  await Promise.all(keys.filter((key) => key !== OWNER_KEY && !key.includes(":draft:")).map((key) => store.delete(key)))
}

// Index writes read, change and write one record; two at once would lose
// one entry, so they take turns.
const indexQueues = new WeakMap<DeviceStore, Promise<unknown>>()
function inTurn<T>(store: DeviceStore, work: () => Promise<T>): Promise<T> {
  const next = (indexQueues.get(store) ?? Promise.resolve()).then(work, work)
  indexQueues.set(store, next)
  return next
}

/** Keep the server's copy of a trip just opened or saved. */
export function keepTrip(store: DeviceStore, owner: string, trip: Trip, now = Date.now()): Promise<void> {
  return inTurn(store, async () => {
    await store.set(tripKey(owner, trip.id), { trip, savedAt: now } satisfies TripCopy)
    const index = (await store.get<Index>(indexKey(owner))) ?? []
    const next = [{ id: trip.id, slug: trip.slug }, ...index.filter((entry) => entry.id !== trip.id)]
    for (const gone of next.slice(KEEP_TRIPS)) await store.delete(tripKey(owner, gone.id))
    await store.set(indexKey(owner), next.slice(0, KEEP_TRIPS))
  })
}

/** The trip id a route's `:tripId` (an id or a link name) stands for, among the kept trips. */
async function resolveId(store: DeviceStore, owner: string, idOrSlug: string): Promise<string> {
  const index = (await store.get<Index>(indexKey(owner))) ?? []
  return index.find((entry) => entry.id === idOrSlug || entry.slug === idOrSlug)?.id ?? idOrSlug
}

/** The kept copy of a trip, by id or link name, with any edits on it not saved yet. */
export async function readTrip(
  store: DeviceStore,
  owner: string,
  idOrSlug: string,
): Promise<{ copy: TripCopy | null; draft: TripDraft | null }> {
  const id = await resolveId(store, owner, idOrSlug)
  const [copy, draft] = await Promise.all([store.get<TripCopy>(tripKey(owner, id)), readDraft(store, owner, id)])
  return { copy, draft }
}

export const keepList = (store: DeviceStore, owner: string, trips: TripSummary[], now = Date.now()) =>
  store.set(listKey(owner), { trips, savedAt: now } satisfies TripListCopy)

export const readList = (store: DeviceStore, owner: string) => store.get<TripListCopy>(listKey(owner))

export const keepDraft = (store: DeviceStore, owner: string, draft: TripDraft) => store.set(draftKey(owner, draft.doc.id), draft)

/** Unsaved edits on a trip: the newer of the store's and one written as the page went away. */
export async function readDraft(store: DeviceStore, owner: string, tripId: string): Promise<TripDraft | null> {
  const kept = await store.get<TripDraft>(draftKey(owner, tripId))
  const last = readLastMoment(owner, tripId)
  if (!last) return kept
  return !kept || last.savedAt >= kept.savedAt ? last : kept
}

export async function dropDraft(store: DeviceStore, owner: string, tripId: string): Promise<void> {
  dropLastMoment(owner, tripId)
  await store.delete(draftKey(owner, tripId))
}

// The page going away (a closed tab, a reload, typing another address) gives
// no time for an IndexedDB write to finish, so the draft taken then goes to
// localStorage, which writes before the call returns. It is read with the
// store's (the newer wins) and dropped with it.
const LAST_MOMENT = "trips-device-last:"
const lastMomentKey = (owner: string, tripId: string) => `${LAST_MOMENT}${draftKey(owner, tripId)}`

/** Write a draft at once, as the page goes away. False when the browser won't keep it (private mode, full). */
export function keepDraftNow(owner: string, draft: TripDraft): boolean {
  try {
    localStorage.setItem(lastMomentKey(owner, draft.doc.id), JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

function readLastMoment(owner: string, tripId: string): TripDraft | null {
  try {
    const raw = localStorage.getItem(lastMomentKey(owner, tripId))
    const draft = raw ? (JSON.parse(raw) as TripDraft) : null
    return draft && typeof draft.savedAt === "number" && draft.doc?.id === tripId && draft.base?.id === tripId ? draft : null
  } catch {
    return null
  }
}

function dropLastMoment(owner: string, tripId: string): void {
  try {
    localStorage.removeItem(lastMomentKey(owner, tripId))
  } catch {
    // No storage: nothing was kept there.
  }
}

/** Another account: every draft written as a page went away. */
function forgetLastMoment(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(LAST_MOMENT)) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    // No storage: nothing was kept there.
  }
}

function cookies(cookie: string, family: string): string[] {
  const values: string[] = []
  for (const part of cookie.split(";")) {
    const at = part.indexOf("=")
    if (at < 0) continue
    const name = part.slice(0, at).trim()
    if (name === family || name.startsWith(`${family}_`)) values.push(part.slice(at + 1).trim())
  }
  return values
}

/** The `sub` (Clerk user id) of a session token, read without checking it: this only decides what to show offline. */
function tokenSubject(token: string): string | null {
  try {
    const payload = token.split(".")[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=")
    const sub = (JSON.parse(atob(base64)) as { sub?: unknown }).sub
    return typeof sub === "string" && sub ? sub : null
  } catch {
    return null
  }
}

/**
 * Who Clerk's own cookies say is signed in on this browser, when sign-in
 * itself can't load. Clerk keeps the session token in `__session` (and a
 * suffixed copy) and the time of the last sign-in or sign-out in
 * `__client_uat`, which sign-out sets to "0". Both are on this site's
 * domain, so a sign-out or a switch of account anywhere on the site shows
 * here. Anything unclear counts as nobody: then no kept trip is shown.
 */
export function cookieSession(cookie: string = typeof document === "undefined" ? "" : document.cookie): string | null {
  const signedIn = cookies(cookie, "__client_uat")
  if (signedIn.length === 0 || !signedIn.every((value) => Number.parseInt(value, 10) > 0)) return null
  const subjects = new Set(cookies(cookie, "__session").map(tokenSubject))
  if (subjects.size !== 1) return null
  return [...subjects][0] ?? null
}
