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
| Domain model + Zod schemas | `server/src/trips/types.ts` | Shared shape mirrored in `frontend/src/pages/Trips/types.ts`. Planning fields on the trip document: `budget { currency, total? }` (`PATCH` with `null` clears it), `party[]` (people for splits, optional `userId`), `expenses[]` (amount, ISO currency, category, paid by, split with, optional `itemId`), `checklist[]` (text, done, group packing / todo / documents, assignee), `ideas[]` (the wishlist: items not yet on a day, at most 200), and `cost` on an item. Amounts are finite, 0 to 1e9; currencies are three capital letters. An item may be `highlight` (loved) and have status `skipped`; a reservation carries `provider`, `number`, `from`, `to`, `endDate` / `endTimezone` (check-out, arrival), `seat` and `terminal`. A day may carry its own `timezone` (multi-country trips) and a `journal` (8000 chars). Client-side caps mirror the schema in `frontend/src/pages/Trips/limits.ts`; zod strips unknown keys, so every new document field must be in `updateTripSchema` |
| Store | `server/src/trips/store.ts` | `getTripStore()`: Supabase or memory. `getBySlug` and `findByInviteToken` filter on the jsonb doc (`doc->>slug`, `doc->invites @>`), so a request never lists every trip except `GET /` and the places catalog |
| Writes | `server/src/trips/tripWrites.ts`, `routes/trips.ts` | The server never writes a whole trip from a snapshot it read earlier. `mutateTrip` re-reads, applies a change to the fresh copy and compare-and-sets on `updatedAt` (`updateIfUnchanged`, 3 tries); generate, apply, sharing and the Korea seed upgrade all go through it, and only touch their own fields. A finished AI review does the same through the store's `completeReview`, which saves the trip and the run together (below). `PATCH /:id` merges the body's fields onto the fresh trip; with `baseUpdatedAt` in the body it refuses a save based on an older version with `409 { error: "conflict", trip }` (the trip as `GET` would return it for that user) and writes nothing. Without `baseUpdatedAt` (older clients) it merges as before. Every request body on the router is capped at 2 MB (`413 { error: "too_large" }`); a whole trip with 200 ideas and 1000 expenses is about 1 MB. Item `links` and `reservation.url` with any scheme but `http:` or `https:` (`javascript:`, `data:`, `file:`, an app's own) are dropped on save, not refused; a link with no scheme is kept |
| Korea migration | `server/src/trips/koreaTrip.ts` | Pure `buildKoreaTrip()` from `koreaSnapshot`/`koreaPlaces`; seeded on first `/api/trips` request as trip `korea-2026` (shared with all signed-in users, not deletable) |
| AI generation/enhancement | `server/src/trips/ai.ts`, `prompts.ts`, `signals.ts`, `dayClock.ts`, `lodging.ts`, `jsonRepair.ts` | Drafts are built to finish: trips up to 4 days are one call; longer trips get a short outline (`OUTLINE_SYSTEM`) and are then drafted 3 days at a time, 4 parts at once (a 12-day trip in one round), each chunk retried once, with repeat venues dropped across days and any day still thin reported as `incompleteDays` (never a failed request). A day counts as drafted with two stops; once the model planned at least one, the traveller's bookings on it count too (a wedding, the flight home), but never where they sleep, and a day the model planned nothing for is always reported. Every step has a time budget (`DRAFT_BUDGETS`): the outline 2 min, each part (or a short trip's single call) 4 min across both attempts, the whole draft 10 min. Each call gets the budget's `signal` and `deadlineAt`, so the Maps try is sized from it like a review's; a retry needs a third of the budget left, and a part that cannot get that before the draft's end is not started and its days are reported. Before budgets nothing bounded a draft as a whole: a 12-day redraft of the Korea copy on production ran 12 min 44 s and still left five days thin (which calls were slow was not confirmed from logs). Model output cut off mid-JSON is recovered by `repairTruncatedJson`. A redraft keeps what the traveller fixed (bookings, booked / completed stops, lodging; `isFixed`) and plans around it. `lodging.ts` works out the base for each day (`baseByDay`) and tells the planner and reviewer how far each day starts and ends from it; the review can also `move` a stop to another day or `swap_days`. Gemini 4 Neon primary (`GEMINI_MODEL`; steps down to 3.8 Flash once if the key cannot use it), Groq as the backup on failure or when Gemini is missing; Maps grounding first, then Search (never both in one request); system prompts live in `prompts.ts`; `signals.ts` computes per-day facts (missing meals, gaps ≥ 2.5 h, hops ≥ 4 km, overlapping times, clock order) that the review and the concierge are given; the review offers two orders without a model, "Put Day N back in time order" for a day listed out of clock order (not for a day getting an added stop, which the add sorts) and a shorter walking order for an untimed day; every reorder, the model's or these, is offered only when its order agrees with its times (a timed reorder carries `proposedTimes`); drafts come back sorted by time, and timed adds land in clock order; AI places missing coords are geocoded with Google, or keyless Photon (`createPhotonGeocoder`) when there is no Google Maps key; Open-Meteo weather + travel-leg pre-pass; suggestions reviewable before apply (enhance auto-applies added places); single-day reviews keep suggestions that omit or invent a day id; the dropped-suggestion log line includes the zod field path |
| Concierge | `server/src/trips/chat.ts`, `conciergeTools.ts` | `POST /api/trips/:id/chat` SSE. A tool loop (up to 5 rounds, at most 4 paid lookups per round; extra calls are answered as skipped) on Gemini 4 Neon: Google Search grounding plus function calls `find_places` (Places API: hours for that weekday, rating, price, walk from the plan), `get_directions` (Routes API: transit lines and times) and `propose_changes` (add / set_time / move / remove / reorder as one validated batch). Nothing edits the trip server-side: the client applies a proposal on confirmation, with Undo. Events: text deltas, `{status}` (real tool activity), `{places}`, `{proposal}`, `{sources}`, `{followups}`, `{meta:{model}}`. Context carries the local clock and trip phase, item ids, computed legs and day facts, the live forecast, an opt-in one-message location, earlier cards so "the second one" resolves, stop costs, and a `PLANNING` block (budget, planned and spent totals by currency, travellers, open checklist items) when the trip has any. |
| Instagram import | `server/src/routes/instagramPlaces.ts`, `server/src/igPlaces/*`, `frontend/src/pages/Trips/instagram/*` | `/api/instagram/*` (same router as the legacy `/api/korea/places/from-instagram/*`): `POST /` queues posts (`skipVideo` = quick caption read), `GET /jobs?logs=0`, `POST /jobs/:id/retry|reextract`, `GET /extracted` (the user's saved places, searchable), `DELETE /extracted/:id`. Posts are fetched through Apify's Instagram scraper (`APIFY_TOKEN`; the free plan covers personal use, comments come with the post), then Bright Data if a key is set, then yt-dlp (works from a home IP, not from the droplet). Gemini with Maps grounding extracts the places; geocoding is worldwide (the Korea box and region bias apply only when the post points to Korea). Places belong to the user, not a trip; adding one copies it into the trip document with the post link in `links[]`. A job's dedupe key is the canonical post URL `https://www.instagram.com/{p,reel,reels,tv}/{shortcode}` (https only, every query and hash dropped; profiles, stories and other paths are refused). Job states are `pending → running → done | dead` (`transition()` in `igPlaces/types.ts`; the `ig_*` SQL functions follow the same table, a legacy `failed` reads as `dead`): claim needs attempts left, every step bumps the lock, the reaper buries a job out of attempts, complete / fail touch only a running row. A job has a hard deadline a minute under the stale-reap threshold. Media is streamed to disk under an 80 MB cap (`igPlaces/download.ts`, yt-dlp `--max-filesize`). A new job first copies another user's places for the same post (one source user, `on conflict do nothing`); if that fails the job runs the normal pipeline |
| Booking parse | `server/src/trips/bookingParse.ts`, `server/src/routes/tripBookings.ts`, `frontend/src/pages/Trips/bookings/*` | `POST /api/trips/:id/bookings/parse` (editors; body ≤ 20k chars; 10 per 10 min per user). Gemini, then Groq, reads a pasted confirmation into zod-checked reservation items; nothing is written server-side. The client (`PasteBookingsSheet`) lets the traveller pick which to add, each placed on its day in clock order (`addBookings`). Without an AI key it answers a clear "not set up" and the sheet says to add the booking by hand |
| Place catalog | `server/src/trips/placeCatalog.ts` | `GET /api/trips/places-catalog` |
| Router | `server/src/routes/trips.ts` | `createTripsRouter(deps)` — Clerk required. CRUD, `/generate`, `/enhance`, `/enhancements/:runId/apply`, `/chat`, `/days/:dayId/places`, plus sharing (below). Summaries from `GET /api/trips` carry `center`, `points` (≤48 `[lng,lat]`) and `placeCount`; trips carry `center`. A trip the caller cannot see answers 404, the same as a missing one. Slugs `new`, `join`, `places-catalog` are reserved. A slow `/generate` trickles whitespace; a client hanging up cancels only the body (the draft still saves) |
| Enhancement runs | `server/src/trips/types.ts` (`EnhancementRun`, `finishRun`), `routes/trips.ts`, `trips/reviewWorker.ts` | `running` → `complete { outcome, outcomeReason }` or `error { error, outcomeReason }`, always through `finishRun`; every variant keeps `suggestions` and `appliedSuggestionIds`. A run is a job in the durable review queue (below) and carries `queue { state, attempt, maxAttempts, nextAttemptAt?, lastError? }`. A queued run no worker took within 30 min (`QUEUED_RUN_MAX_MS`), or a run from before the queue still `running` after 10 min (`STALE_RUN_MS`), reads as `error`. One live run per trip, enforced by the store: a second `/enhance` gets `409 { error: "enhancement_running", run }` with the run in flight (the client then polls it). `/apply` needs a `complete` run and runs under a per-run lock (one process), so a suggestion lands once. It answers `{ trip, applied, skipped, skipReasons }`: what already holds counts as applied (a stop already on that day, a removed stop already gone), an id already on the run is in neither list, and each skipped id gets one sentence for the traveller ("Ala Moana Center is already on Day 3."). Reorders land first, since the review checked each against its day before the run's other changes: the stops it names take their order, headings and untimed items keep their places, and a stop added since is slotted by time. A new time moves its stop to where that time falls (`moveToTime`: a small-hours time is the same night only when nearer the stop's old clock), and a stay's check-out never moves with its check-in. Every day a suggestion changed is then sorted by time (`server/src/trips/dayClock.ts`) |
| Sharing | `server/src/routes/trips.ts`, `components/ShareDialog.tsx`, `TripJoin.tsx` | Link-first. `POST /:id/invites` (owner; role viewer/editor), `POST /join/:token` (a signed-in user new to the trip joins with that role; someone already on it keeps the role the owner gave them), `DELETE /:id/invites/:token` (turn a link off), `POST /:id/leave` (collaborator). `invites` are stripped from trip payloads for non-owners. Collaborators carry an optional display `name` |
| Frontend geocoding | `frontend/src/pages/Trips/geocode.ts`, `server/src/routes/placeSearch.ts`, `server/src/trips/placeSearch.ts` | Cities: Open-Meteo (`searchCities`, keyless; supplies the IANA time zone for new trips). Places (`searchPlaces`, every place field: a day's composer, the wishlist, a stop's location): three searches at once, merged by `rankPlaces` (one copy per place, results within 80 km of the bias point first; the bias is `searchCenter`, the middle of the day's or trip's biggest group of stops, so an airport or second city cannot pull it away): `GET /api/places/search` (Google Places Text Search through the server's `GOOGLE_MAPS_API_KEY`, signed in, queries of 3+ characters or 2 of Chinese / Japanese / Korean, its own 120/min limit so typing never starves saves, cached 10 min), Photon inside a box around the trip, and Photon worldwide. A Google pick keeps its `placeId`. Without the key (503) or on any server refusal the OpenStreetMap results stand alone; the search fails only when every source does |
| Wishlist | `frontend/src/pages/Trips/workspace/IdeasPanel.tsx`, `frontend/src/pages/Trips/ideas/`, `server/src/trips/placeDetails.ts`, `server/src/trips/suggestDays.ts`, `server/src/routes/placeSearch.ts`, `server/src/routes/tripIdeas.ts` | `trip.ideas` items may carry `theme` (`ITEM_THEMES`: food, nature, sights, neighborhood, shopping, nightlife, activity, other); absent means inferred by `themeOf` (`ideas/themes.ts`: stored theme, then the place category, booking type, whole words of the title, vague categories). `ideaAreas` (`ideas/areas.ts`, no network) groups by the city of the day with the nearest stop within 30 km, then a trip city or the town in the address. `ideas/contract.ts` is the seam: `?idea=<id>` opens `IdeaOverlay` (mounted once by `TripWorkspace`, so a map pin opens the same thing as a list row), `&add=1` its day picker (`add` is the picker's only beside `?idea`; closing leaves another panel's `add`, such as Budget's `?tab=budget&add=expense`, alone). `ideas/ideaNav.ts` (`useIdeaNav`) owns the history: opening pushes one marked entry (none if that place is already open), switching place or into the picker replaces it, closing goes Back when this page pushed it and replaces otherwise (a pasted link). An overview tab change (the tab bar, or a tab from the command palette on the overview) closes an open place on the entry before it, so Back still leaves the trip; from a day, the palette's tab is a new entry like any link off the day. Calls made while a navigation is on its way are held in order and made once it shows, one navigation per entry: a double press opens once, and a tab and a pin pressed together both apply. A Back on its way has no deadline, so a slow one is never sent twice. The overlay's closes name their place (`close(ideaId)`), so a popover whose close lands after another place opened (a fast press on another row reads to it as a press outside) leaves the new one open. The opener rides in history state: only a visible row on a wide screen anchors the popover (decided once, as it opens); a map pin, a pasted link or a scrolled-away row opens a sheet. The popover is non-modal: Tab past either end or focus elsewhere closes it. **Details:** `GET /api/places/details?placeId=…` and / or `name`+`lat`+`lng` (signed in; 60 per 10 min per user, `place-details`; the search limiter covers `/search` only): Place Details (New) with an explicit field mask; a permanently closed place answers null, a moved one is followed once through `movedPlaceId` (a new home Google cannot show, or one that moved again, also answers null, never a search by name). With no usable id (or an unknown one: 404, `NOT_FOUND`, or Google's "place id is not valid" wordings), Text Search biased 1 km around the point: within 300 m the idea's head word and 60% of its distinctive words must be shared and kind words (sushi, ramen, market, palace…) must agree; up to 10 km only an exact folded name of a park, nature or neighbourhood type (never a city); else `{ place: null }`. A Han-only name searches in `ja`, `zh-TW` or `zh` by the point. One 11 s deadline for the whole lookup (4 s per call, photos within what is left); every keyed call refuses redirects; a client that hangs up gets 499, unlogged. Up to 6 photos resolved server-side with `skipHttpRedirect=true`, so only keyless `photoUri`s and author credits reach the browser (a test asserts the key never appears). Cached 30 min, 300 entries (a partial answer 2 min); 503 without `GOOGLE_MAPS_API_KEY`, 502 on upstream failure. The client (`ideas/placeDetailsApi.ts`) caches Google answers per place for 25 min (2 min when fewer than 6 photos came back; at most 200 places per cache), never caches a Wikipedia failure, and keeps showing a lapsed answer while it refetches, and when that refetch fails; it falls back to English Wikipedia geosearch within 1.5 km for non-businesses (re-filing a place to a non-business category brings that in); an idea with no point and no id shows only its own notes. **Recommended days:** `POST /api/trips/:id/ideas/suggest-days` (editors; 30 per 10 min per user; body ≤ 32 KB; the idea rides in the body): per-day facts (nearest located stop and km, km to the day's centre on the sphere, stops, time span, stay, past in the day's zone, full) → Gemini 4 Hydrogen (pinned `SUGGEST_DAYS_MODEL`, low thinking, days sent as opaque `d<n>` keys so an editor's day id never reaches the prompt, structured output limited to eligible keys, idea notes and address and each day's theme line through `redactPrivate`, data behind a nonce, 8 s deadline) → up to 3 picks with a one-line reason. No key, a failure, the deadline or an empty answer gives the distance ranking (`source: "nearby"`); nothing is written and no user or model text is logged. **Map:** `ideaPins(trip)` on `AtlasMap.ideaPins` / `onSelectIdea` (a separate marker set, never in `pins`) |
| Frontend | `frontend/src/pages/Trips/` | `TripsLayout`, `TripsIndex`, `TripCreate`, **`TripWorkspace`** (`/:tripId` overview and `/:tripId/day/:dayId`; itinerary pane + sticky map), `TripJoin`, `TripChat` FAB, `workspace/*` (panels, item editor, AI sheets, details dialog + `resizeDays`), `components/*` (`kit`, `ShareDialog`, `CityField`, `DateRange`, `TripCover`), `map/*` (`AtlasMap`, lazy MapLibre `engine` incl. `renderStills` for card covers, `mapStyle`, `geo`), `editorMachine.ts` (the editor as a pure reducer: sync, AI run, undo history) + `useTripEditor.ts` (its I/O shell), `tripMerge.ts` (three-way rebase), `tripEdits.ts`, `meta.ts`, `geocode.ts`, `forecast.ts` (live weather), `stopPhoto.ts` (place-card and 3D-view photos), `live/` (now card with Done / Skip / Running late (`onTheGo.ts`, `shiftRemaining`), now line, countdowns), `dayClock.ts` (one clock for a day, below), `lodging.ts` (`nightsByDay`: which stay each night belongs to, honouring a booking's check-out date), `timeline/` (day timeline layout, `travelEstimate` / `legEstimate`), `bookings/` (booking fields, summaries, "Tonight" line, paste sheet), `workspace/IdeasPanel` (the Wishlist tab) + `ideas/` (categories, areas, details popover, day picker with recommended days, overlay), `budget/` (BudgetPanel, CostField, `budget.ts` totals and settle-up in the fewest transfers, `rates.ts` Frankfurter rates via Effect), `prep/` (ChecklistPanel, EssentialsPanel with tap-to-call numbers, "Show to a driver" (`tonight.ts`), a currency converter, public holidays; `countries.ts` facts table for ~70 countries), `recap/` (trip recap dialog, 1200×630 share picture), `offline/` (below), `ime.ts` (Enter that confirms a Korean / Japanese composition never submits) |

**Durable AI review queue:** a review takes minutes, so it never runs on the
request and never lives only in memory. `POST /:id/enhance` queues the run
(`TripStore.enqueueReview`: the run row in `trip_enhancement_runs` is the job,
with its request), answers `202 { run }` and kicks the review worker
(`server/src/trips/reviewWorker.ts`). The worker claims a run with a lease
(90 s), renews it every 30 s, and gives one attempt 4 min (`REVIEW_*` in
`types.ts`). It reviews the trip as it is at the start, then applies the
answer (forecast, auto-added stops) onto the trip as it is at the end and
saves trip and run in one write; if the trip changed meanwhile it re-reads and
applies again (5 tries). A returned failed run is final; a thrown error is
retried after 5 s, then 30 s (jittered), up to 3 attempts, and the last error
is the run's `error`. Every write is fenced on the claim, so a worker that
lost its lease (stalled, or its process died and another reclaimed the run)
writes nothing. The server's worker (`server/app.ts`, `TRIPS_REVIEW_WORKER`,
default on in production) sweeps every 60 s and once at boot, which picks up
retries, runs whose worker died and runs a restart left behind; on
SIGTERM / SIGINT it hands its runs back without spending the attempt
(`server/src/shutdown.ts` exits once every worker has wound down). The PR
preview API and a server with the sweep off only take the runs they queue
themselves (and their retries). Schema: `supabase/schema.sql` plus
`supabase/migrations/20261121_trip_review_queue.sql`; without them the
trips routes answer `503 trips_not_provisioned`. A live run older than
`QUEUED_RUN_MAX_MS` is failed when the next review is queued, so it never
blocks a trip. The client follows a run until the server settles it (no
client deadline short of 32 min), shows `run.queue` progress, and picks a
running run back up on open and on tab return.

**What a review sees** (`enhanceTrip` in `trips/ai.ts`): the days with every
stop's time, place, notes, cost and booking (bookings and lodging are fixed),
day themes, callouts and journal, the lodging bases, travel legs and the
forecast, plus the trip's description, tags, party, budget (planned and
spent), open checklist items and the **wishlist** (`trip.ideas`). It fills
gaps from the wishlist first: such an add carries `fromIdeaId`, and applying
it (auto-apply or `/apply`) takes the idea off the wishlist in the same write
and marks the stop `fromWishlist`.
A stop is on a day or on the wishlist, never both: the client merge
(`tripMerge.ts`, `scheduledOnce`) keeps a scheduled idea off the wishlist even
when the traveller edited it meanwhile, moving their edits onto the stop, and
`PATCH /api/trips/:id` drops any idea whose id is on a day
(`withoutScheduledIdeas`). No add lands on a venue the trip already has under
a near name (`sameVenue.ts`: same words in order, or extra words that only
say what kind of place it is, with pins within 1 km, or 400 m for a near
name); the draft, the wishlist list and `/apply` use the same rule.
Everything the traveller wrote goes through `redactPrivate`
(`privateText.ts`) before it reaches the review, the draft or the concierge:
booking codes, emails, phone, card and passport numbers become `[code]`,
`[email]` or `[number]`; flight and train numbers, dates, times and prices stay.
Model text that repeats a placeholder (`fromModel`) is never saved, so an
echoed note cannot overwrite the real code. Undo and Redo (`replayPlan`) keep
the same one-place-per-stop rule.
An attempt's `AbortSignal` bounds every model, tool mode and lookup it makes,
and its `deadlineAt` sizes the Gemini ladder: the first (Maps) try gets all
but 30 s of the attempt, up to 210 s (`modeTimeoutMs`), since a grounded
review on Gemini 4 Neon often takes 100 to 150 s;
`enhanceTrip` throws `ReviewAttemptError` for what a retry could fix and
returns a failed run only for what it cannot (day gone, prompt refused).

**What changed:** applying a review's suggestions opens `changes/ChangesSheet`
(lazy, in an `OverlayBoundary`). It diffs the trip before and after the apply
(`changes/planDiff.ts`, by stop id, never from the suggestions, since the
server also re-sorts and re-times), and draws each changed day as a ribbon on
the timeline's own layout (`ribbon.ts`) that moves from the old plan to the
new, with a row per change in words. A day that was listed out of clock order
and now reads in it says so ("Back in time order"). Suggestions `/apply`
skipped are listed with their `skipReasons` sentence, named in the dock
notice, and stay in the review unticked so they can be tried again. Under
reduced motion the sheet shows the new plan with nothing travelling. It opens
only after Apply; auto-applied adds flash in the list as before. The Wishlist
tab lists stops that came off it (`fromWishlist`) under "On your days", each
with a chip to its day and "Back to wishlist" (`ideas/onDays.ts`).

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
round to the same point (~11 km) share one request for every place,
cached for 30 minutes (a failed request is not cached; the day sky's "Try
again" refetches). `useForecast(trip)` refetches only when a place or
date changes. Days past the window get the weather typical of the date
(`climate.ts`: Open-Meteo's archive, the same dates ±3 days over the last 3
years; median high and low, rain chance, most common sky; cached 30 days in
memory and `localStorage`), always labelled "Typical … not a forecast".
Precedence: live, then typical, then the AI's `day.weather`. Fahrenheit for US
locales. `holidays.ts` reads nationwide public holidays from Nager.Date per
country and year (cached the same way); the day sky names them and Essentials
lists them.

**Day clock:** `dayClock.ts` is the one place stop times become instants. A
start before 06:00 listed after a stop at noon or later is the same night
(+1440 minutes), so a 1 AM bar after dinner sorts, counts down and exports as
after midnight everywhere (live, timeline, sort by time, `.ics`, and on the
server's drafts, reviews and `/apply` through its mirror,
`server/src/trips/dayClock.ts`). Each day is
read in `dayZone(trip, day)` (`day.timezone`, else the trip's), and
countdowns use real instants (`zonedEpoch`, DST-correct).

**Deep links:** both select the stop (a wide screen's map opens its card).
`#item-<id>` also switches a phone to the map; `#stop-<id>` keeps a phone on
the list with the stop in view (the Now card uses it).

**Print and copy:** `print/usePrintItinerary(trip)` mounts `PrintItinerary`
on demand: it renders map stills (`renderStills`, numbered pins via
`StillRequest.labels` for days, the clustered overview for the cover) with an
8 s stall cap per still and a 30 s ceiling (a missing still falls back to the
`TripCover` chart), then calls `print()`; `afterprint`, the next pointer or key
event, or 60 s unmounts it and restores the title and scroll. `itineraryText`
(plain or Markdown, escaped) backs "Copy itinerary" (`copyItinerary`: Clipboard
API, then `execCommand`).

**Command palette:** `command/CommandContext` (`CommandProvider` in
`TripsLayout`, `useRegisterCommands(source, commands)` in `TripWorkspace` and
`TripsIndex`, `useCommandPalette()`), `searchCommands` (exact > prefix > word
start > substring, then all-words / subsequence only when nothing better
matches; accent- and case-insensitive, Hangul to jamo), `tripCommands` /
`tripListCommands`. Global keys: ⌘K / Ctrl+K toggles; `?` opens the shortcuts
sheet unless typing or a dialog is open. Theme commands write through
`koreaUtils` and fire `THEME_EVENT` so the header toggle follows.

**Calendar export:** "Export to calendar" in the trip menu and each day's
"…" menu downloads an RFC 5545 `.ics` built client-side by
`calendar/ics.ts` (no dependency): timed stops in the trip's time zone with
a generated `VTIMEZONE` per zone the days use, untimed stops as all-day
events, a reminder (`VALARM`) on bookings (3 hours before a flight, 1 hour
before anything else booked), flights and stays ending at their arrival or
check-out, `UID` = item id + trip
id so a re-import updates rather than duplicates. `ics.ts` is a lazy chunk.

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
changed the same field; the chosen side wins only the parts that truly clash
(`resolveTrip`). The concierge's `saveDays` sends `baseUpdatedAt` too
and, on 409, re-reads and re-applies its change once. Undo keeps the last 30
plan snapshots (`days`, dates and the wishlist; Cmd/Ctrl+Z, Shift for Redo,
outside text fields) and replays them the same way, so Undo never erases a
newer change on another day. Before a save, `offline/sanitize.ts` cuts text to
the schema's limits (a 400 shows the server's reason, and the same document
is not sent again). One save line (`offline/SaveIndicator`: Saved / Saving /
Offline · will save when back online / Not saved · reason · Retry) sits in the
header from 1024 px and in the bottom bar below. A failed save retries on
`online` and with backoff (5 s to 60 s), and `useReloadBlock` holds an app
update while anything is unsaved or an AI run is going.

**Offline:** `offline/deviceStore.ts` is IndexedDB behind an interface (2 s
open deadline; `noStore` when there is none). `tripCopies.ts` keeps, per
account, the last 10 trips opened, the trip list and any unsaved edits
(debounced to IndexedDB; on `pagehide` also written synchronously to
`localStorage` (`keepDraftNow`), since an IndexedDB write may not finish
before the page is gone; the newer of the two is read back). Reads give up after 20 s and
fall back to the device copy. When sign-in can't load, `TripsLayout` shows the
copies read-only, but only while Clerk's cookies (`__client_uat` > 0 and a
`__session` whose `sub` matches the stored owner) still name their owner; the
banner says it is a copy and from when, and nothing that needs the server
(create, share, duplicate, chat) is offered. On the next open unsaved edits
are replayed, dropped if the server already has them, or shown as a conflict.
A sign-out forgets the copies and list but keeps unsaved edits for the same
account; another account signing in clears everything. `/api/*` is never
cached by the service worker. AI runs take an `AbortSignal`: Stop (or leaving) stops following
the run; the server may still finish, and its change arrives like any other.

**Permissions:** owner > editor/viewer collaborators > `sharedWithAllUsers`
(legacy Korea behavior: all signed-in users can view/edit). Only owners delete,
create or revoke invite links, and change collaborators; collaborators can leave. The legacy `/api/korea/*` API is gone:
the snapshot, day, reservation, dong and entity endpoints and `/api/entity/about` served reservation
details to anyone, and `POST /api/korea/chat` (an unauthenticated concierge whose prompt held the
itinerary) was only a client fallback for servers without `/api/trips/:id/chat`, which every server now has. Frontend `/korea*` redirects to `/trips/korea-2026`.
The snapshot is data, and the trips system is the path for all new
destination work. Do not add new destination-specific routes or logic.

**Jank bench:** `frontend/scripts/trips-jank.mjs` measures frame pacing, long
animation frames, layout shift and input latency for the interactions people
repeat (index and trip load, scrolling, day and tab switches, the map, typing,
dialogs, the concierge stream, the 3D view), comparing builds A / B. Each
target is a production build (`VITE_DEV_BEARER` baked in, local only) served by
its own `TRIPS_STORE=memory` API and seeded with
`bun scripts/seed-bench-trips.ts http://127.0.0.1:<port>`; the method (real
GPU, CPU 4x, alternating targets, medians) is in the script's header. `--look
glass` and `--theme dark` cover the other looks. The 3D scenarios need a dev
build (no Google key).

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
