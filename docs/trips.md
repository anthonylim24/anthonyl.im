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
| Domain model + Zod schemas | `server/src/trips/types.ts` | Shared shape mirrored in `frontend/src/pages/Trips/types.ts`. Planning fields on the trip document: `budget { currency, total? }` (`PATCH` with `null` clears it), `party[]` (people for splits, optional `userId`), `expenses[]` (amount, ISO currency, category, paid by, split with, optional `itemId`), `checklist[]` (text, done, group packing / todo / documents, assignee), and `cost` on an item. Amounts are finite, 0 to 1e9; currencies are three capital letters |
| Store | `server/src/trips/store.ts` | `getTripStore()`: Supabase or memory. `getBySlug` and `findByInviteToken` filter on the jsonb doc (`doc->>slug`, `doc->invites @>`), so a request never lists every trip except `GET /` and the places catalog |
| Writes | `server/src/routes/trips.ts` | The server never writes a whole trip from a snapshot it read earlier. `mutateTrip` re-reads, applies a change to the fresh copy and compare-and-sets on `updatedAt` (`updateIfUnchanged`, 3 tries); generate, enhance, apply, sharing and the Korea seed upgrade all go through it, and only touch their own fields. `PATCH /:id` merges the body's fields onto the fresh trip; with `baseUpdatedAt` in the body it refuses a save based on an older version with `409 { error: "conflict", trip }` (the trip as `GET` would return it for that user) and writes nothing. Without `baseUpdatedAt` (older clients) it merges as before |
| Korea migration | `server/src/trips/koreaTrip.ts` | Pure `buildKoreaTrip()` from `koreaSnapshot`/`koreaPlaces`; seeded on first `/api/trips` request as trip `korea-2026` (shared with all signed-in users, not deletable) |
| AI generation/enhancement | `server/src/trips/ai.ts`, `prompts.ts`, `signals.ts`, `lodging.ts`, `jsonRepair.ts` | Drafts are built to finish: trips up to 4 days are one call; longer trips get a short outline (`OUTLINE_SYSTEM`) and are then drafted 3 days at a time in parallel, each chunk retried once, with repeat venues dropped across days and any day still thin reported as `incompleteDays` (never a failed request). Model output cut off mid-JSON is recovered by `repairTruncatedJson`. A redraft keeps what the traveller fixed (bookings, booked / completed stops, lodging; `isFixed`) and plans around it. `lodging.ts` works out the base for each day (`baseByDay`) and tells the planner and reviewer how far each day starts and ends from it; the review can also `move` a stop to another day or `swap_days`. Gemini 4 Hydrogen primary (`GEMINI_MODEL`; steps down to 3.8 Flash once if the key cannot use it), Groq as the backup on failure or when Gemini is missing; Maps grounding first, then Search (never both in one request); system prompts live in `prompts.ts`; `signals.ts` computes per-day facts (missing meals, gaps ≥ 2.5 h, hops ≥ 4 km, clock order) that the review and the concierge are given, offers a model-free shorter walking order, and inserts timed adds in clock order; AI places missing coords are geocoded with Google, or keyless Photon (`createPhotonGeocoder`) when there is no Google Maps key; Open-Meteo weather + travel-leg pre-pass; suggestions reviewable before apply (enhance auto-applies added places); single-day reviews keep suggestions that omit or invent a day id; the dropped-suggestion log line includes the zod field path |
| Concierge | `server/src/trips/chat.ts`, `conciergeTools.ts` | `POST /api/trips/:id/chat` SSE. A tool loop (up to 5 rounds, at most 4 paid lookups per round; extra calls are answered as skipped) on Gemini 4 Hydrogen: Google Search grounding plus function calls `find_places` (Places API: hours for that weekday, rating, price, walk from the plan), `get_directions` (Routes API: transit lines and times) and `propose_changes` (add / set_time / move / remove / reorder as one validated batch). Nothing edits the trip server-side: the client applies a proposal on confirmation, with Undo. Events: text deltas, `{status}` (real tool activity), `{places}`, `{proposal}`, `{sources}`, `{followups}`, `{meta:{model}}`. Context carries the local clock and trip phase, item ids, computed legs and day facts, the live forecast, an opt-in one-message location, earlier cards so "the second one" resolves, stop costs, and a `PLANNING` block (budget, planned and spent totals by currency, travellers, open checklist items) when the trip has any. |
| Instagram import | `server/src/routes/instagramPlaces.ts`, `server/src/igPlaces/*`, `frontend/src/pages/Trips/instagram/*` | `/api/instagram/*` (same router as the legacy `/api/korea/places/from-instagram/*`): `POST /` queues posts (`skipVideo` = quick caption read), `GET /jobs?logs=0`, `POST /jobs/:id/retry|reextract`, `GET /extracted` (the user's saved places, searchable), `DELETE /extracted/:id`. Posts are fetched through Apify's Instagram scraper (`APIFY_TOKEN`; the free plan covers personal use, comments come with the post), then Bright Data if a key is set, then yt-dlp (works from a home IP, not from the droplet). Gemini with Maps grounding extracts the places; geocoding is worldwide (the Korea box and region bias apply only when the post points to Korea). Places belong to the user, not a trip; adding one copies it into the trip document with the post link in `links[]`. A job's dedupe key is the canonical post URL `https://www.instagram.com/{p,reel,reels,tv}/{shortcode}` (https only, every query and hash dropped; profiles, stories and other paths are refused). Job states are `pending → running → done | dead` (`transition()` in `igPlaces/types.ts`; the `ig_*` SQL functions follow the same table, a legacy `failed` reads as `dead`): claim needs attempts left, every step bumps the lock, the reaper buries a job out of attempts, complete / fail touch only a running row. A job has a hard deadline a minute under the stale-reap threshold. Media is streamed to disk under an 80 MB cap (`igPlaces/download.ts`, yt-dlp `--max-filesize`). A new job first copies another user's places for the same post (one source user, `on conflict do nothing`); if that fails the job runs the normal pipeline |
| Place catalog | `server/src/trips/placeCatalog.ts` | `GET /api/trips/places-catalog` |
| Router | `server/src/routes/trips.ts` | `createTripsRouter(deps)` — Clerk required. CRUD, `/generate`, `/enhance`, `/enhancements/:runId/apply`, `/chat`, `/days/:dayId/places`, plus sharing (below). Summaries from `GET /api/trips` carry `center`, `points` (≤48 `[lng,lat]`) and `placeCount`; trips carry `center`. A trip the caller cannot see answers 404, the same as a missing one. Slugs `new`, `join`, `places-catalog` are reserved. A slow `/generate` trickles whitespace; a client hanging up cancels only the body (the draft still saves) |
| Enhancement runs | `server/src/trips/types.ts` (`EnhancementRun`, `finishRun`), `routes/trips.ts` | `running` → `complete { outcome, outcomeReason }` or `error { error, outcomeReason }`, always through `finishRun`; every variant keeps `suggestions` and `appliedSuggestionIds`. The work runs in memory, so a run still `running` after 10 min (`STALE_RUN_MS`) reads as `error`. One live run per trip: a second `/enhance` gets `409 { error: "enhancement_running", run }` with the run in flight (the client then polls it). `/apply` needs a `complete` run and runs under a per-run lock (one process), so a suggestion lands once |
| Sharing | `server/src/routes/trips.ts`, `components/ShareDialog.tsx`, `TripJoin.tsx` | Link-first. `POST /:id/invites` (owner; role viewer/editor), `POST /join/:token` (any signed-in user joins with that role), `DELETE /:id/invites/:token` (turn a link off), `POST /:id/leave` (collaborator). `invites` are stripped from trip payloads for non-owners. Collaborators carry an optional display `name` |
| Frontend geocoding | `frontend/src/pages/Trips/geocode.ts` | Keyless, via `fetchExternal` (Effect): Open-Meteo geocoding for cities (`searchCities`; supplies the IANA time zone for new trips) and Photon/OpenStreetMap for places (`searchPlaces`, biased to the day) |
| Frontend | `frontend/src/pages/Trips/` | `TripsLayout`, `TripsIndex`, `TripCreate`, **`TripWorkspace`** (`/:tripId` overview and `/:tripId/day/:dayId`; itinerary pane + sticky map), `TripJoin`, `TripChat` FAB, `workspace/*` (panels, item editor, AI sheets, details dialog + `resizeDays`), `components/*` (`kit`, `ShareDialog`, `CityField`, `DateRange`, `TripCover`), `map/*` (`AtlasMap`, lazy MapLibre `engine` incl. `renderStills` for card covers, `mapStyle`, `geo`), `editorMachine.ts` (the editor as a pure reducer: sync, AI run, undo history) + `useTripEditor.ts` (its I/O shell), `tripMerge.ts` (three-way rebase), `tripEdits.ts`, `meta.ts`, `geocode.ts`, `forecast.ts` (live weather), `stopPhoto.ts` (place-card and 3D-view photos), `live/` (now card, now line, countdowns; all clock maths in the trip's zone), `timeline/` (day timeline layout, `travelEstimate` / `legEstimate`), `budget/` (BudgetPanel, CostField, `budget.ts` totals and settle-up, `rates.ts` Frankfurter rates via Effect), `prep/` (ChecklistPanel, EssentialsPanel, `countries.ts` facts table for ~70 countries) |

**Maps:** every Trips map is MapLibre GL JS v6 over OpenFreeMap vector tiles
(no API key; `map/mapStyle.ts`). The photoreal 3D view ("Fly the day",
`photoreal/`) is optional: a day's "…" menu shows "Fly the day in 3D" when
`photorealAvailable()` is true (a Google tiles / Places key plus WebGL2 in
production; always in a dev build, which falls back to a procedural ground).

**Concierge panel:** `TripChatLauncher` (in the layout chunk) draws the FAB;
the panel (`TripChat.tsx`, `TripChatPanel`) is a lazy chunk fetched on the
FAB's first hover, focus or press, and reads the trip on first open (merged
with any newer `trip-changed` doc via `mergeFetchedTrip`). Docked on desktop
it is a non-modal `complementary` region; expanded or on a phone it is a
modal dialog. A place card that names a stop already on the day records it
as `preexisting` and never offers Undo; proposal Undo is offered only while
the touched days still match what Apply saved (`daysFingerprint`). "Show"
opens `/day/:dayId#item-<id>`.

**Live forecast:** `forecast.ts` reads Open-Meteo (keyless, through
`fetchExternal`) for the days inside its 16-day window, each day at its first
pinned stop (else the day before's place, else `trip.center`); days that
round to the same point (~11 km) share one request, at most six per trip,
cached for 30 minutes. `useForecast(trip)` refetches only when a place or
date changes. The day header and the overview's day rows show it; the AI's
`day.weather` stays the fallback. Fahrenheit for US locales.

**Calendar export:** "Export to calendar" in the trip menu and each day's
"…" menu downloads an RFC 5545 `.ics` built client-side by
`calendar/ics.ts` (no dependency): timed stops in the trip's time zone with
a generated `VTIMEZONE`, untimed stops as all-day events, `UID` =
item id + trip id so a re-import updates rather than duplicates.

**Photoreal 3D view:** `photoreal/PhotorealOverlay` (lazy, default export)
takes `trip`, `day`, `dayNumber`, `initialStopId?`, `onClose`, `onEditStop?`
and reads the day document directly — no fetch. `photoreal/scene.ts` is the
engine: created once per open, driven by methods (`select`, `fitAll`,
`setStops`, `setTheme`, `orientNorth`, `toggleTilt`, `setUser`, `dispose`),
renders on demand. `GET /api/trips/:id/days/:dayId/places` stays for
compatibility but the client no longer calls it. AI-added places must always
carry structured locations — never prose only.

**Saving and other writers:** the workspace autosaves 900 ms after the last
edit. Saves are serialised and never aborted; each PATCH carries
`baseUpdatedAt`, and a server with a newer copy answers `409 { error:
"conflict", trip }` and writes nothing (older servers ignore the field). On a
409, on the concierge's `trip-changed` event, or on a refetch when the tab
comes back into view, the editor replays the traveller's unsaved changes onto
the newer copy (`rebaseTrip`: per day, items merged by id, the traveller's
edit to an item wins; `party`, `expenses` and `checklist` merge by id the same way, and a budget both sides changed is a conflict) and asks "Keep mine / Use theirs" only when two sides
changed the same field. The concierge's `saveDays` sends `baseUpdatedAt` too
and, on 409, re-reads and re-applies its change once. Undo keeps the last 30
plan snapshots (`days` + dates; Cmd/Ctrl+Z, Shift for Redo, outside text
fields) and replays them the same way, so Undo never erases a newer change
on another day. AI runs take an `AbortSignal`: Stop (or leaving) drops the
answer; the server may still finish, and its change arrives like any other.

**Permissions:** owner > editor/viewer collaborators > `sharedWithAllUsers`
(legacy Korea behavior: all signed-in users can view/edit). Only owners delete,
create or revoke invite links, and change collaborators; collaborators can leave. The legacy `/api/korea/*` API is gone:
the snapshot, day, reservation, dong and entity endpoints and `/api/entity/about` served reservation
details to anyone, and `POST /api/korea/chat` (an unauthenticated concierge whose prompt held the
itinerary) was only a client fallback for servers without `/api/trips/:id/chat`, which every server now has. Frontend `/korea*` redirects to `/trips/korea-2026`.
The snapshot is data, and the trips system is the path for all new
destination work. Do not add new destination-specific routes or logic.

## Korea helpers (`frontend/src/pages/Korea/`)

The legacy Korea pages are gone; frontend `/korea*` redirects to
`/trips/korea-2026` (`pages/Trips/KoreaRedirects.tsx`). What remains are the
helpers Trips imports. Do not add `/japan`-style routes.

| File | Purpose |
|------|---------|
| `ConciergeText.tsx` | Concierge markdown renderer (with `conciergeMarkdown.ts`) |
| `ThemeToggle.tsx`, `koreaUtils.ts` | Light / dark / system theme toggle and persistence for the Trips layout |
| `types.ts` | `Reservation` shape used by `pages/Trips/reservationView.ts` |
| `korea.stylex.ts` | Palette constants for the theme toggle |
