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
  /** Display name captured when someone joins by invite link. */
  name?: string
}

/** Shareable join link. Owner-only: never returned to other users and never
 *  settable through the create/update payloads. */
export interface TripInvite {
  token: string
  role: CollaboratorRole
  createdAt: string
}

export interface TripCenter {
  lat: number
  lng: number
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

/** What kind of outing a wishlist idea is: the wishlist's filter and groups.
 *  Stored only when the traveller picks one; otherwise the client infers it
 *  from `location.category`. Keep in step with the frontend `ITEM_THEMES`. */
export const ITEM_THEMES = ["food", "nature", "sights", "neighborhood", "shopping", "nightlife", "activity", "other"] as const
export type ItemTheme = (typeof ITEM_THEMES)[number]
export type ItemStatus = "none" | "optional" | "booked" | "completed" | "skipped" | "needs_review"

export interface ItineraryReservation {
  type: string // flight | hotel | meal | bar | experience | transit | event | …
  status: "confirmed" | "tentative" | "pending"
  confirmation?: string
  contact?: string
  url?: string
  /** Airline, hotel, rental company or operator. */
  provider?: string
  /** Flight, train or booking line number ("UA 123"). */
  number?: string
  /** Where it leaves from: an airport code, station or pick-up place. */
  from?: string
  /** Where it arrives: an airport code, station or drop-off place. */
  to?: string
  /** ISO date it ends (arrival, check-out, drop-off) when that is not the item's own day. */
  endDate?: string
  /** IANA zone of the end (a flight landing in another zone); the day's zone when absent. */
  endTimezone?: string
  seat?: string
  terminal?: string
}

/** An amount in a currency's major unit (12.5 = twelve euros fifty). */
export interface Money {
  amount: number
  /** ISO 4217, upper case ("EUR"). */
  currency: string
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
  /** What this stop or booking costs: the planned side of the budget. */
  cost?: Money
  /** The traveller loved it: kept for the trip's recap. */
  highlight?: boolean
  /** The traveller's own wishlist category; absent means "infer from the place". */
  theme?: ItemTheme
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
  /** IANA zone the day is lived in, when it differs from the trip's (a multi-country trip). */
  timezone?: string
  /** What the traveller wrote about the day, during or after it. */
  journal?: string
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

// ── Planning extras (budget, party, checklist) ───────────────────────────
//
// Saved with the trip document like `days`. The client owns their shape;
// the server only validates and stores them. Lists merge by id on the
// client (`tripMerge.ts`), so two people adding at once both keep theirs.

/** Someone on the trip, whether or not they have an account. */
export interface TripPerson {
  id: string
  name: string
  /** Set when this person is a signed-in member (owner or collaborator). */
  userId?: string
}

export type ExpenseCategory = "lodging" | "transport" | "food" | "activities" | "shopping" | "other"

/** Money actually spent: the "spent" side of the budget. */
export interface TripExpense {
  id: string
  title: string
  amount: number
  currency: string
  category: ExpenseCategory
  /** ISO date the money was spent. */
  date?: string
  /** The stop it paid for, when there is one. */
  itemId?: string
  /** `TripPerson.id` of whoever paid. */
  paidBy?: string
  /** `TripPerson.id`s sharing it equally; absent or empty means everyone. */
  splitWith?: string[]
  notes?: string
  createdAt: string
}

export interface TripBudget {
  /** The currency every total is shown in. */
  currency: string
  /** The whole-trip budget, in `currency`. */
  total?: number
}

export type ChecklistGroup = "packing" | "todo" | "documents"

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
  group: ChecklistGroup
  /** `TripPerson.id` it is assigned to. */
  assignee?: string
  createdAt: string
}

export interface Trip {
  id: string
  /** URL permalink (unique across trips); routes resolve by id or slug. */
  slug?: string
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
  invites?: TripInvite[]
  /** Map anchor for the trip; derived from located items when absent. */
  center?: TripCenter
  // Legacy Korea behavior: every signed-in user can view and edit. New trips
  // default to private (owner + collaborators only).
  sharedWithAllUsers?: boolean
  appearance?: TripAppearance
  days: TripDay[]
  /** Budget currency and limit. */
  budget?: TripBudget
  /** Who is travelling (for splitting costs and assigning tasks). */
  party?: TripPerson[]
  expenses?: TripExpense[]
  checklist?: ChecklistItem[]
  /** Places saved for later that are not on any day yet. */
  ideas?: ItineraryItem[]
  createdAt: string
  updatedAt: string
}

// ── AI enhancement model ─────────────────────────────────────────────────

export type SuggestionKind = "add" | "edit" | "remove" | "reorder" | "move" | "swap_days" | "warning" | "info"

/** What the enhancement decided about adding places. Always set on a
 *  complete run so the UI can explain a no-op as well as a successful add. */
export type EnhancementOutcome = "added_places" | "no_adds_needed" | "no_adds_possible"

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
  /** "move": the day the item goes to. "swap_days": the day traded with `dayId`. */
  toDayId?: string
  /** "add" only: the wishlist idea (`trip.ideas[].id`) this stop schedules.
   *  Applying it takes the idea off the wishlist in the same write. */
  fromIdeaId?: string
}

/** What a review was asked to do. Stored with the queued run, so every
 *  attempt re-reads the trip and works from the same request. */
export interface ReviewRequest {
  scope: "day" | "trip"
  dayId?: string
  /** Optional traveler focus steering the review. */
  prompt?: string
}

/** Where a run is in the durable review queue. Kept off `status` on
 *  purpose: older clients treat any status but "running" as finished.
 *  "queued": waiting for a worker (first try or a retry). "working": a
 *  worker holds the lease. "done": the run reached complete or error. */
export interface RunQueueInfo {
  state: "queued" | "working" | "done"
  /** Attempts started so far (0 while first queued). */
  attempt: number
  maxAttempts: number
  /** When a queued run may next be claimed (ISO). */
  nextAttemptAt?: string
  /** Why the last attempt did not finish, when one failed. */
  lastError?: string
}

/** What every run carries, whatever state it is in. The client reads
 *  `suggestions` and `appliedSuggestionIds` on every run, so they stay on
 *  all three variants. */
export interface EnhancementRunBase {
  id: string
  tripId: string
  scope: "day" | "trip"
  dayId?: string
  summary?: string
  suggestions: EnhancementSuggestion[]
  appliedSuggestionIds: string[]
  /** Live forecast fetched during the run — auto-merged onto day.weather
   *  (trusted metadata sync, not a reviewable suggestion). */
  weatherByDate?: Record<string, DayWeather>
  /** Queue progress, kept in step with the queue by the store. Absent on
   *  runs made before the durable queue. */
  queue?: RunQueueInfo
  createdAt: string
}

export interface RunningEnhancementRun extends EnhancementRunBase {
  status: "running"
}

export interface CompleteEnhancementRun extends EnhancementRunBase {
  status: "complete"
  /** Structured add/no-add decision. */
  outcome: EnhancementOutcome
  /** 1–3 sentences: why places were added, or why they were not. */
  outcomeReason: string
}

export interface FailedEnhancementRun extends EnhancementRunBase {
  status: "error"
  error: string
  /** A failed run never added anything; the reason says so in words. */
  outcome: "no_adds_possible"
  outcomeReason: string
}

export type EnhancementRun = RunningEnhancementRun | CompleteEnhancementRun | FailedEnhancementRun

export type EnhancementRunEnd =
  | { status: "complete"; outcome: EnhancementOutcome; outcomeReason: string }
  | { status: "error"; error: string; outcomeReason?: string }

export const RUN_FAILED_REASON = "The AI review failed before it could add places."

/** A run made before the durable queue that is still `running` after this
 *  long was stranded by a process restart, so readers treat it as failed. */
export const STALE_RUN_MS = 10 * 60_000

// ── Durable review queue ─────────────────────────────────────────────────
//
// A review is a row in `trip_enhancement_runs` that a worker claims with a
// lease. A crash or restart lets the lease lapse and another claim retries
// it; a failed attempt is retried with backoff until `maxAttempts`.

/** Attempts a review gets before it fails for good. */
export const REVIEW_MAX_ATTEMPTS = 3
/** How long one claim holds a run without a heartbeat. */
export const REVIEW_LEASE_MS = 90_000
/** How often a working run renews its lease. */
export const REVIEW_HEARTBEAT_MS = 30_000
/** One attempt's whole budget, across every model and tool it tries. */
export const REVIEW_ATTEMPT_DEADLINE_MS = 4 * 60_000
/** Backoff before retry n (1-based); the last entry repeats. Jittered by the worker. */
export const REVIEW_RETRY_BACKOFF_MS = [5_000, 30_000] as const
/** A queued run older than this reads as failed: no worker took it. */
export const QUEUED_RUN_MAX_MS = 30 * 60_000
/** No attempt starts on a run older than this, so every attempt ends (by its
 *  deadline) before readers call the run failed: a run shown as failed never
 *  writes the trip afterwards. Such a run is failed instead of claimed. */
export const REVIEW_CLAIM_MAX_AGE_MS = QUEUED_RUN_MAX_MS - REVIEW_ATTEMPT_DEADLINE_MS - 60_000

function runBase(run: EnhancementRunBase): EnhancementRunBase {
  return {
    id: run.id,
    tripId: run.tripId,
    scope: run.scope,
    ...(run.dayId !== undefined ? { dayId: run.dayId } : {}),
    ...(run.summary !== undefined ? { summary: run.summary } : {}),
    suggestions: run.suggestions,
    appliedSuggestionIds: run.appliedSuggestionIds,
    ...(run.weatherByDate !== undefined ? { weatherByDate: run.weatherByDate } : {}),
    ...(run.queue !== undefined ? { queue: run.queue } : {}),
    createdAt: run.createdAt,
  }
}

/** The one way a run leaves `running` (or is re-stamped): keeps the shared
 *  fields and sets exactly the fields its end state needs. */
export function finishRun(run: EnhancementRunBase, end: Extract<EnhancementRunEnd, { status: "complete" }>): CompleteEnhancementRun
export function finishRun(run: EnhancementRunBase, end: Extract<EnhancementRunEnd, { status: "error" }>): FailedEnhancementRun
export function finishRun(run: EnhancementRunBase, end: EnhancementRunEnd): CompleteEnhancementRun | FailedEnhancementRun
export function finishRun(run: EnhancementRunBase, end: EnhancementRunEnd): CompleteEnhancementRun | FailedEnhancementRun {
  if (end.status === "complete") {
    return { ...runBase(run), status: "complete", outcome: end.outcome, outcomeReason: end.outcomeReason }
  }
  return {
    ...runBase(run),
    status: "error",
    error: end.error,
    outcome: "no_adds_possible",
    outcomeReason: end.outcomeReason ?? RUN_FAILED_REASON,
  }
}

/** True for a run whose background work may still finish. */
export function isLiveRun(run: EnhancementRun, now = Date.now()): run is RunningEnhancementRun {
  const maxAge = run.queue ? QUEUED_RUN_MAX_MS : STALE_RUN_MS
  return run.status === "running" && now - Date.parse(run.createdAt) < maxAge
}

/** The run as a reader should see it: a stranded `running` run reads as failed. */
export function settleStaleRun(run: EnhancementRun, now = Date.now()): EnhancementRun {
  if (run.status !== "running" || isLiveRun(run, now)) return run
  return finishRun(run, {
    status: "error",
    error: "The AI review was interrupted. Nothing in your itinerary changed, so you can run it again.",
  })
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
  name: z.string().max(80).optional(),
})

export const centerSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

export const createInviteSchema = z.object({
  role: z.enum(["viewer", "editor"]),
})

export const joinTripSchema = z.object({
  name: z
    .string()
    .max(400)
    .transform((s) => s.trim().slice(0, 80))
    .optional(),
})

// NOTE: the editor saves the whole document on a debounce, so transient
// editing states (a just-added item with an empty title, a place whose name
// hasn't been typed yet) must validate. Empty strings are allowed here;
// display layers render placeholders for them.
export const locationSchema = z.object({
  name: z.string().max(200),
  address: z.string().max(400).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  placeId: z.string().max(256).optional(),
  category: z.string().max(40).optional(),
  source: z.enum(["user", "ai", "migration"]).default("user"),
  confidence: z.enum(["high", "medium", "low"]).optional(),
})

const currencyCode = z.string().regex(/^[A-Z]{3}$/, "ISO 4217 code")
/** Major units; generous ceiling, never negative. */
const moneyAmount = z.number().finite().min(0).max(1_000_000_000)

export const moneySchema = z.object({ amount: moneyAmount, currency: currencyCode })

export const itemSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(["place", "note", "section", "reservation"]),
  title: z.string().max(300),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  notes: z.string().max(8000).optional(),
  links: z.array(z.string().max(2000)).max(20).optional(),
  status: z.enum(["none", "optional", "booked", "completed", "skipped", "needs_review"]).default("none"),
  location: locationSchema.optional(),
  reservation: z
    .object({
      type: z.string().max(40),
      status: z.enum(["confirmed", "tentative", "pending"]),
      confirmation: z.string().max(120).optional(),
      contact: z.string().max(200).optional(),
      url: z.string().max(2000).optional(),
      provider: z.string().max(120).optional(),
      number: z.string().max(40).optional(),
      from: z.string().max(120).optional(),
      to: z.string().max(120).optional(),
      endDate: isoDate.optional(),
      endTimezone: z.string().max(64).optional(),
      seat: z.string().max(40).optional(),
      terminal: z.string().max(40).optional(),
    })
    .optional(),
  cost: moneySchema.optional(),
  highlight: z.boolean().optional(),
  theme: z.enum(ITEM_THEMES).optional(),
  createdBy: z.enum(["user", "ai", "migration"]).default("user"),
})

export const calloutSchema = z.object({
  icon: z.string().max(8),
  tone: z.enum(["info", "warn", "success", "alert"]),
  // Empty body allowed: a just-added callout saves mid-edit (see itemSchema note).
  body: z.string().max(1000),
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
  // ZWJ / flag emoji sequences regularly exceed 8 UTF-16 code units.
  emoji: z.string().max(32).optional(),
  city: z.string().max(80).optional(),
  notes: z.string().max(8000).optional(),
  neighborhoods: z.array(z.string().min(1).max(80)).max(12).optional(),
  weather: weatherSchema.optional(),
  callouts: z.array(calloutSchema).max(12).optional(),
  timezone: z.string().max(64).optional(),
  journal: z.string().max(8000).optional(),
  items: z.array(itemSchema).max(200),
})

export const appearanceSchema = z.object({
  accent: z.enum(["rose", "amber", "emerald", "sky", "violet"]).optional(),
  eyebrow: z.string().max(60).optional(),
  subtitle: z.string().max(120).optional(),
  headline: z.string().max(600).optional(),
  cityTags: z.record(z.string().max(80), z.string().max(4)).optional(),
})

export const personSchema = z.object({
  id: z.string().min(1).max(64),
  // Empty allowed mid-edit (see itemSchema note).
  name: z.string().max(80),
  userId: z.string().max(128).optional(),
})

export const expenseSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().max(200),
  amount: moneyAmount,
  currency: currencyCode,
  category: z.enum(["lodging", "transport", "food", "activities", "shopping", "other"]),
  date: isoDate.optional(),
  itemId: z.string().max(64).optional(),
  paidBy: z.string().max(64).optional(),
  splitWith: z.array(z.string().max(64)).max(50).optional(),
  notes: z.string().max(2000).optional(),
  createdAt: z.string().max(64),
})

export const budgetSchema = z.object({
  currency: currencyCode,
  total: moneyAmount.optional(),
})

export const checklistItemSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().max(300),
  done: z.boolean(),
  group: z.enum(["packing", "todo", "documents"]),
  assignee: z.string().max(64).optional(),
  createdAt: z.string().max(64),
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
  center: centerSchema.optional(),
})

/** Path segments the client router owns under /trips; a trip cannot take
 *  one as its permalink or the trip would be unreachable. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set(["new", "join", "places-catalog"])

export const updateTripSchema = z.object({
  /** The `updatedAt` the client's edit was based on. When set and the stored
   *  trip has moved on, the save is refused with 409 instead of overwriting. */
  baseUpdatedAt: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(160).optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])?$/, "lowercase letters, numbers, and hyphens only")
    .refine((slug) => !RESERVED_SLUGS.has(slug), "that permalink is reserved")
    .optional(),
  destinations: z.array(z.string().min(1).max(120)).min(1).max(20).optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  timezone: z.string().min(1).max(64).optional(),
  status: z.enum(["draft", "active", "archived", "completed"]).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  description: z.string().max(4000).nullable().optional(),
  collaborators: z.array(collaboratorSchema).max(50).optional(),
  center: centerSchema.optional(),
  appearance: appearanceSchema.optional(),
  days: z.array(daySchema).max(60).optional(),
  /** `null` removes the budget. */
  budget: budgetSchema.nullable().optional(),
  party: z.array(personSchema).max(50).optional(),
  expenses: z.array(expenseSchema).max(1000).optional(),
  checklist: z.array(checklistItemSchema).max(500).optional(),
  ideas: z.array(itemSchema).max(200).optional(),
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

const chatPriorPlaceSchema = z.object({
  ref: z.string().max(300).optional(),
  name: z.string().min(1).max(200),
  address: z.string().max(400).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  category: z.string().max(40).optional(),
  placeId: z.string().max(256).optional(),
  mapsUrl: z.string().max(2000).optional(),
  dayId: z.string().max(64).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
})

export const tripChatRequestSchema = z.object({
  prompt: z.string().min(1, "Prompt is required").max(2000),
  dayId: z.string().max(64).optional(),
  /** The traveller's position, only when they chose to share it with this
   *  message. Used for the answer and never stored. */
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
        /** Cards shown under that reply, so "the second one" resolves. */
        places: z.array(chatPriorPlaceSchema).max(8).optional(),
        proposal: z
          .object({
            summary: z.string().max(200),
            state: z.enum(["pending", "applied", "dismissed", "undone"]).optional(),
          })
          .optional(),
      }),
    )
    .max(40)
    .optional(),
})

export const enhanceRequestSchema = z.object({
  scope: z.enum(["day", "trip"]),
  dayId: z.string().max(64).optional(),
  /** Optional traveler focus, e.g. "find more vegetarian dinner options". */
  prompt: z.string().max(2000).optional(),
})

// ── Permalinks ───────────────────────────────────────────────────────────

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])?$/

export const slugSchema = z
  .string()
  .regex(SLUG_PATTERN, "lowercase letters, numbers, and hyphens only (3-80 chars)")

/** URL-safe slug from free text: diacritics stripped, non-alphanumerics
 *  collapsed to hyphens. Returns "" when nothing survives. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "")
}

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
  // ZWJ / flag emoji sequences regularly exceed 8 UTF-16 code units.
  emoji: z.string().max(32).optional(),
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
  kind: z.enum(["add", "edit", "remove", "reorder", "move", "swap_days", "warning", "info"]),
  dayId: z.string().max(64).optional(),
  itemId: z.string().max(64).optional(),
  title: z.string().min(1).max(300),
  detail: z.string().max(2000).default(""),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
  proposedItem: aiItemSchema.optional(),
  proposedChanges: aiItemSchema.partial().optional(),
  proposedOrder: z.array(z.string().max(64)).max(200).optional(),
  toDayId: z.string().max(64).optional(),
})

export const enhancementOutcomeSchema = z.enum(["added_places", "no_adds_needed", "no_adds_possible"])

export const aiEnhancementSchema = z.object({
  summary: z.string().max(2000).optional(),
  outcome: enhancementOutcomeSchema.optional(),
  outcomeReason: z.string().max(2000).optional(),
  suggestions: z.array(aiSuggestionSchema).max(40).default([]),
})

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * A stop is on a day or on the wishlist, never both. A save that brings back
 * an idea already on a day (an older client's merge, where an edit to the
 * idea beat the review that scheduled it) keeps the stop and drops the idea.
 */
export function withoutScheduledIdeas<T extends Pick<Trip, "days" | "ideas">>(trip: T): T {
  if (!trip.ideas?.length) return trip
  const onDays = new Set(trip.days.flatMap((d) => d.items.map((i) => i.id)))
  return trip.ideas.some((idea) => onDays.has(idea.id)) ? { ...trip, ideas: trip.ideas.filter((idea) => !onDays.has(idea.id)) } : trip
}

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
