import type { ItineraryItem, Trip, TripSummary } from "../types"

// Typed fixtures shared by the Trips component tests. Every required field
// is declared so a new required field on the model fails typecheck here.

export function makeItem(overrides: Partial<ItineraryItem> = {}): ItineraryItem {
  return {
    id: "it-1",
    kind: "place",
    title: "Stop",
    status: "none",
    createdBy: "user",
    ...overrides,
  }
}

export function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "lisbon",
    ownerId: "u1",
    name: "Lisbon Long Weekend",
    destinations: ["Lisbon"],
    startDate: "2026-07-10",
    endDate: "2026-07-11",
    timezone: "Europe/Lisbon",
    status: "active",
    tags: [],
    collaborators: [],
    days: [
      { id: "day-1", date: "2026-07-10", items: [] },
      { id: "day-2", date: "2026-07-11", items: [] },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

export function makeSummary(overrides: Partial<TripSummary> = {}): TripSummary {
  return {
    id: "lisbon",
    name: "Lisbon Long Weekend",
    destinations: ["Lisbon"],
    startDate: "2026-07-10",
    endDate: "2026-07-11",
    timezone: "UTC",
    status: "active",
    tags: [],
    collaborators: [],
    sharedWithAllUsers: false,
    dayCount: 2,
    itemCount: 0,
    access: "owner",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

/** `matchMedia` that reports every query as matching (desktop layout) or not. */
export function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  })
}
