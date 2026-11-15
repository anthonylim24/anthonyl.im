import { describe, expect, test } from "bun:test"
import { createSupabaseClient } from "../igPlaces/supabase"
import { MemoryTripStore, SupabaseTripStore } from "./store"
import type { Trip } from "./types"

function trip(id: string, extra: Partial<Trip> = {}): Trip {
  return {
    id,
    ownerId: "u",
    name: id,
    destinations: ["Tokyo"],
    startDate: "2026-07-10",
    endDate: "2026-07-10",
    timezone: "Asia/Tokyo",
    status: "draft",
    tags: [],
    collaborators: [],
    days: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  }
}

describe("SupabaseTripStore lookups", () => {
  function storeRecording() {
    const urls: string[] = []
    const fetch = (async (url: string) => {
      urls.push(decodeURIComponent(String(url)))
      return Response.json([{ doc: trip("t1", { slug: "tokyo-2026" }) }])
    }) as unknown as typeof globalThis.fetch
    const store = new SupabaseTripStore(createSupabaseClient({ url: "https://h.supabase.co", serviceKey: "k", fetch }))
    return { store, urls }
  }

  test("getBySlug filters on the document's slug instead of listing every trip", async () => {
    const { store, urls } = storeRecording()
    expect((await store.getBySlug("tokyo-2026"))?.id).toBe("t1")
    expect(urls).toEqual(["https://h.supabase.co/rest/v1/trips?doc->>slug=eq.tokyo-2026&select=doc&limit=1"])
  })

  test("findByInviteToken asks for the trip whose invites contain the token", async () => {
    const { store, urls } = storeRecording()
    await store.findByInviteToken("tok_123-abc")
    expect(urls).toEqual([
      'https://h.supabase.co/rest/v1/trips?doc->invites=cs.[{"token":"tok_123-abc"}]&select=doc&limit=1',
    ])
  })
})

describe("MemoryTripStore lookups", () => {
  test("finds by slug and by invite token, or null", async () => {
    const store = new MemoryTripStore()
    await store.create(trip("t1", { slug: "tokyo-2026", invites: [{ token: "tok", role: "viewer", createdAt: "x" }] }))
    expect((await store.getBySlug("tokyo-2026"))?.id).toBe("t1")
    expect(await store.getBySlug("nope")).toBeNull()
    expect((await store.findByInviteToken("tok"))?.id).toBe("t1")
    expect(await store.findByInviteToken("other")).toBeNull()
  })
})
