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
  days: TripDay[]
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
  collaborators: TripCollaborator[]
  sharedWithAllUsers: boolean
  dayCount: number
  itemCount: number
  access: TripAccess
  updatedAt: string
}

export type SuggestionKind = "add" | "edit" | "remove" | "reorder" | "warning" | "info"

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
