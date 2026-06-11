# Multi-Trip Travel Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the hardcoded Korea trip into a modular multi-trip travel planner: trip CRUD with permissions, AI starter-itinerary generation, an editable day-by-day itinerary UI, day/trip AI enhancement with reviewable suggestions, and generic Map Mode integration — with the Korea trip migrated in as a normal trip.

**Architecture:** A document-style `Trip` model (metadata + `days[].items[]`, each item optionally carrying a structured `TripLocation`) behind a `TripStore` interface (Supabase `trips` jsonb table, in-memory fallback for dev/tests). A new `/api/trips` Hono router (Clerk-authenticated, dependency-injected for tests) provides CRUD, AI generation/enhancement, and a per-day places endpoint that emits the existing `PlacesResponse` contract so `MapModeOverlay` works unchanged for any trip. The Korea trip is built from the existing `koreaSnapshot` + `koreaPlaces` by a pure converter and seeded into the store; legacy `/api/korea` routes keep serving the bespoke Korea UI (backward compat) while Korea also appears as a normal trip.

**Tech Stack:** Bun + Hono + Zod + Groq JSON-mode (existing pattern in `server/src/routes/entity.ts`), Supabase (service role), Clerk, React 19 + React Router v7, existing Korea Map Mode components.

---

### Task 1: Trip domain model + Zod schemas

**Files:**
- Create: `server/src/trips/types.ts`

Core types (shared shape with frontend mirror):

```ts
export type TripStatus = "draft" | "active" | "archived" | "completed"
export type CollaboratorRole = "viewer" | "editor"
export interface TripCollaborator { userId: string; role: CollaboratorRole }

export type LocationSource = "user" | "ai" | "migration"
export interface TripLocation {
  name: string
  address?: string
  lat?: number
  lng?: number
  placeId?: string
  category?: string          // PlaceCategory vocabulary from koreaPlaces
  source: LocationSource
  confidence?: "high" | "medium" | "low"
}

export type ItemKind = "place" | "note" | "section" | "reservation"
export type ItemStatus = "none" | "optional" | "booked" | "completed" | "needs_review"
export interface ItineraryItem {
  id: string
  kind: ItemKind
  title: string
  time?: string              // "HH:mm"
  endTime?: string
  notes?: string
  links?: string[]
  status: ItemStatus
  location?: TripLocation
  reservation?: { type: string; status: "confirmed" | "tentative" | "pending"; confirmation?: string; contact?: string; url?: string }
  createdBy: LocationSource
}

export interface TripDay {
  id: string                 // stable slug, e.g. "day-1"
  date: string               // ISO yyyy-mm-dd
  title?: string
  emoji?: string
  city?: string
  notes?: string
  items: ItineraryItem[]
}

export interface Trip {
  id: string
  ownerId: string
  name: string
  destinations: string[]
  startDate: string
  endDate: string
  timezone: string           // IANA
  status: TripStatus
  tags: string[]
  description?: string
  collaborators: TripCollaborator[]
  sharedWithAllUsers?: boolean   // legacy Korea behavior: any signed-in user can view/edit
  days: TripDay[]
  createdAt: string
  updatedAt: string
}
```

Plus enhancement types (`EnhancementRun`, `EnhancementSuggestion` with kinds `add|edit|remove|reorder|warning|info`, optional `proposedItem`/`proposedChanges`, `confidence`), Zod schemas for create/update payloads and the AI output formats, `DEFAULT_ITINERARY_PROMPT` constant (verbatim from spec), and id helpers.

### Task 2: TripStore (memory + Supabase)

**Files:**
- Create: `server/src/trips/store.ts`
- Modify: `supabase/schema.sql` (append `trips` + `trip_enhancement_runs` tables, service-role RLS like `korea_entity_about`)

`TripStore` interface: `list(userId)`, `get(id)`, `create(trip)`, `update(trip)`, `delete(id)`, `listRuns(tripId)`, `getRun(id)`, `saveRun(run)`. `MemoryTripStore` (Map-backed). `SupabaseTripStore` storing metadata columns + `data jsonb` (days/collaborators). `getTripStore()` returns Supabase store when `config.supabaseUrl && config.supabaseServiceKey`, else memory. Both seed the Korea trip on first access if missing (`ensureSeeded`).

### Task 3: Korea migration converter

**Files:**
- Create: `server/src/trips/koreaTrip.ts`
- Test: `server/src/trips/koreaTrip.test.ts`

Pure `buildKoreaTrip(): Trip` from `koreaSnapshot` + `koreaPlaces`:
- Trip metadata from `snapshot.trip` (id `korea-2026`, timezone `Asia/Seoul`, status by date, `sharedWithAllUsers: true`, owner `legacy:korea`).
- Each `Day` → `TripDay` (id = slug): reservation items (location alias-matched against `koreaPlaces`, `createdBy: "migration"`), one `section` item per `DaySection` (bullets preserved as markdown notes), `place` items for bullet-mentioned places (alias matching, same logic as `rankDayPlaces`), callouts → note items.
- Tests: 12 days; every snapshot reservation appears exactly once as a reservation item on the right day; every place item has lat/lng; day dates match.

### Task 4: Trips router (CRUD + permissions + Map Mode places)

**Files:**
- Create: `server/src/routes/trips.ts` (`createTripsRouter(deps)` — store + auth injected)
- Test: `server/src/routes/trips.test.ts`
- Modify: `server/app.ts` (mount under `/api/trips` behind Clerk auth, 503 JSON fallback like IG pattern)

Endpoints: `GET /` (visible trips: owner, collaborator, or `sharedWithAllUsers`), `POST /` (create blank or `generate: true`), `GET/:id`, `PATCH /:id` (metadata and/or full `days` replacement — document-save model), `DELETE /:id` (owner only), `GET /:id/days/:dayId/places` (emits the existing `PlacesResponse`/`RankedPlace` shape from items with locations; priority `scheduled` for reservations/booked, `core` otherwise; distance enrichment via `haversineMeters`), enhancement endpoints (Task 6). Edit allowed for owner, editor collaborators, or `sharedWithAllUsers`.

### Task 5: AI starter itinerary generation

**Files:**
- Create: `server/src/trips/ai.ts`
- Test: `server/src/trips/ai.test.ts` (mock LLM + geocoder)

`generateItinerary({ trip, prompt, preferences, llm, geocode })` → Groq JSON-mode call (entity.ts pattern, `openai/gpt-oss-120b`) demanding strict JSON: `{ summary, days: [{ title, items: [{ kind, title, time?, notes?, location?: { name, address?, lat?, lng?, category? }, status? }] }] }`, validated with Zod (salvage partial). Items mapped with `createdBy: "ai"`, `location.source: "ai"`; missing coordinates geocoded best-effort via injected geocoder (Google Maps key, reusing the igPlaces geocode pattern) and marked `confidence`. Day count derived from trip dates. `POST /api/trips/:id/generate` wires it.

### Task 6: AI enhancement (day + trip)

**Files:**
- Modify: `server/src/trips/ai.ts`, `server/src/routes/trips.ts`
- Test: covered in `ai.test.ts` + `trips.test.ts`

`enhanceTrip({ trip, scope, dayId, llm, fetchWeather })`:
- Deterministic pre-pass: per-day consecutive-item haversine distances and time gaps (travel-realism signals), missing-coordinate flags.
- Open-Meteo forecast (no key) for the day's median coordinates when within 16 days, injected fetch for tests.
- LLM JSON-mode returns `{ summary, suggestions: [...] }` (verify places/hours, events, ordering, schedule realism, alternatives, warnings; preserve intent).
- Stored as `EnhancementRun`; `POST /:id/enhance` returns the run; `POST /:id/enhancements/:runId/apply { suggestionIds }` applies `add`/`edit`/`remove`/`reorder` suggestions to the trip (reviewable-first pattern).

### Task 7: Frontend — trips API + types + routes

**Files:**
- Create: `frontend/src/pages/Trips/types.ts`, `tripsApi.ts`, `TripsLayout.tsx` (Clerk gate, theme, header)
- Modify: `frontend/src/AppRoutes.tsx` (lazy `/trips`, `/trips/new`, `/trips/:tripId`)

`tripsApi.ts` uses Clerk `getToken()` (same pattern as `placesApi.ts`) for all calls.

### Task 8: Frontend — trips index + create flow

**Files:**
- Create: `frontend/src/pages/Trips/TripsIndex.tsx`, `TripCreate.tsx`

Index: card list (name, dates, destinations, status chip, collaborator count), empty state, delete with confirm. Create: metadata form (name, destinations, start/end, timezone, status, collaborators emails/ids, tags), mode toggle Blank vs AI (prompt textarea prefilled with `DEFAULT_ITINERARY_PROMPT`, optional preferences: pace, budget, interests, food, must-sees, avoid, lodging, transport), loading/error states, navigates to detail on success.

### Task 9: Frontend — itinerary editor (Wanderlog × Notion)

**Files:**
- Create: `frontend/src/pages/Trips/TripDetail.tsx`, `ItemEditor.tsx`, `tripEdits.ts` (pure helpers)
- Test: `frontend/src/pages/Trips/__tests__/tripEdits.test.ts`

Day-by-day editor: add item (place/note/section), inline edit title/time/notes/links/location fields, reorder (move up/down), move between days, duplicate, delete, status select (optional/booked/completed/needs review), convert note → place, day notes block. Pure mutation helpers in `tripEdits.ts` (reorder/move/duplicate/convert) with vitest coverage. Saves via debounced `PATCH` of `days`. Per-day "Map" button → Map Mode; "Enhance day"/"Enhance trip" buttons → suggestions review sheet (accept/dismiss checkboxes → apply endpoint).

### Task 10: Map Mode generalization

**Files:**
- Modify: `frontend/src/pages/Korea/MapModeOverlay.tsx` (optional `placesUrl` prop; default remains the Korea endpoint)
- Create: usage from `TripDetail.tsx` passing `/api/trips/:id/days/:dayId/places`

No changes to the 3D scene — the generic endpoint emits the same `PlacesResponse` contract.

### Task 11: Verification gate + PR

- `KLUSTER_API_KEY=ci-stub KLUSTER_API_BASE_URL=https://example.invalid IG_WORKER_ENABLED=false bun test --bail server/src`
- `cd frontend && bun run typecheck && bun run build && bun run test:run`
- Branch + commit increments; PR with detailed description; update CLAUDE.md routing/structure sections for the new `/trips` app.
