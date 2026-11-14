# Trips system (engineering reference)

Read before changing `server/src/trips/`, `server/src/igPlaces/`, `server/src/routes/trips.ts` or `frontend/src/pages/Trips/`. Design context: [`PRODUCT.md`](../PRODUCT.md) and [`DESIGN.md`](../DESIGN.md). Always-on rules: [`AGENTS.md`](../AGENTS.md).

## Multi-trip travel planner (`/trips`, `server/src/trips/`)

The Korea trip is one instance of a generic trip system. Trips are document-model
records (`Trip` = metadata + `days[].items[]`, each place item carrying a structured
`TripLocation` with lat/lng/category/source/confidence) stored in Supabase
(`trips` + `trip_enhancement_runs`, jsonb docs; in-memory fallback when Supabase
env is missing).

| Piece | Location | Notes |
|-------|----------|-------|
| Domain model + Zod schemas | `server/src/trips/types.ts` | Shared shape mirrored in `frontend/src/pages/Trips/types.ts` |
| Store | `server/src/trips/store.ts` | `getTripStore()`: Supabase or memory |
| Korea migration | `server/src/trips/koreaTrip.ts` | Pure `buildKoreaTrip()` from `koreaSnapshot`/`koreaPlaces`; seeded on first `/api/trips` request as trip `korea-2026` (shared with all signed-in users, not deletable) |
| AI generation/enhancement | `server/src/trips/ai.ts`, `prompts.ts`, `signals.ts`, `lodging.ts`, `jsonRepair.ts` | Drafts are built to finish: trips up to 4 days are one call; longer trips get a short outline (`OUTLINE_SYSTEM`) and are then drafted 3 days at a time in parallel, each chunk retried once, with repeat venues dropped across days and any day still thin reported as `incompleteDays` (never a failed request). Model output cut off mid-JSON is recovered by `repairTruncatedJson`. A redraft keeps what the traveller fixed (bookings, booked / completed stops, lodging; `isFixed`) and plans around it. `lodging.ts` works out the base for each day (`baseByDay`) and tells the planner and reviewer how far each day starts and ends from it; the review can also `move` a stop to another day or `swap_days`. Gemini 4 Hydrogen primary (`GEMINI_MODEL`; steps down to 3.8 Flash once if the key cannot use it), Groq as the backup on failure or when Gemini is missing; Maps grounding first, then Search (never both in one request); system prompts live in `prompts.ts`; `signals.ts` computes per-day facts (missing meals, gaps ≥ 2.5 h, hops ≥ 4 km, clock order) that the review and the concierge are given, offers a model-free shorter walking order, and inserts timed adds in clock order; AI places missing coords are geocoded with Google, or keyless Photon (`createPhotonGeocoder`) when there is no Google Maps key; Open-Meteo weather + travel-leg pre-pass; suggestions reviewable before apply (enhance auto-applies added places); single-day reviews keep suggestions that omit or invent a day id; the dropped-suggestion log line includes the zod field path |
| Concierge | `server/src/trips/chat.ts`, `conciergeTools.ts` | `POST /api/trips/:id/chat` SSE. A tool loop (up to 5 rounds) on Gemini 4 Hydrogen: Google Search grounding plus function calls `find_places` (Places API: hours for that weekday, rating, price, walk from the plan), `get_directions` (Routes API: transit lines and times) and `propose_changes` (add / set_time / move / remove / reorder as one validated batch). Nothing edits the trip server-side: the client applies a proposal on confirmation, with Undo. Events: text deltas, `{status}` (real tool activity), `{places}`, `{proposal}`, `{sources}`, `{followups}`, `{meta:{model}}`. Context carries the local clock and trip phase, item ids, computed legs and day facts, the live forecast, an opt-in one-message location, and earlier cards so "the second one" resolves. Korea seed can fall back to `/api/korea/chat` |
| Instagram import | `server/src/routes/instagramPlaces.ts`, `server/src/igPlaces/*`, `frontend/src/pages/Trips/instagram/*` | `/api/instagram/*` (same router as the legacy `/api/korea/places/from-instagram/*`): `POST /` queues posts (`skipVideo` = quick caption read), `GET /jobs?logs=0`, `POST /jobs/:id/retry|reextract`, `GET /extracted` (the user's saved places, searchable), `DELETE /extracted/:id`. Posts are fetched through Apify's Instagram scraper (`APIFY_TOKEN`; the free plan covers personal use, comments come with the post), then Bright Data if a key is set, then yt-dlp (works from a home IP, not from the droplet). Gemini with Maps grounding extracts the places; geocoding is worldwide (the Korea box and region bias apply only when the post points to Korea). Places belong to the user, not a trip; adding one copies it into the trip document with the post link in `links[]` |
| Place catalog | `server/src/trips/placeCatalog.ts` | `GET /api/trips/places-catalog` |
| Router | `server/src/routes/trips.ts` | `createTripsRouter(deps)` — Clerk required. CRUD, `/generate`, `/enhance`, `/enhancements/:runId/apply`, `/chat`, `/days/:dayId/places`, plus sharing (below). Summaries from `GET /api/trips` carry `center`, `points` (≤48 `[lng,lat]`) and `placeCount`; trips carry `center` |
| Sharing | `server/src/routes/trips.ts`, `components/ShareDialog.tsx`, `TripJoin.tsx` | Link-first. `POST /:id/invites` (owner; role viewer/editor), `POST /join/:token` (any signed-in user joins with that role), `DELETE /:id/invites/:token` (turn a link off), `POST /:id/leave` (collaborator). `invites` are stripped from trip payloads for non-owners. Collaborators carry an optional display `name` |
| Frontend geocoding | `frontend/src/pages/Trips/geocode.ts` | Keyless, via `fetchExternal` (Effect): Open-Meteo geocoding for cities (`searchCities`; supplies the IANA time zone for new trips) and Photon/OpenStreetMap for places (`searchPlaces`, biased to the day) |
| Frontend | `frontend/src/pages/Trips/` | `TripsLayout`, `TripsIndex`, `TripCreate`, **`TripWorkspace`** (`/:tripId` overview and `/:tripId/day/:dayId`; itinerary pane + sticky map), `TripJoin`, `TripChat` FAB, `workspace/*` (panels, item editor, AI sheets, details dialog + `resizeDays`), `components/*` (`kit`, `ShareDialog`, `CityField`, `DateRange`, `TripCover`), `map/*` (`AtlasMap`, lazy MapLibre `engine` incl. `renderStills` for card covers, `mapStyle`, `geo`), `useTripEditor.ts` (document state + debounced autosave + AI runs), `tripEdits.ts`, `meta.ts`, `geocode.ts` |

**Maps:** every Trips map is MapLibre GL JS v6 over OpenFreeMap vector tiles
(no API key; `map/mapStyle.ts`). The photoreal 3D view ("Fly the day",
`photoreal/`) is optional: a day's "…" menu shows "Fly the day in 3D" when
`photorealAvailable()` is true (a Google tiles / Places key plus WebGL2 in
production; always in a dev build, which falls back to a procedural ground).

**Photoreal 3D view:** `photoreal/PhotorealOverlay` (lazy, default export)
takes `trip`, `day`, `dayNumber`, `initialStopId?`, `onClose`, `onEditStop?`
and reads the day document directly — no fetch. `photoreal/scene.ts` is the
engine: created once per open, driven by methods (`select`, `fitAll`,
`setStops`, `setTheme`, `orientNorth`, `toggleTilt`, `setUser`, `dispose`),
renders on demand. `GET /api/trips/:id/days/:dayId/places` stays for
compatibility but the client no longer calls it. AI-added places must always
carry structured locations — never prose only.

**Permissions:** owner > editor/viewer collaborators > `sharedWithAllUsers`
(legacy Korea behavior: all signed-in users can view/edit). Only owners delete,
create or revoke invite links, and change collaborators; collaborators can leave. Legacy `/api/korea/*` routes still serve snapshot
data (backward compat). Frontend `/korea*` redirects to `/trips/korea-2026`.
The snapshot is data, and the trips system is the path for all new
destination work. Do not add new destination-specific routes or logic.

## Legacy Korea pages (`frontend/src/pages/Korea/`)

Legacy Korea pages, places, and linkify implementation. Frontend `/korea*`
redirects to `/trips/korea-2026`; none of these pages is mounted by a route.
Trips imports only helpers from here (`ThemeToggle`, `koreaUtils`,
`koreaChatApi`, `ConciergeSources`, `ConciergeText*`, `types`). The old Map
Mode (overlay, scene, effects pipelines) is gone; its successor lives in
`pages/Trips/photoreal/`. Do not add `/japan`-style routes.

| File | Purpose |
|------|---------|
| `KoreaLayout.tsx` | Shell with auth gate, theme toggle, KST clock; mounts `KoreaChat` |
| `KoreaIndex.tsx` | Trip hero, day list |
| `KoreaDay.tsx` | Day detail — reservations, places, timeline |
| `KoreaChat.tsx` | Concierge SSE (`POST /api/korea/chat`) |
| `LinkifiedText.tsx` | Auto-links flight #s, addresses, phones |
| `SmartEntity.tsx` | Entity cards with linked metadata |
