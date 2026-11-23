# Trips workflow audit, 2026-11-22

The goal: proof that every non-AI workflow in Trips (`/trips`) works as intended, with checks anyone can rerun, and any defect found fixed. AI workflows (AI draft, AI review, the concierge, Instagram import, booking parse with a key) are out of scope because they spend model quota; they get their own audit.

Three kinds of check, each rerunnable:

1. **The gate.** The same steps as `pr-gate`: server typecheck and tests, frontend typecheck, lint, build and unit tests. Run before any change and again at the end.
2. **A property check of the save path.** `frontend/src/pages/Trips/__tests__/saveProtocol.property.test.ts` drives the real editor reducer through generated interleavings of the traveller's edits, another writer, and a network that loses or reorders requests. How to run and read it: the [`verify-trip-save`](../../../.agents/skills/verify-trip-save/SKILL.md) skill.
3. **Browser specs.** `frontend/e2e/trips/*.spec.ts`, one file per area, on a hermetic stack (`frontend/playwright.config.ts`): an in-memory trip store, every AI, Google and Supabase key blank, rate limits off, and the browser's own Google, Supabase and PostHog keys blank too (Vite lets `process.env` win over `frontend/.env*`). The shared fixture (`e2e/trips/fixtures.ts`) refuses to run on a stack with AI configured, fails any test whose page calls an AI endpoint, and fails any test with an uncaught page error. Each test seeds its own trip, checks the server copy after every edit, and reloads where it matters.

`decisions.tsv` beside this file is the decision trail.

## Defects found

| # | What a traveller saw | Found by | Status |
|---|---|---|---|
| 1 | Typing while a save was on its way sent the same save twice; the second came back as a conflict. | Property check, reproduced in the browser | Fixed. `save.spec.ts` "typing while a save is on its way sends each save once" fails on the old code. |
| 2 | Undo after another device's change took that change back too. An undo that clashed with a newer change restored the whole remembered plan, wiping other writers' changes on every day. | Property check | Fixed. `save.spec.ts` "undo after another device's change…" fails with the `merged()` seal removed (the other device's rename reverts to "Tea house"); the property check fails on its pinned `redoOverTheirRename` with the old `replayPlan` (whole remembered plan on a clash). |
| 3 | An old `/korea/ingest` bookmark opened the Korea trip without the Instagram import: the server's 301 dropped `?ingest=1`. | `index-create.spec.ts` | Fixed, with `server/src/app.legacyRedirects.test.ts` over every legacy redirect. |
| 4 | On a window shorter than the card (1280×720 is enough), the wishlist details card grew and shrank every frame, so "Add to day" jumped 55 px a frame and could not be pressed. `place()` measured the card with its own max height still set. | The final browser run on a quiet machine (3 of 6 runs hung) | Fixed, with a unit test that fails on the old code. |
| 5 | A save that landed but whose answer was lost, followed by more typing, asks a traveller who is alone "Keep mine / Use theirs". Nothing is lost: Keep mine keeps the newest. | Property check | **Open.** Kept as an expected failure (`it.fails`) with its shrunk counterexample. The fix changes the editor's sync state, so it is a follow-up. |

Two doc lines promised more than the code means to do, and the code comments say the code is right. Both docs now match: a `#stop-` link selects the stop on a wide screen's map too, and Done / Skip / Loved it and the journal appear once a day has come.

## Results by workflow

Verdicts: **VERIFIED** (a check drives it and passes), **FIXED** (a defect above, now verified), **OPEN** (defect above), **INCONCLUSIVE** (could not tell intended from broken, or a pass we do not trust), **NOT COVERED** (no check, and why).

### Index and create (`index-create.spec.ts`)

| Workflow | Verdict |
|---|---|
| A trip card opens its workspace; a trip opens by slug and by id | VERIFIED |
| Happening now / Upcoming / Past buckets from today's date | VERIFIED |
| `/` focuses search, search filters, no-match copy, clear | VERIFIED |
| `n` opens a new trip | VERIFIED |
| Create without AI from an Open-Meteo city search and picked dates (days, zone, centre stored) | VERIFIED |
| An unnamed trip is named after its destination; the Weekend preset makes 3 days | VERIFIED |
| An end date before the start cannot be created (calendar orders the range; server answers 400) | VERIFIED |
| Duplicate and Delete from the trip menu and from a card's menu (Keep trip cancels; 404 after) | VERIFIED |
| `korea-2026` offers Duplicate, never Delete | VERIFIED |
| Not-found page for unknown trips and extra segments | VERIFIED |
| `/edit` and `/places` land on the trip, keeping query and hash | VERIFIED |
| Legacy `/korea`, `/korea/places`, `/korea/day/:slug` (app and server) | VERIFIED |
| Legacy `/korea/ingest` on the server | FIXED (#3) |
| Leaving the index for a trip | INCONCLUSIVE: about 16 s of blocked main thread in headless Chromium (software WebGL) with 62 trips on the globe; 51 ms in a desktop browser. Not seen on real hardware. |
| Opening a trip from a globe pin; the hero's Now / Next link; the over-long trip and unknown-zone errors | NOT COVERED: pins have no accessible names; the hero depends on every trip of the shared test user; out of time |

### Day plan (`itinerary.spec.ts`)

| Workflow | Verdict |
|---|---|
| Composer: a searched place (pinned, saved with coordinates), text without a pin, a heading | VERIFIED |
| Edit a stop's name, start and end time ("8:30a"), notes and cost | VERIFIED |
| Status Skipped leaves the route numbering; Skip and Loved it on a lived day reach the journal | VERIFIED |
| Alt+↑/↓ reorder (announced, focus kept, saved) | VERIFIED |
| Move a stop to another day; delete with toast Undo; sort by time (1 AM after an 8 PM dinner) | VERIFIED |
| Ctrl+Z / Shift+Ctrl+Z undo and redo on the server; a text field keeps the keys | VERIFIED |
| Day title, city and journal | VERIFIED |
| Arrow keys, rail, pager and trip name move between days and the overview | VERIFIED |
| Deep links `#item-` and `#stop-` on desktop and phone; a booking in the overview opens its day | VERIFIED |
| Trip details: rename and description; later end date; earlier end date to the wishlist or removed (with Undo); new start date moving or keeping plans | VERIFIED |
| The day's weather band | INCONCLUSIVE: its place is held while the forecast loads, then collapses if the lookup fails, and the stop list jumps up. Twice in 14 full runs a click already on its way landed on the stop below. Seen when Open-Meteo rate-limited the shared test machine. A follow-up: hold the space or fold it before the list is usable. |
| Pointer drag reorder; a hash change on a day already open | NOT COVERED: out of time |

### Wishlist and bookings (`wishlist-bookings.spec.ts`)

| Workflow | Verdict |
|---|---|
| Save a place from search (pin, map label) or as plain text (no pin) | VERIFIED |
| Category from the row menu and the details card; Automatic clears it | VERIFIED |
| Category filter chips, empty state, Show all | VERIFIED |
| Remove an idea | VERIFIED |
| Details: popover from a row on a wide screen, sheet on a phone, from a map pin, from a pasted `?idea=` link; Back and Close history | VERIFIED |
| The details popover holds still on a short window | FIXED (#4) |
| Schedule an idea through the day picker with recommended days from distance (no AI key) | VERIFIED |
| Cancel in the day picker returns to the details | VERIFIED |
| A flight and a hotel added by hand from the composer; the Tonight line and check-out | VERIFIED |
| Paste bookings without an AI key says it is not set up and writes nothing | VERIFIED |
| Group by None / Type / Area; undo of wishlist edits; the 200-idea cap; details content (photos, Wikipedia); other booking types; the overview's Add booking form | NOT COVERED: out of time |

### Budget, checklist, essentials, recap (`planning.spec.ts`)

| Workflow | Verdict |
|---|---|
| Set a budget in another currency, then remove it | VERIFIED |
| Stop costs count as planned; marking one paid logs it as spent | VERIFIED |
| Add and remove travellers | VERIFIED |
| Log, edit and delete an expense with payer, split and currency | VERIFIED |
| Settle up in the fewest transfers (3, where settling the largest debt first takes 4) | VERIFIED |
| Another currency converts at the live Frankfurter rate | VERIFIED |
| Checklist: add to each group, tick, assign, delete | VERIFIED |
| Essentials: emergency numbers, driving side, the converter, public holidays from Nager.Date | VERIFIED |
| Show to a driver: tonight's hotel | VERIFIED |
| Recap of a finished trip: loved stops and the 1200×630 share picture | VERIFIED |
| "You" labels and the default payer; Undo after removals; Suggest from your plan; Clear checked; the phone share sheet | NOT COVERED: the test user has no viewer identity; out of time; headless Chromium has no share sheet |

### Sharing and export (`share-export.spec.ts`)

| Workflow | Verdict |
|---|---|
| Make view and edit links, copy them, turn one off | VERIFIED |
| The owner opening their own link lands on the trip without joining | VERIFIED |
| A turned-off or unknown link says it has expired | VERIFIED |
| Calendar export of the trip and of one day (zones, all-day stops, reminders on bookings, stable UIDs) | VERIFIED |
| Copy itinerary as plain text | VERIFIED |
| Print, with the chart fallback when WebGL2 is missing | VERIFIED |
| Print with map pictures | INCONCLUSIVE: one run on the loaded machine stayed on "Maps 0 of 3" for 45 s; another passed in 41 s |
| Command palette (find a day, theme); the `?` shortcuts sheet; the theme and Liquid Glass toggles | VERIFIED |
| Fly the day in 3D: opens with its stops; closing unmounts the 3D canvas | VERIFIED |
| A second person joining by link, changing their role, removing them, leaving a trip | NOT COVERED: the hermetic stack has one identity |

### Saving, offline, other writers, the live day (`sync-offline.spec.ts`, `save.spec.ts`, property check)

| Workflow | Verdict |
|---|---|
| An edit saves and survives a reload | VERIFIED |
| Typing while a save is on its way | FIXED (#1) |
| Undo and redo with another writer's change in between | FIXED (#2) |
| An edit made offline saves by itself once back online | VERIFIED |
| An edit the server never got survives a reload and saves later | VERIFIED |
| Another writer on a different day: both changes kept, no prompt | VERIFIED |
| Both sides rename the same stop: the traveller's version wins, no prompt (`docs/trips.md`) | VERIFIED |
| A real clash (a day title): Keep mine and Use theirs each keep every change that does not clash | VERIFIED |
| A refused save says why, offers no Retry, and the next change saves | VERIFIED |
| A server error offers Retry and saves once the server is back | VERIFIED |
| View-only access shows no edit controls | VERIFIED (access faked in the response) |
| Now card: Done, Skip, Running late (bookings keep their time) | VERIFIED |
| A save whose answer was lost, then more typing | OPEN (#5) |
| Server enforcement of view-only access; the save sent while a page unloads | NOT COVERED: one identity; the reload test proves the edit is kept, not the unload request |

### Out of scope

AI draft and redraft, the AI review and Apply, the concierge, Instagram import, booking parse with a key, AI-recommended days. No test calls them: the fixture's tripwire fails a test that does, and the stack has no keys.

Not covered by any check, and not listed above: the signed-out gate on `/trips` (the stack signs in with a dev bearer, so Clerk never runs); the PWA share target (`/trips?url=`); the Trips / Korea manifest swap; a cold offline load through the service worker (offline edits are covered, an offline first paint is not); editing or deleting a booking once added; map layers and controls beyond the pins and zoom; the trip cover.

## A product question, not a defect

When another writer edits a stop (say, adds a note) while the traveller edits the same stop, the traveller's whole version of the stop wins and the note is dropped without a prompt. That is the documented rule (`docs/trips.md`, `mergeItems`), and both the browser and the property check confirm it. It sits uneasily with the `tripMerge.ts` header, which prefers giving up over silently dropping someone's work. A field-level merge for stops would keep both.

## Gate

| Step | Before (main 284b3421) | After (this branch, rebased on main 8dd9c1c9) |
|---|---|---|
| Server typecheck | pass | pass |
| Server tests | 971 pass, 8 skip | 1023 pass, 4 skip (main added tests; the shell tests that need `frontend/dist` ran) |
| Frontend typecheck (now includes `e2e/`) | pass | pass |
| Lint | 0 errors, 29 warnings | 0 errors, 29 warnings |
| Build | pass | pass |
| Unit tests (vitest) | 2866 pass in 223 files | 2907 pass and 1 expected failure (defect 5) in 226 files (main's #629 and #631 added 37) |

## Browser suite

Final run on this branch rebased onto main 8dd9c1c9, on a fresh hermetic stack with 4 workers at a load average of 8 to 23: **103 passed in 4.6 min, none retried, none skipped.** The same 103 passed on each earlier base (284b3421, 0f1ac99e). An independent verifier's run went 102 of 103; the one failure was a connection reset during cleanup and passed alone. The save-path property check holds at 20,000 runs on the same head.

| Spec | Tests |
|---|---|
| `index-create.spec.ts` | 19 |
| `itinerary.spec.ts` | 24 |
| `wishlist-bookings.spec.ts` | 16 |
| `planning.spec.ts` | 11 |
| `share-export.spec.ts` | 13 |
| `sync-offline.spec.ts` | 12 |
| `save.spec.ts` | 3 |
| `smoke.spec.ts` (existing) | 5 |

The specs raise Playwright's timeouts (up to 120 s a test, 30 s an expectation). Six specs were written and run at once against one dev server at load averages of 60 to 100, where a fill took 61 s and a 100 ms timer fired 32 s late. The assertions are unchanged; only the waiting is longer.

## Rerun

```bash
# Gate
bun run typecheck:server && IG_WORKER_ENABLED=false bun test --parallel server/src
cd frontend && bun run typecheck && bun run lint && bun run build && bun run test:run

# Save-path property check (deeper pass: SAVE_PROTOCOL_RUNS=20000)
cd frontend && bunx vitest run src/pages/Trips/__tests__/saveProtocol.property.test.ts

# Browser suite: starts its own hermetic stack on :3210 / :5210
cd frontend && bunx playwright test e2e
```
