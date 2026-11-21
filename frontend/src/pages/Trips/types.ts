// Frontend mirror of the server trip model (server/src/trips/types.ts).

export type TripStatus = "draft" | "active" | "archived" | "completed"
export type CollaboratorRole = "viewer" | "editor"
export type LocationSource = "user" | "ai" | "migration"
export type ConfidenceLevel = "high" | "medium" | "low"
export type ItemKind = "place" | "note" | "section" | "reservation"
export type ItemStatus = "none" | "optional" | "booked" | "completed" | "needs_review"
export type TripAccess = "none" | "view" | "edit" | "owner"

export interface TripCollaborator {
  userId: string
  role: CollaboratorRole
  /** Display name captured when they joined by invite link. */
  name?: string
}

export interface TripInvite {
  token: string
  role: CollaboratorRole
  createdAt: string
}

export interface TripCenter {
  lat: number
  lng: number
}

export interface TripLocation {
  name: string
  address?: string
  lat?: number
  lng?: number
  placeId?: string
  category?: string
  source: LocationSource
  confidence?: ConfidenceLevel
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
  time?: string
  endTime?: string
  notes?: string
  links?: string[]
  status: ItemStatus
  location?: TripLocation
  reservation?: {
    type: string
    status: "confirmed" | "tentative" | "pending"
    confirmation?: string
    contact?: string
    url?: string
  }
  /** What this stop or booking costs: the planned side of the budget. */
  cost?: Money
  createdBy: LocationSource
}

export interface DayCallout {
  icon: string
  tone: "info" | "warn" | "success" | "alert"
  body: string
}

export interface DayWeather {
  highC: number
  lowC: number
  condition: string
}

export interface TripDay {
  id: string
  date: string
  title?: string
  emoji?: string
  city?: string
  notes?: string
  neighborhoods?: string[]
  weather?: DayWeather
  callouts?: DayCallout[]
  items: ItineraryItem[]
}

export type TripAccent = "rose" | "amber" | "emerald" | "sky" | "violet"

export interface TripAppearance {
  accent?: TripAccent
  eyebrow?: string
  subtitle?: string
  headline?: string
  cityTags?: Record<string, string>
}

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
  slug?: string
  ownerId: string
  name: string
  destinations: string[]
  startDate: string
  endDate: string
  timezone: string
  status: TripStatus
  tags: string[]
  description?: string
  collaborators: TripCollaborator[]
  sharedWithAllUsers?: boolean
  appearance?: TripAppearance
  /** Where the trip is on the globe before it has any pinned places. */
  center?: TripCenter
  /** Owner-only: active invite links. */
  invites?: TripInvite[]
  days: TripDay[]
  /** Budget currency and limit. */
  budget?: TripBudget
  /** Who is travelling (for splitting costs and assigning tasks). */
  party?: TripPerson[]
  expenses?: TripExpense[]
  checklist?: ChecklistItem[]
  createdAt: string
  updatedAt: string
}

export interface TripSummary {
  id: string
  slug?: string
  name: string
  destinations: string[]
  startDate: string
  endDate: string
  timezone: string
  status: TripStatus
  tags: string[]
  description?: string
  accent?: TripAccent
  collaborators: TripCollaborator[]
  sharedWithAllUsers: boolean
  dayCount: number
  itemCount: number
  /** Items with coordinates. */
  placeCount?: number
  center?: TripCenter
  /** Located stops in itinerary order as `[lng, lat]`, sampled to ≤ 48. */
  points?: Array<[number, number]>
  access: TripAccess
  updatedAt: string
}

export type SuggestionKind = "add" | "edit" | "remove" | "reorder" | "move" | "swap_days" | "warning" | "info"

export type EnhancementOutcome = "added_places" | "no_adds_needed" | "no_adds_possible"

export interface EnhancementSuggestion {
  id: string
  kind: SuggestionKind
  dayId?: string
  itemId?: string
  title: string
  detail: string
  confidence: ConfidenceLevel
  proposedItem?: ItineraryItem
  proposedChanges?: Partial<Omit<ItineraryItem, "id">>
  proposedOrder?: string[]
  /** "move": the day the item goes to. "swap_days": the day traded with `dayId`. */
  toDayId?: string
}

export interface EnhancementRun {
  id: string
  tripId: string
  scope: "day" | "trip"
  dayId?: string
  status: "running" | "complete" | "error"
  summary?: string
  outcome?: EnhancementOutcome
  outcomeReason?: string
  suggestions: EnhancementSuggestion[]
  appliedSuggestionIds: string[]
  weatherByDate?: Record<string, DayWeather>
  error?: string
  createdAt: string
}

export interface GeneratePreferences {
  pace?: string
  budget?: string
  interests?: string
  food?: string
  mobility?: string
  mustSee?: string
  avoid?: string
  lodging?: string
  transport?: string
}

// Default AI prompt — kept in sync with DEFAULT_ITINERARY_PROMPT on the server.
export const DEFAULT_ITINERARY_PROMPT =
  "Build a practical, well-paced itinerary for this trip. Include activities, meals, " +
  "neighborhoods, realistic travel times, and logical routing. Prefer useful structure " +
  "over excessive detail, and keep everything easy to edit."
