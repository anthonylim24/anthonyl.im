import { z } from "zod"

// ── Core trip document model ─────────────────────────────────────────────
//
// A Trip is a self-contained document: metadata + days[].items[]. Items that
// refer to a physical place carry a structured TripLocation so Map Mode and
// AI agents always work from structured data, never prose.

export type TripStatus = "draft" | "active" | "archived" | "completed"
export type CollaboratorRole = "viewer" | "editor"

export interface TripCollaborator {
  userId: string
  role: CollaboratorRole
}

export type LocationSource = "user" | "ai" | "migration"
export type ConfidenceLevel = "high" | "medium" | "low"

export interface TripLocation {
  name: string
  address?: string
  lat?: number
  lng?: number
  placeId?: string
  category?: string // PlaceCategory vocabulary (restaurant, cafe, palace, …)
  source: LocationSource
  confidence?: ConfidenceLevel
}

export type ItemKind = "place" | "note" | "section" | "reservation"
export type ItemStatus = "none" | "optional" | "booked" | "completed" | "needs_review"

export interface ItineraryReservation {
  type: string // flight | hotel | meal | bar | experience | transit | event | …
  status: "confirmed" | "tentative" | "pending"
  confirmation?: string
  contact?: string
  url?: string
}

export interface ItineraryItem {
  id: string
  kind: ItemKind
  title: string
  time?: string // "HH:mm" local to trip timezone
  endTime?: string
  notes?: string
  links?: string[]
  status: ItemStatus
  location?: TripLocation
  reservation?: ItineraryReservation
  createdBy: LocationSource
}

export interface DayCallout {
  icon: string // emoji
  tone: "info" | "warn" | "success" | "alert"
  body: string
}

export interface DayWeather {
  highC: number
  lowC: number
  condition: string
}

export interface TripDay {
  id: string // stable slug within the trip, e.g. "day-1"
  date: string // ISO yyyy-mm-dd
  title?: string
  emoji?: string
  city?: string
  /** Day theme prose — the editorial one-liner under the day title. */
  notes?: string
  /** Neighborhood/area names featured this day (rendered as meta + map hints). */
  neighborhoods?: string[]
  weather?: DayWeather
  callouts?: DayCallout[]
  items: ItineraryItem[]
}

// ── Trip appearance (configurable, AI-fillable theming) ──────────────────
//
// Drives the Korea-dossier-style rendering of trip pages. Every field has a
// sensible default; AI generation proposes values and the editor overrides.

export type TripAccent = "rose" | "amber" | "emerald" | "sky" | "violet"

export interface TripAppearance {
  /** Signature accent family — colors the hero bloom, countdown, dots. */
  accent?: TripAccent
  /** Hero kicker, e.g. "The dossier". */
  eyebrow?: string
  /** Italic serif line under the trip title, e.g. "a Seoul & Busan dossier". */
  subtitle?: string
  /** Editorial paragraph under the hero. */
  headline?: string
  /** Two-letter tags per city for day cards; auto-derived when absent. */
  cityTags?: Record<string, string>
}

export interface Trip {
  id: string
  ownerId: string
  name: string
  destinations: string[]
  startDate: string // ISO yyyy-mm-dd
  endDate: string // ISO yyyy-mm-dd
  timezone: string // IANA, e.g. "Asia/Seoul"
  status: TripStatus
  tags: string[]
  description?: string
  collaborators: TripCollaborator[]
  // Legacy Korea behavior: every signed-in user can view and edit. New trips
  // default to private (owner + collaborators only).
  sharedWithAllUsers?: boolean
  appearance?: TripAppearance
  days: TripDay[]
  createdAt: string
  updatedAt: string
}

// ── AI enhancement model ─────────────────────────────────────────────────

export type SuggestionKind = "add" | "edit" | "remove" | "reorder" | "warning" | "info"

export interface EnhancementSuggestion {
  id: string
  kind: SuggestionKind
  dayId?: string
  itemId?: string // target for edit/remove; anchor for reorder
  title: string
  detail: string
  confidence: ConfidenceLevel
  proposedItem?: ItineraryItem // for "add"
  proposedChanges?: Partial<Omit<ItineraryItem, "id">> // for "edit"
  proposedOrder?: string[] // for "reorder": full item-id order for the day
}

export interface EnhancementRun {
  id: string
  tripId: string
  scope: "day" | "trip"
  dayId?: string
  status: "complete" | "error"
  summary?: string
  suggestions: EnhancementSuggestion[]
  appliedSuggestionIds: string[]
  /** Live forecast fetched during the run — auto-merged onto day.weather
   *  (trusted metadata sync, not a reviewable suggestion). */
  weatherByDate?: Record<string, DayWeather>
  error?: string
  createdAt: string
}

// ── Default AI prompt (spec-mandated) ────────────────────────────────────

export const DEFAULT_ITINERARY_PROMPT =
  "Build a practical, well-paced itinerary for this trip. Include activities, meals, " +
  "neighborhoods, realistic travel times, and logical routing. Prefer useful structure " +
  "over excessive detail, and keep everything easy to edit."

// ── Zod schemas (request payloads) ───────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected yyyy-mm-dd")

export const collaboratorSchema = z.object({
  userId: z.string().min(1).max(128),
  role: z.enum(["viewer", "editor"]),
})

export const locationSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(400).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  placeId: z.string().max(256).optional(),
  category: z.string().max(40).optional(),
  source: z.enum(["user", "ai", "migration"]).default("user"),
  confidence: z.enum(["high", "medium", "low"]).optional(),
})

export const itemSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(["place", "note", "section", "reservation"]),
  title: z.string().min(1).max(300),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  notes: z.string().max(8000).optional(),
  links: z.array(z.string().max(2000)).max(20).optional(),
  status: z.enum(["none", "optional", "booked", "completed", "needs_review"]).default("none"),
  location: locationSchema.optional(),
  reservation: z
    .object({
      type: z.string().max(40),
      status: z.enum(["confirmed", "tentative", "pending"]),
      confirmation: z.string().max(120).optional(),
      contact: z.string().max(200).optional(),
      url: z.string().max(2000).optional(),
    })
    .optional(),
  createdBy: z.enum(["user", "ai", "migration"]).default("user"),
})

export const calloutSchema = z.object({
  icon: z.string().min(1).max(8),
  tone: z.enum(["info", "warn", "success", "alert"]),
  body: z.string().min(1).max(1000),
})

export const weatherSchema = z.object({
  highC: z.number().min(-60).max(60),
  lowC: z.number().min(-60).max(60),
  condition: z.string().max(60),
})

export const daySchema = z.object({
  id: z.string().min(1).max(64),
  date: isoDate,
  title: z.string().max(200).optional(),
  emoji: z.string().max(8).optional(),
  city: z.string().max(80).optional(),
  notes: z.string().max(8000).optional(),
  neighborhoods: z.array(z.string().min(1).max(80)).max(12).optional(),
  weather: weatherSchema.optional(),
  callouts: z.array(calloutSchema).max(12).optional(),
  items: z.array(itemSchema).max(200),
})

export const appearanceSchema = z.object({
  accent: z.enum(["rose", "amber", "emerald", "sky", "violet"]).optional(),
  eyebrow: z.string().max(60).optional(),
  subtitle: z.string().max(120).optional(),
  headline: z.string().max(600).optional(),
  cityTags: z.record(z.string().max(80), z.string().max(4)).optional(),
})

export const createTripSchema = z.object({
  name: z.string().min(1).max(160),
  destinations: z.array(z.string().min(1).max(120)).min(1).max(20),
  startDate: isoDate,
  endDate: isoDate,
  timezone: z.string().min(1).max(64).default("UTC"),
  status: z.enum(["draft", "active", "archived", "completed"]).default("draft"),
  tags: z.array(z.string().max(40)).max(20).default([]),
  description: z.string().max(4000).optional(),
  collaborators: z.array(collaboratorSchema).max(50).default([]),
})

export const updateTripSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  destinations: z.array(z.string().min(1).max(120)).min(1).max(20).optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  timezone: z.string().min(1).max(64).optional(),
  status: z.enum(["draft", "active", "archived", "completed"]).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  description: z.string().max(4000).nullable().optional(),
  collaborators: z.array(collaboratorSchema).max(50).optional(),
  appearance: appearanceSchema.optional(),
  days: z.array(daySchema).max(60).optional(),
})

export const generateRequestSchema = z.object({
  prompt: z.string().max(4000).optional(),
  preferences: z
    .object({
      pace: z.string().max(120).optional(),
      budget: z.string().max(120).optional(),
      interests: z.string().max(500).optional(),
      food: z.string().max(500).optional(),
      mobility: z.string().max(300).optional(),
      mustSee: z.string().max(500).optional(),
      avoid: z.string().max(500).optional(),
      lodging: z.string().max(300).optional(),
      transport: z.string().max(300).optional(),
    })
    .optional(),
  // Safety: refuses to overwrite a non-empty itinerary unless set.
  replaceExisting: z.boolean().default(false),
})

export const enhanceRequestSchema = z.object({
  scope: z.enum(["day", "trip"]),
  dayId: z.string().max(64).optional(),
})

export const applySuggestionsSchema = z.object({
  suggestionIds: z.array(z.string().min(1).max(64)).min(1).max(100),
})

// ── AI structured-output schemas ─────────────────────────────────────────

export const aiItemSchema = z.object({
  kind: z.enum(["place", "note", "section", "reservation"]).default("place"),
  title: z.string().min(1).max(300),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  notes: z.string().max(4000).optional(),
  status: z.enum(["none", "optional", "booked", "completed", "needs_review"]).optional(),
  location: z
    .object({
      name: z.string().min(1).max(200),
      address: z.string().max(400).optional(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      category: z.string().max(40).optional(),
    })
    .optional(),
})

export const aiDaySchema = z.object({
  title: z.string().max(200).optional(),
  emoji: z.string().max(8).optional(),
  city: z.string().max(80).optional(),
  notes: z.string().max(4000).optional(),
  neighborhoods: z.array(z.string().min(1).max(80)).max(12).optional(),
  items: z.array(aiItemSchema).max(40).default([]),
})

export const aiAppearanceSchema = z.object({
  accent: z.enum(["rose", "amber", "emerald", "sky", "violet"]).optional(),
  eyebrow: z.string().max(60).optional(),
  subtitle: z.string().max(120).optional(),
  headline: z.string().max(600).optional(),
})

export const aiItinerarySchema = z.object({
  summary: z.string().max(2000).optional(),
  appearance: aiAppearanceSchema.optional(),
  days: z.array(aiDaySchema).max(60),
})

export const aiSuggestionSchema = z.object({
  kind: z.enum(["add", "edit", "remove", "reorder", "warning", "info"]),
  dayId: z.string().max(64).optional(),
  itemId: z.string().max(64).optional(),
  title: z.string().min(1).max(300),
  detail: z.string().max(2000).default(""),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
  proposedItem: aiItemSchema.optional(),
  proposedChanges: aiItemSchema.partial().optional(),
  proposedOrder: z.array(z.string().max(64)).max(200).optional(),
})

export const aiEnhancementSchema = z.object({
  summary: z.string().max(2000).optional(),
  suggestions: z.array(aiSuggestionSchema).max(40).default([]),
})

// ── Helpers ──────────────────────────────────────────────────────────────

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** Inclusive list of ISO dates between start and end (capped at 60 days). */
export function tripDates(startDate: string, endDate: string): string[] {
  const out: string[] = []
  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  for (let t = start.getTime(); t <= end.getTime() && out.length < 60; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

/** Build empty days for a date range, ids day-1..day-N. */
export function emptyDays(startDate: string, endDate: string): TripDay[] {
  return tripDates(startDate, endDate).map((date, i) => ({
    id: `day-${i + 1}`,
    date,
    items: [],
  }))
}

export type TripAccess = "none" | "view" | "edit" | "owner"

export function accessFor(trip: Trip, userId: string): TripAccess {
  if (trip.ownerId === userId) return "owner"
  const collab = trip.collaborators.find((c) => c.userId === userId)
  if (collab) return collab.role === "editor" ? "edit" : "view"
  if (trip.sharedWithAllUsers) return "edit"
  return "none"
}

export const canView = (a: TripAccess) => a !== "none"
export const canEdit = (a: TripAccess) => a === "edit" || a === "owner"
