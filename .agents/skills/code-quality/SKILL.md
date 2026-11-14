---
name: code-quality
description: How code is written and reviewed in this repo, from first principles. Use before writing, refactoring or reviewing any TypeScript here (React, Hono, Effect, three.js engines, tests). Triggers on new modules, state design, error handling, async work, performance, tests, refactors and code review.
---

# Code quality (anthonyl.im)

This codebase has one maintainer and many contributors who arrive with no memory of it. Almost every change is made by someone reading a file for the first time. So the standard is not "does it work" but:

> Could a stranger change this safely, with only this file open?

Everything below follows from that question. Where a rule and the question disagree, the question wins.

Stack-specific method lives in two sibling skills: [`effect-ts`](../effect-ts/SKILL.md) for frontend I/O and [`stylex`](../stylex/SKILL.md) for styling. Read those too when you touch either.

## 1. Make the wrong state impossible to write

A bug that the type checker rejects never ships. Spend effort on the shape of the data before the code that moves it.

- **One union per mode, not several booleans.** `status: 'idle' | 'saving' | 'saved' | 'retry'` has four states. `isSaving` + `hasError` + `isDirty` has eight, and four of them are nonsense you now have to handle. The Trips workspace models `status`, `mutation` and `action` this way; follow it.
- **Absence is explicit.** A field that can be missing is `T | null` and every fixture declares it. Optional (`?:`) is for arguments, not for stored documents, because "forgot to set it" and "set to nothing" must not look the same.
- **Parse at the edge, trust inside.** Anything from outside the program (a model's JSON, `localStorage`, a URL, a third-party API, a request body) is untrusted until one function has cleaned it: zod schemas in `server/src/trips/types.ts`, `cleanItem` / `cleanPlace` / `cleanOps` for Lim's world, `repairTruncatedJson` for cut-off model output. Clean means enums checked, numbers clamped, lengths bounded. Past that function, code does not re-check. Defensive checks scattered through the interior hide where the real boundary is.
- **Names come from the product.** `stop`, `leg`, `day`, `pin`, `proposal`, `phase`. If a name describes the mechanism (`data`, `item2`, `handleThing`, `manager`), the concept has not been found yet.

## 2. One fact, one owner

Every piece of state and every rule should live in exactly one place. Duplication is where drift starts, in code as in docs.

- **Derive, do not store.** If a value can be computed from state you already hold, compute it during render (or memoise it). A `useEffect` that copies one state into another is a second owner and will disagree with the first for one frame, then forever.
- **Reset with identity, not with effects.** A component that must start fresh for a new trip gets `key={tripId}`. That deletes a whole class of "stale field from the last trip" bugs for free.
- **Async results belong to whoever asked.** When the owner is gone (trip changed, component unmounted, a newer request started) the result is dropped: a sequence guard, an `AbortSignal`, or a check on the id the request was made for. Writes that touch the same document are serialised.
- **Shared shapes are mirrored on purpose.** `server/src/trips/types.ts` and `frontend/src/pages/Trips/types.ts` describe one document. Change both in the same commit.
- **Constants have homes.** Storage keys in `lib/constants.ts`, tokens in `index.css`, catalog ids in `chat/world/spec.ts` with a parity test against the server. A literal that appears twice wants a name.

## 3. Pure core, thin shell

The parts of this repo that are easy to change are pure: `photoreal/camera.ts`, `sun.ts`, `stops.ts`, `map/geo.ts`, `trips/signals.ts`, `meta.ts`. Data in, data out, tested to the edge cases. The parts that are hard are the ones that touch the world. Keep the second kind small and put the thinking in the first.

- **Functions that decide do not also do.** Work out *what* should happen as data (a proposal, a list of ops, a camera pose), then hand it to a small piece of code that performs it. The concierge proposes changes; the client applies them. That split is why Undo was cheap.
- **Engines are objects with a lifetime.** A map, a WebGL scene, a physics world is created once, driven by methods (`select`, `fitAll`, `setTheme`), and has a `dispose()` that releases everything it took. React holds it in a ref and translates props into method calls. React does not own its frame loop and the engine does not know React exists.
- **Components render.** A component reads state and returns markup. Date maths, sorting, geometry and formatting live in a module beside it where a test can reach them.
- **A file is as long as its one job.** `limScene.ts` is long because it is one creature. Split a file when it has two reasons to change, not when it crosses a line count. Never split to hit a number, and never create `utils.ts`: name the module after what it knows.
- **Dependencies are passed in on the server.** Routers are factories (`createTripsRouter(deps)`), so a test hands in a memory store and a fake model. Reach for a module-level singleton and you have chosen to mock instead.

## 4. Failure is part of the design

Networks drop, models return half a JSON object, GPUs are missing, a tab stays open across three deploys. Decide what the person sees in each case before writing the happy path.

- **Errors are values with names.** On the frontend, `Schema.TaggedError` and `Effect.catchTag`; on the server, thrown errors reach `app.onError` and answer JSON with a `requestId`. No bare `catch {}`. If you catch, you either recover fully or add context and pass it on.
- **Degrade, do not fail.** A draft that could not fill day 7 returns the other days plus `incompleteDays`. A dead 3D overlay closes itself inside an `OverlayBoundary` and the page keeps working. A missing key falls back to the keyless path. Ask "what is the most useful thing still possible?"
- **Everything that waits has a deadline.** 2 s for the Jev router, 4 s per readiness check, 10 s for the Clerk proxy. An await with no timeout is a hang you have not met yet.
- **Retry only what is safe to repeat.** Reads retry once on a network error. Writes never retry silently.
- **People see sentences.** "Couldn't reach the map service. Your changes are saved." Never a stack trace, a status code alone, or a pipeline log. The detail goes to the log and the telemetry beacon.

## 5. Performance is a budget, set up front

The server is a 1 GB droplet. The client is often a phone drawing a soft body at 60 fps. Slowness here is a design defect, not a later ticket.

- **Heavy code loads when it is needed.** MapLibre, three.js and the photoreal view are lazy chunks behind `lazyRetry`. A route's entry module never imports them. Check the build output when you add a dependency.
- **Idle means zero work.** Scenes render on demand, pause off-screen, and put settled bodies to sleep. No `requestAnimationFrame` loop spins while nothing changes.
- **The frame loop allocates nothing.** No `new Vector3()`, array spread or closure per frame; reuse scratch objects. `Jelly.step` is the model.
- **Measure, then change.** Profile before optimising and say what you measured in the PR. A clever cache without a number behind it is just more state to own.
- **Do the slow thing once.** Bake textures at start-up, render one thumbnail and cache it, batch instances into one draw call.

## 6. React, specifically

- State is the minimum that cannot be derived. Effects synchronise with something outside React (a socket, an engine, the DOM); they do not compute.
- A value read inside a long-lived callback goes through `useLatestCallback`, so the callback stays stable and never sees a stale closure.
- Urgent updates (typing, streaming tokens) are synchronous; list and document commits go through `useTransition`.
- Lazy boundaries: a route goes in `Guarded`, an optional overlay in `OverlayBoundary`. A WebGL view unmounts when closed; hiding it keeps a GPU context alive.
- One write path per piece of state. Two code paths that both append to the same list will, one day, both run.

## 7. Tests buy the right to change things

A test is worth writing when it would catch a real mistake and would not need rewriting for a harmless refactor.

- **Test behaviour at a seam.** Pure modules get exhaustive cases. Routers are called through HTTP with injected dependencies. Components are tested through what a person can see and do.
- **A bug fix starts with the test that fails.** Then the fix. The test is the proof and the fence.
- **Write the negative set.** For anything that classifies (`localIntent`, the linkifier, a parser), list the inputs it must *not* act on. `chat/__tests__/world.test.ts` holds some 220 of them, and they matter more than the positives.
- **Inject, do not mock what you own.** A mock of your own module tests the mock. `server/src/appLoad.test.ts` exists because heavy mocking once let a missing export reach production.
- **No sleeping, no real network, no order dependence.** A flaky test is deleted or fixed the day it flakes.

## 8. Comments, and what to leave out

- **A comment carries what the code cannot:** why this way and not the obvious way, the constraint that came from outside, the bug this line prevents. The `--edge-float-x` note in `index.css` (what iOS Safari does, at what width, and what the fix buys) is the model. Write for the person about to "simplify" it.
- **Do not narrate.** `// loop over stops` above a loop is noise. If a block needs a summary, it wants to be a named function.
- **No dead code, no commented-out code, no TODO without a plan.** Git remembers. An unused export is a question every future reader has to answer.
- **Delete with confidence.** Removing code is the best change there is. If something is superseded, remove it in the same PR and remove its docs with it.

## 9. The shape of a change

- Fix the cause. If the symptom is in the component and the cause is in the data shape, change the data shape.
- One purpose per PR. A refactor that rides along with a feature hides both from review.
- Leave the file more consistent than you found it, in the style it already has. Do not introduce a second way to do something that already has one.
- Update the one document that owns the fact you changed ([`AGENTS.md`](../../../AGENTS.md) says which).
- Run the gate before you ask anyone to look: server tests and frontend typecheck always; build and vitest if `frontend/` changed.

## Before you call it done

Read your diff once as the stranger.

1. Is there a state this type allows that the product does not?
2. Does any fact now live in two places?
3. What happens when this is slow, fails, or is cancelled halfway?
4. What runs when nothing is happening?
5. Which test fails if someone undoes this?
6. Is there a line you could delete?
