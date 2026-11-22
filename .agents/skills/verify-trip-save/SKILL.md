---
name: verify-trip-save
description: Property check of the Trips save protocol (editor reducer, three-way merge, the hook's save effect, the server's compare-and-set). Use before and after any change to frontend/src/pages/Trips/editorMachine.ts, tripMerge.ts, useTripEditor.ts's save effect, or PATCH /api/trips/:id, and whenever a Trips bug report mentions a lost edit, a repeated save, a "Keep mine / Use theirs" prompt or undo.
---

# Verify the Trips save protocol

## What it promises

A traveller edits a trip while other writers (a second device, a shared editor, the concierge) save to the same trip, and the network may lose or reorder requests. The check holds the editor to four promises:

1. A traveller alone is never asked to choose between two copies.
2. The same, even when a save's answer is lost. **Known defect, kept failing on purpose** (see Findings).
3. Every edit ends up saved, and no one else's change is lost.
4. Undo and redo never take back someone else's change.

The harm when one breaks: a traveller's plan silently loses a stop or a rename, or they are asked "Keep mine / Use theirs" about a clash that never happened.

## How it checks

`frontend/src/pages/Trips/__tests__/saveProtocol.property.test.ts` drives the real `editorReducer` with fast-check. Each run is up to 40 random steps against a modelled server and a modelled save shell:

| Step | Real code it stands for |
|------|------------------------|
| `mineNotes`, `mineDayTitle`, `mineAdd` | the traveller's `EDIT` events (typing coalesces by key) |
| `debounce` | the editor's save timer firing (`DEBOUNCE_ELAPSED`) |
| `undo`, `redo` | `UNDO` / `REDO` |
| `theirsTitle`, `theirsDayTitle`, `theirsAdd` | another writer's PATCH landing on the server |
| `hear` | a `trip-changed` event (`EXTERNAL_CHANGE`) or a refetch (`LOADED`) |
| `network {pick, fate}` | one in-flight PATCH: `answered`, `handled` (answer arrives later, so answers overtake each other), `requestLost`, `answerLost`; answers come back as `SAVE_OK`, `SAVE_CONFLICT` or `SAVE_FAILED` |
| `retry`, `resolve` | `RETRY` after a failed save, and `RESOLVE` from the conflict sheet's Keep mine / Use theirs |

The `Server` class is `PATCH /api/trips/:id` in `server/src/routes/trips.ts` reduced to compare-and-set on `baseUpdatedAt`: 409 with its copy on a stale base, otherwise merge the defined fields and stamp `updatedAt`. The `World` shell sends a request whenever `sync.sent` is a new object, as `useTripEditor`'s save effect does. Each step is one reducer event, which is one React dispatch in the app.

After the steps, `drain()` brings the network back: it answers every request, fires the timer, retries, resolves conflicts as "mine", and refetches when the server is newer. Then the checks run: `settles` (clean, nothing in flight, page equals server), `keepsTheirs`, `keepsMine`.

## Run it

```bash
cd frontend && bunx vitest run src/pages/Trips/__tests__/saveProtocol.property.test.ts
```

Expect `3 passed | 1 expected fail`, in about 5 s. Before merging a change to the covered code, run the deeper pass too (about 2 min):

```bash
cd frontend && SAVE_PROTOCOL_RUNS=20000 bunx vitest run src/pages/Trips/__tests__/saveProtocol.property.test.ts
```

The browser half lives in `frontend/e2e/trips/save.spec.ts` (one save per version while typing during a save, undo after another device's change). Run it on the hermetic stack (`playwright.config.ts` starts it):

```bash
cd frontend && bunx playwright test e2e/trips/save.spec.ts
```

## Reading a failure

fast-check prints a shrunk counterexample: a short list of steps. Replay it as a story in the code's words ("the traveller types a day title, the save goes out, they type again, the first answer lands") and decide:

- **Real bug.** The story is something a traveller can do, and the end state breaks the promise in the app. Reproduce it in the browser if you can (`save.spec.ts` shows how to hold a PATCH with `page.route`). Fix the code. Add the shrunk steps to the pinned examples at the bottom of the test so they run first every time.
- **Modelling error.** The story needs something the app cannot do: two events in one dispatch that the app splits, a request the shell would never send, a 409 the server would never answer. Fix the model in the test, and say in the commit which code fact it now matches.
- **Intended behaviour.** The promise is wrong for this case. Check `docs/trips.md` first. For example, when both sides edit the same stop, the traveller's version of that stop wins whole (`mergeItems`); `keepsTheirs` skips stops the traveller touched for that reason. Change the property only when the doc says so, and update the doc in the same change.

Never raise the run count, drop a pinned example or loosen an assertion to make a failure go away.

## Findings

- **Fixed in 8dc9ed36.** Typing during a save sent the same PATCH twice; the hook deduped on the `Sync` object, which an edit replaces. `send()` now makes a new `sent` per request and the hook dedupes on it. Pinned example `typedTwiceWhileSaving`.
- **Fixed in 95a0d242.** Undo after a merge erased the other writer's change (an open typing step spanned the merge), and an undo that clashed fell back to the whole remembered plan. `merged()` closes the step on every merge; `replayPlan` merges with the step winning only clashing fields. Pinned examples `undoAcrossTheirCopy`, `redoOverTheirRename`.
- **Open.** A save that landed but whose answer was lost is retried against the old base, the server answers 409 with the traveller's own save, and newer typing on the same field clashes with it, so a traveller alone sees "Keep mine / Use theirs". No data is lost (Keep mine keeps the newest). Property 2 is `it.fails` with the pinned example `answerLostThenTyped`; when it is fixed, vitest reports the `it.fails` as passing unexpectedly, so flip it to `it`.

## Bounds and what it does not cover

- 2 days × 2 stops, up to 40 steps per run, 5,000 runs by default. A pass means no counterexample was found in that space. It is a property check, not an exhaustive proof.
- Edits covered: stop notes, day titles, new stops. Not covered: deletes, moves between days, the wishlist, budget, checklist, invites, layout fields.
- AI runs (`AI_START` / `AI_DONE`) are not generated; their merge goes through the same `merged()` seal but is unchecked here.
- The offline draft store (`tripDrafts`), IndexedDB and the service worker are outside the model.
- One other writer, not several.

## Coverage record

Last confirmed against the code at commit **95a0d242**.

| File | What the check depends on |
|------|---------------------------|
| `frontend/src/pages/Trips/editorMachine.ts` | `editorReducer`, `send`, `rebaseOnto`, `replayPlan`, `merged`, `savePatch`, `sameContent` |
| `frontend/src/pages/Trips/tripMerge.ts` | `rebaseTrip`, `resolveTrip`, `mergeDays`, `mergeItems`, `mergePlan` |
| `frontend/src/pages/Trips/useTripEditor.ts` | the save effect: one request per new `sync.sent` (`inflightRef`) |
| `server/src/routes/trips.ts` | `PATCH /api/trips/:id`: compare-and-set on `baseUpdatedAt`, 409 with the server copy |

To see whether the check needs another look after a change:

```bash
git log --oneline 95a0d242..HEAD -- frontend/src/pages/Trips/editorMachine.ts frontend/src/pages/Trips/tripMerge.ts frontend/src/pages/Trips/useTripEditor.ts server/src/routes/trips.ts
```

For each commit listed, confirm the model still matches the code (a new event, a new field in `savePatch`, a different 409 rule, a second request path in the hook) and update the test if not. Move the commit above forward only after that confirmation.

## Proving a change to the check

A property never seen failing proves nothing. After changing the model or a property, break the code it guards on purpose (for example make `merged()` return `state` unchanged, or have `send()` reuse `state.sync.sent`), run the check, see it fail with a story you recognise, then restore the code.
