# anthonyl.im — Design Context

Read the section for the route you are changing before any UI work. Always-on engineering rules live in [`AGENTS.md`](AGENTS.md); this file is the only copy of the design context.

Six surfaces share one Vite SPA: Lim the chatbot (`/`), a static home page (`/home`), the lab landing page (`/lab`), **BreathFlow** (`/breathwork`), the **Korea** itinerary (`/trips/korea-2026`) and the generic **trip planner** (`/trips`). Each has its own visual identity; all share the craft principles below.

**Register:** landing + chatbot = brand surfaces; BreathFlow / Korea / Trips = product UIs. Infer the register from the route before applying craft rules.

---

## House style (every route)

How to design here, step by step, is the [`design-craft`](.agents/skills/design-craft/SKILL.md) skill. The short version:

1. **One living thing, and quiet around it.** Each surface has one centrepiece that responds (Lim, the droplet, the cat, the map) and chrome that stays out of its way. Never two vivid moments in one viewport.
2. **Worlds do not mix.** Each app owns its material, type pair, single accent and motion character. Nothing is shared between them except the standards below.
3. **Type carries the hierarchy.** One display face with character, one text face that disappears; contrast in big steps of size, weight and tracking.
4. **One accent, many tinted neutrals.** The accent means one thing. Dark mode is designed, not inverted.
5. **Motion is physics with a reason.** Springs for anything touched; every animation orients, reveals or confirms. Decorative-only motion is cut.
6. **Every state is designed:** empty, loading, error, long content, phone, dark, reduced motion.

### Standards

- **Contrast:** WCAG AA. 4.5:1 for text, 3:1 for control edges and focus rings, in both themes.
- **Reduced motion:** every transform, pulse and camera move honours `prefers-reduced-motion`, keeping the information and dropping the travel.
- **Touch targets:** at least 44 × 44 px.
- **Focus:** a visible ring on every interactive element, in the route's accent.
- **ARIA:** live regions, proper roles and explicit labels on every dynamic surface (the breathing cat, 3D stop pins, status banners).
- **Long strings:** no layout breaks on long Korean / hangul text; user strings use `overflow-wrap: anywhere`.

### The worlds at a glance

| Route | Material | Display / text | Accent | Motion |
|-------|----------|----------------|--------|--------|
| `/` Lim | Sorbet studio: cream `#FFF6EC`, night indigo `#1E1833` | Fredoka / Inter | Coral `#FF7E6B` | Squash, stretch and bounce |
| `/lab` | Bone card `#EDE8DF`, ink `#0E1024` | Archivo / Fragment Mono | Ultramarine `#2433E0` | Taut springs, ink dissolve |
| `/breathwork` | Cotton paper `#F7F1E6`, ink-blue `#15161C` at night | Fraunces / Geist | The technique's pigment | Wet paint spreading at the pace of a breath |
| `/trips` | Chart paper `#f1f0eb`, `#0b0d10` at night | Instrument Serif / Inter, Fragment Mono for data | Signal orange for chrome, the trip's own accent for identity | Camera flights, springy pins |

The `:root` defaults in `frontend/src/index.css` (Inter, warm canvas `#F5F2ED`, Cormorant Garamond) dress only the legal pages and the unrouted legacy Korea pages. Do not reach for them in a live app.

---

## Design Context: `/lab` — anthonyl.im Lab Landing

Code: `frontend/src/pages/Landing/` (`Landing.tsx`, `parts.tsx`, `content.ts`, `landing.stylex.ts`, `HeroCanvas.tsx`, `scene/`). A fictional AI lab ("design study", disclosed in the footer). All copy and mock data live in `content.ts`. Product cards link to the real apps: Lim → `/`, Concierge → `/trips`, BreathFlow → `/breathwork`.

- **Palette:** bone `#EDE8DF` canvas, ink `#0E1024`, one ultramarine accent `#2433E0`. Tokens are `--lim-*` vars on `.landing` in `index.css`. Display type is Archivo (wdth axis), with Fragment Mono for data.
- **Hero:** WebGPU (WebGL2 fallback) soft-body glass droplet (`scene/heroScene.ts`). It's a three-blocks `MeshTransmissionNodeMaterial` with spring physics (drag, poke, stretch). Normals come from a procedurally hand-painted brush field (`scene/painter.ts`), which also serves as the static still and fallback. TSL post: bloom, scroll-driven ink dissolve, three-blocks `filmHD`. The scene runs only while on screen; reduced motion freezes the clock.
- **License:** `three-blocks` is PolyForm Noncommercial 1.0.0. The footer carries the Required Notice — keep it. Commercial use needs a three-blocks license.
- **Chunks:** the hero loads `three-core` + `three-webgpu` only; the photoreal 3D view loads `three-core` + `three`.

---

## Design Context: `/` — Lim, the jelly companion

Code: `frontend/src/chat/` (page shell `frontend/src/App.tsx`). Engineering (files, Lim's world, the model routing and its eval, physics, persistence keys): [`docs/lim.md`](docs/lim.md).

### Users
Visitors who open `/` (from the landing page or a shared link). Recruiters, prospective collaborators, friends, curious engineers. They're trying to get a feel for who Anthony is — fast. They scan, they pivot, they leave if it doesn't earn attention.

### Brand Personality
**Playful, Warm, Crafted.** Lim is a Pixar-soft coral gumdrop of jelly who answers for Anthony. The craft shows in how Lim moves; the chat itself stays calm and readable.

**Emotional goal:** Delight in the first second (Lim pops in, bounces, shakes it off, looks at you), then a reassuring "this person ships" feeling. The mascot is the demo.

### Aesthetic Direction
- **Theme:** "Sorbet studio": cream day canvas `#FFF6EC`, night-indigo `#1E1833` (toggle in header, or `S`). Pastel blobs, doodles and confetti are set dressing only.
- **Mascot:** the toolkit `Jelly` soft body (shape matching, `upright` righting) in a gelatin shader (`gel` in `limLook.ts`): a soft toon ramp, light bleeding through the thin far edge, floor bounce, a small studio-window highlight on the crown (masked off the face paint), a swirl on the back of the head so a turn reads as a turn, a smoothed rest-normal blend and an ink hull. Mouth (lens to "o", teeth, tongue), blush and brows are painted in the body shader. Eyes are painted spheres with real lids (`createEyeMaterial`: iris, catch-lights, top / bottom lids meeting at a seam, hearts, dizzy spirals); a shut eye tucks its ink ring away. A springy tuft (`Tuft` in `fx.ts`) gives every move overlapping action and shows the mood (`bend`: wilts when sad or asleep, stands up when startled). A polka-dot floor, a scalloped mint rug, a coral-tinted contact shadow, jelly beans and a bouncy gumball, each with its own seat clear of Lim (three toys on a narrow stage, four on a wide one). Stage edges move a whole body back inside and reflect it; nothing is clipped flat.
- **Behaviours:** idle breathe + fidgets + blinks + eye darts; typing leans in, nods per keystroke and eyes follow the caret (ALL CAPS startles Lim); send = crouch, hop, squash landing; thinking = wobble + thought bubble; streaming = a new mouth shape per chunk (and a babble syllable with sound on); done = happy squish + confetti and a pirouette (first reply); error = droop + "Try again"; poke = giggle + blush; a gentle drag stretches Lim like taffy and carries it as a teardrop, held facing you (Lim and the toys are drawn through `skinJelly`: the smooth shape-matched goal plus a soft-limited share of each particle's offset, so a hard shake or impact can never crease or facet the surface); a fling bounces off the walls and floor. Every jump is anticipation, stretch, then squash with soft dust discs sliding out along the floor, a floor ripple, a thump that jolts the toys and a little camera shake (`jump` / the landing block in `brain`). Left alone Lim yawns and naps with a nose bubble (sooner at night); shaken or bounced off the walls Lim gets dizzy (spiral eyes, orbiting stars); tap the floor and Lim hops over. Flips are rigid aerial cartwheels and pirouettes are rigid turns (`Jelly.rotate`), so the face stays readable; a stage with no headroom pirouettes instead of flipping.
- **Easter eggs:** keep them discoverable, never required. Feed Lim a bean (drag it toward the mouth: Lim tracks it, opens wide, snatches it from your hand, chews three times with puffed cheeks, swallows, and the bean's colour rises from the belly for a while; then a burp. Three in a row is a food coma). Ten quick pokes inflate Lim until it pops into six mini Lims that scamper, regroup and merge. A message that names a trick (`stuntFor` in `eggs.ts`: flip, spin, dance, jump, love, sleep, big, tiny, boo, party, pop, a greeting) gets the trick instead of the send hop, and the question is still answered. The Konami code throws a party. The console says hello.
- **Lim's world:** a visitor can give Lim things and send it places, from the toy box (the brick button in the composer) or by asking in chat. Catalog items and things the model invents are the same data, drawn by the same gel shader and ink outline. Lim plays with what it is given (kick, hug, eat, wear, nap, dance, flee), shoots hoops and scores goals, and reacts to a place's mood. Landscapes stand behind the stage like a pop-up book. With motion reduced, items simply appear and actions apply their outcome only. Details: [`docs/lim.md`](docs/lim.md).
- **Sound:** off by default; the header speaker button (or `M`) turns on synthesised foley (`sound.ts`: boings, squeaks, gulp, babble, a dance beat). No audio files. Lim's voice pitch follows its size.
- **Layout:** desktop stage left, chat panel right. Phones: the header floats over the stage's sky, and the stage takes a share of the screen (half before the first message, less on short phones so the greeting fits; 40% once chatting; compact while typing, when the header slides away). The chat sheet's grip (`role="separator"`) drags or taps the stage bigger, arrow keys too, and the choice is kept under `lim-stage`. Phones get short wording (intro, suggestion pills, placeholder) and keep Copy / Regenerate under the latest reply only.
- **Accent:** Lim coral `#FF7E6B` (send button, Lim's name, list markers). Plum ink `#2B2140` carries the text.
- **Type:** Fredoka display (headings, chips, captions), Inter body.
- **Anti-references:** no purple "AI" gradients, no glowing borders, no rainbow typing indicators. Do not reuse the landing's ultramarine, BreathFlow's watercolour or the Trips atlas.

### Per-route Tokens
- Theme classes: `chatbot-shadow` (day) / `chatbot-dark` (night), both defined in `frontend/src/chat/chat.css` (`--chat-*` vars), not `index.css`
- `html:has(.chatbot-*)` paints the canvas so iOS safe areas blend
- The 3D scene is lazy (`import('./scene/limScene')`); `LimArt` SVG is the first paint and the no-WebGPU/WebGL fallback
- Reduced motion freezes the jiggle and renders on demand; CSS beats are paused; stunts and easter eggs become a still smile

---

## Design Context: `/breathwork/*` — BreathFlow ("Watercolor breath")

Code: `frontend/src/breathflow/`. Session state is `useSessionEngine` (React state, not Zustand). The centrepiece is a WebGPU soft-body watercolour **cat**: `scene/catScene.ts` (three/webgpu + TSL, lazy-imported by `scene/BloomCanvas.tsx` so three stays out of the initial chunk), positioned by `scene/BloomAnchor.tsx` (painted CSS fallback + brush progress stroke) and driven by `scene/breathDrive.ts` (`useBreathReader` interpolates the 1 Hz engine tick into a smooth amplitude). Built on the shared toolkit in `frontend/src/three/` (`createStage`, `Jelly`, `bindJellyPointer`). `syncJellyGeometry` computes normals + bounding sphere straight on the typed arrays (three's `computeVertexNormals` was half the frame), and `createStage` starts phones at DPR ≤ 1.5 and runs a frame-rate governor that steps the pixel ratio down 15% when the median frame falls behind the display's own rate (60, 120 Hz alike). Pigments live in `pigments.ts`; paper/wash/brush CSS + SVG filters in `styles/watercolor.css` + `components/WatercolorDefs.tsx`. Fonts: Fraunces display (`.bf-display`, SOFT/WONK axes) + Geist body.

### Users
Wellness enthusiasts and people seeking anxiety / stress relief. They open BreathFlow when they need to decompress, build a daily breathing habit, or access structured breathwork techniques backed by science. The context is often evening wind-down, pre-performance calm, or mid-day stress breaks — moments that demand a UI that feels immediately calming upon launch.

### Brand Personality
**Calm, Scientific, Hand-made.** A precision instrument painted by hand: evidence-based protocols, delivered as a living watercolour. Gamification (XP, levels, wax-seal badges) exists to sustain habit, not to entertain.

**Emotional goals:** Immediate calm (wet paint spreading slowly on paper) and quiet confidence (the bloom fills exactly as long as the breath).

### What it does
- **Home:** greeting, streak, week dabs and a daily-goal ring (minutes today against the goal set in Settings); a goal and length chooser that ranks the catalog into one recommended session plus alternatives; "Breathe now · 1 min"; journeys; recent sessions. With a journey under way, wide layouts add a one-line link to its next day under the recommendation.
- **Session:** setup (rounds, cadence, safety check for advanced protocols), then a three-second lead-in ("Settle in", cancellable) before the first breath. A hairline shows whole-session progress with "Round n of N · m:ss left". Esc ends, M mutes, Space pauses. Ending early after the first round keeps the finished rounds as a shorter session (XP scaled to the share completed, never below `MIN_SESSION_XP`); ending in the first round discards it. The summary rates calm before and after.
- **Sound** (`engine/audio.ts`, `soundscape.ts`, `voice.ts`): soft bell cues per phase and a triad on completion; an optional synthesised soundscape (tide, rain, drone) whose level and tone follow the breath amplitude; optional spoken cues through the browser's speech synthesis. All off with the master Sound switch. Nothing is downloaded.
- **Journeys** (`journeys/catalog.ts`): a few days of practice in a fixed order, built only from published, non-gated protocols (no new technique or claim). One is active at a time; progress and the daily goal live in `practiceStore` and sync to `user_state.practice`. Finishing one earns the Wayfinder badge. Journey ids are persisted: never rename them.
- **Progress:** the week in a sentence, lifetime figures, level, activity heatmap, an eight-week minutes trend, sessions by time of day, calm shift overall and per technique, hold-time trend, badges, personal bests, history. "Share this week" paints a 1200×630 card (`share/weekCard.ts`) for the system share sheet, or saves a PNG. Every figure is derived from the session log (`gamify/patterns.ts`, `practiceWeek.ts`); nothing extra is stored.
- **Settings:** theme, sound (master, soundscape with preview, spoken cues), haptics, daily goal, data export / import, clear data.

### Aesthetic Direction
- **World:** a hand-painted watercolour on warm cotton cold-press paper (`#F7F1E6`); dark mode is deep ink-blue paper (`#15161C`). A fixed `.bf-paper` tooth overlay multiplies over everything.
- **Cat:** a pen-and-wash cat painted in the technique's pigments. Body and head are `Jelly` soft bodies (the head rides a neck point on the body); ears, paws and a swept-tube tail follow them via `attach`; the face (amber eyes with slit pupils, nose, ω mouth, whiskers, blush) is painted in rest space. It acts out the breath: inhale swells the chest, lifts the head, perks the ears and widens the eyes; a full hold puffs the cheeks and goes still apart from a shiver; the exhale is a "haa" sigh with soft eyes and dropped ears; an empty hold is a contented squint. Idle: blinks, ear twitches, tail swish. One shared light model drives every part: a warm key from the upper left (ragged shadow edge, core shadow, pooling at the turn), a Blinn glint that leaves the paper bare, warm floor bounce in the shadows, and a cool moonlight rim from behind. Day paints it as a Beer–Lambert glaze over the paper; night lays an opaque moonlit body colour over the ink-blue paper with moon-white glints and a dark ink hull (never bare paper, which is dark at night). **High tier** (WebGPU, unless the stage reports it struggling at the lowest pixel ratio; `?quality=base|high` forces a tier): GTAO contact occlusion pooled as pigment where parts meet, a soft bloom on moonlight at night, and pen hatching through the cat's shadow side. **Easter egg:** five taps within 2.5 s pop it (paint splash) into a glossy pink puffball homage (Kirby's face: tall navy eyes fading to blue under a big glint, rosy oval cheeks, a tiny mouth; squeezed "> <" eyes on the inhale and when held; painted over clean paper so the blooms don't show through) that puffs up hugely on the inhale with an open "O", floats with flapping arms on a full hold, and blows air clouds on the exhale; five more taps bring the cat back (the form survives Home → Session). The paper sheet keeps wet-in-wet blooms, a splatter ring that flies out on each inhale, and a shadow wash under the cat. Noise and splatter are baked once in `scene/paintTextures.ts`. Post: paper tooth, colour bleed, vignette, static Three.js Blocks `filmHD` grain (credited on Settings). The session count sits beside the phase word so it never covers the face.
- **Interaction:** poke (a giggle) + drag the cat on Home and session setup, by mouse or touch (a finger on the cat drags it; elsewhere the page scrolls). Grabbed, a body goes loose and stays upright, stretching toward the finger (the cat goes wide-eyed, the puffball squeals and flaps); let go, it boings home, wobbles and squashes on the paper. The contact shadow follows and fades as it lifts. A ball of yarn rests beside the cat on Home and session setup (never during a session): toss, bat or drag it and it bounces off the paper, the cat and the edges of the picture; the cat turns its head to watch and flinches when hit, each exhale nudges the ball away and it rolls back. It shares the cat's light model and casts its own shadow wash; under reduced motion it sits still. During a session, a gentle poke only. Taps count toward the puffball easter egg everywhere. Space toggles pause/resume.
- **Chrome:** matte paper, pill buttons tinted by the active pigment (`--bf-ink`), painted swatches/dabs (`.bf-swatch`, `.bf-dab`), brush strokes (`.bf-brush`). Celebration is a paint-splash burst (`PaintSplash`), not confetti. Badges are wax seals.
- **Anti-references:** ultramarine/SaaS blue-purple, glossy glass chrome, cartoon wellness, cluttered dashboards.

### Per-route Tokens

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| Canvas (paper) | `#F7F1E6` | `#15161C` | Page + WebGL paper |
| Surface | `#FBF7EF` | `#1C1D24` | Cards, dock |
| Text | `#27231F` | `#EDE6DA` | Body |
| Accent (Payne's grey) | `#3A4A5C` | `#A9BDD2` | Focus rings, default ink |
| Destructive | `#A8322A` | `#F2877E` | Delete |

CSS vars: `--bf-mass` / `--bf-glaze` (current pigment), `--bf-ink` (primary-button tint), `--bf-amp` (breath amplitude, written per frame by `BloomAnchor`).

#### Technique Pigments (`pigments.ts`)

| Technique | Pigment | Mass | Glaze |
|-----------|---------|------|-------|
| Box Breathing | Indigo & Payne's grey | `#2B3A5E` | `#55657A` |
| CO2 Tolerance | Viridian | `#1F7A68` | `#5E9C7F` |
| Power Breathing | Quinacridone rose & cadmium orange | `#C23A64` | `#E5793A` |
| Cyclic Sighing | Cobalt violet | `#7D4FA3` | `#C08BC2` |
| Resonance | Cerulean | `#2F7FA6` | `#73B2B6` |
| Diaphragmatic | Sap green & raw sienna | `#5D8436` | `#C18F47` |
| Extended Exhale | Permanent rose | `#B9506F` | `#D99A9B` |
| 4-7-8 | Moonglow | `#45407A` | `#8A7FA8` |
| Pursed-lip Recovery | Burnt sienna | `#A4532F` | `#D19A55` |

Unlocked bloom pigments (Settings, by level) override the technique pigment with the theme's colours.

### BreathFlow-specific Principles

1. **Serenity first.** Every design decision should reduce visual noise. White space (paper) is a feature.
2. **Scientific credibility.** Protocols, evidence labels, and safety gating stay first-class; the paint never hides the instructions.
3. **The breath is sacred.** The cat's swell and expressions must track the engine phase exactly (`breathDrive.ts`); surrounding UI fades during session. Under `prefers-reduced-motion` the physics freezes (poses come straight from the rest shape) and the scene renders on demand per tick — pacing stays legible through the phase word, count, the cat's pose and face, and the brush stroke.
4. **Habit > novelty.** Gamification exists to drive return visits. Never let the motivational layer overpower the breathwork itself.
5. **WebGPU is progressive.** No GPU → the painted CSS bloom (`.bf-painted-bloom`) carries the same breath via `--bf-amp`. The scene must stay a lazy chunk.

---

The March 2025 audit is historical: BreathFlow was rebuilt in `frontend/src/breathflow/`. Do not search for deleted files (`FluidOrb.tsx`, `BreathingSession.tsx`, `pages/Home.tsx`, `components/breathing/`, `sessionStore`).

---

## Design Context: `/trips/korea-2026` — Korea Trip Itinerary

The Korea trip is the seeded trip `korea-2026` (rose accent). It renders in the atlas workspace like any other trip; there is no separate rose / amber parchment dossier any more. Page design: the "Design Context: `/trips/*`" section below. Legacy `/korea*` frontend routes redirect here. `/api/korea/*` remains. Do not add new destination-specific routes.

What stays Korea-specific is data (snapshot seed, `/api/korea/chat` concierge fallback) and the Korea-scoped PWA.

### Users
Anthony (primary) and his partner, planning and executing a 12-day Seoul + Busan trip in late May / early June 2026. Phones for in-trip lookups, desktop for planning.

### Korea-specific Principles

1. **Smart links everywhere.** Flight numbers → carrier tracker, KTX → Korail timetable, addresses → Google Maps, phones → `tel:`, times → AM/PM tooltip. Free-form copy gets auto-linked by the `LinkifiedText` engine.
2. **PWA auto-update is mandatory.** Service worker + client must auto-swap to the latest version after each deploy. Bump `CACHE_VERSION` on every breaking SW change.

---

## Design Context: photoreal 3D view — "Fly the day"

Code: `frontend/src/pages/Trips/photoreal/`. Any trip day opens it from the day map's "Fly in 3D" button or its "⋯" menu ("Fly the day in 3D"). The day's located stops stand on Google Photorealistic 3D Tiles; chrome is atlas paper plates (opaque `--trips-*` surfaces, no glass stacks).

- **Files:** `PhotorealOverlay.tsx` (chrome + state, `role="dialog"` with focus trap), `photoreal.stylex.ts`, `scene.ts` (engine), `tilesGround.ts` (Google tiles) / `devGround.ts` (DEV-only procedural model city, dynamic import), `camera.ts` + `sun.ts` + `stops.ts` (pure, tested), `terrainAnchor.ts`, `adaptiveQuality.ts`, `deviceTier.ts`, `youPin.ts`, `available.ts` (`photorealAvailable()`; the only file outside the `photoreal` chunk).
- **Stops:** the day map's `.atlas-pin` stop pins as DOM buttons (`.photoreal-pin*` in `index.css`), projected from terrain-snapped points, each with a 3D stem and ground ring. Crowded or occluded pins shrink to dots. Numbering comes from `dayStops` and matches `dayPins`.
- **Route:** one shallow 3D arc per leg in the trip accent on a paper casing; the selected stop's legs are emphasised.
- **Camera:** arrival fly-in once tiles exist (or after 2.5 s), fly-to on select (tilt 54°, 250–450 m), a slow idle orbit that any input stops, time-based tweens. Chrome insets shift the optical centre (`setInsets`). Reduced motion: jump cuts with a short canvas dip, no orbit, no tour.
- **Chrome:** desktop is a left panel (title, Play tour, stop list with legs; the selected stop unfolds into the card); phones get a title plate, a numbered rail and a swipeable bottom card. Top-right: compass, tilt, locate, fit all. Keys: ← / → step, Home / End, Space tour, F fit all, Esc close.
- **You:** no location prompt on open. Shown (brand-accent glass droplet) only when permission is already granted or the traveller taps locate, and only within 50 km of the stops.
- **Light:** sun from the trip's time zone, the day's date and the anchor latitude (the selected stop's time when it has one). Tiles stay unlit (pre-lit photogrammetry); the dark theme tints them to dusk. No bloom, god rays or clouds.
- **Rules:** renders on demand (no rAF at rest); disposes with `forceContextLoss()`; **must unmount** when closed (never React `Activity`); Google attribution stays visible; failure (no WebGL, tiles refused) shows a calm card with the stop list and Directions links.

---

---

## Design Context: `/trips/*` — Generic Trip Planner

Code: `frontend/src/pages/Trips/`. Visual spec: [`DESIGN.md`](DESIGN.md). Engineering: [`docs/trips.md`](docs/trips.md). Token source of truth: the `.trips` block in `frontend/src/index.css` ("TRIPS — the atlas"). Korea is the seeded trip `korea-2026`; every new destination is a trip document, not a new route tree. Shared-site Cormorant / parchment does not apply here.

### Users
The same travelers as Korea, plus future trips and the people they share a link with. Phone for in-trip lookups; desktop for planning, AI drafts, and concierge chat.

### Brand Personality
**"The atlas": a cartographer's desk.** Map-first planner. Cool chart-paper surfaces, hairline rules, soft layered shadows, serif names set like map labels, coordinates and data in mono, and one live 3D map per page. Two accents: a constant brand accent (signal orange, `--brand*`) for chrome, and the trip's own accent (`--ta*`) for trip identity; everything else is ink and paper.

**Emotional goal:** See the trip as a place first, then know what happens next.

### Aesthetic Direction

- **Map:** MapLibre GL JS v6 + OpenFreeMap vector tiles (no key). Custom two-palette basemap in `map/mapStyle.ts`: globe projection with atmosphere at low zoom, extruded 3D buildings from zoom ~13.2.
- **Pins and route:** pins are DOM buttons styled by `.atlas-pin*` in `index.css`. Overview map: one numbered pin per day at that day's centroid (click opens the day) over small dots for every stop, no routes. Day map: numbered stop pins plus the route, one shallow arc per leg (deduplicated), a solid 3px trip-accent line on a paper casing with small direction chevrons. Index globe: trip chips, which flip side past the globe's midline. Arrival frames tilt (pitch 52) for city-scale spans. Hovering a list item lifts its pin; clicking a stop pin flies the camera to it and opens a place card ("Stop N of M", Directions, Edit stop, previous / next stepping that flies the camera).
- **Index:** hero + ambient globe (no basemap labels, CSS limb shade, faces the next trip at rest) with one chip per trip. With three or fewer trips the cards sit in one row with no headings; from four they are bucketed Happening now / Upcoming / Past. Search `/`, new trip `n`. Card covers are real map stills rendered by one off-screen MapLibre map (`renderStills` in `map/engine.ts`); the SVG chart of the trip's stops (`components/TripCover.tsx`) is the loading / no-WebGL fallback. No stock imagery. **Never "Inbox".**
- **Create:** destinations with city autocomplete, a custom date-range calendar (`components/DateRange.tsx`, also used in Trip details; no native date inputs), optional name, "Draft the itinerary with AI" switch with a pace / interest brief, sticky submit row, no step circles. The map flies to each destination; on phones it is a small non-interactive strip under the title.
- **Workspace:** `TripWorkspace` renders `/trips/:tripId` (overview) and `/trips/:tripId/day/:dayId` (that day): itinerary pane + sticky map. The full trip header shows on the overview only; day pages use a compact one-row header (trip name links to the overview, Share, ⋯ with "Improve whole trip with AI"). Left / right arrow keys change day. Phones get a docked bottom bar with an Itinerary | Map switch (`radiogroup`) and the concierge button inside it.
- **Editing:** inline trip / day titles. Stop cards have a time column on the left (above the title on phones); the drag grip (Motion `Reorder`) shows on hover / focus and is hidden on phones; Alt+↑ / ↓ reorders with a live announcement, and the item editor keeps Move up / Move down. The day menu offers "Sort stops by time" when times are out of order. Stop times use a typed `TimeField` (`parseClock` in `meta.ts`) with "Add end time". One "Add a place, note or booking…" composer per day with keyless place search (picking a result pins it on the map immediately); per-item editor (time, location search / pin, notes, status, booking type + confirmation, move to day, duplicate, delete with Undo toast); autosave with a Saved / Saving / Retry indicator; trip details dialog (name, destinations, dates, colour accent, description, status, time zone); duplicate trip, delete trip (owner), clear day.
- **Icons:** sparkle = AI generation, lightbulb = "Ideas for this day", chat glyph = concierge.
- **Instagram import:** "Places from Instagram" sheet. Paste a post or Reel link (pasting is the whole gesture; the day composer recognises links too). Posts are read quickly first (caption + comments) and re-read with the video on their own if that finds nothing; a hairline progress bar and plain step labels show the read. Each place found gets a row (name, address, the line from the post) and a pin on the sheet's own map; "+ Day N" adds it to the day in view or the nearest day, "Add all" adds a post's places at once; untimed imports land under a "To schedule" heading and stay off the route and numbering; and places already on the trip show "On day N". Everything found is kept under Saved for every trip (search, remove). Never show pipeline logs or raw errors.
- **Sharing:** link-first. Owner picks "Can view" / "Can edit" and copies an invite link; anyone signed in who opens `/trips/join/:token` joins with that role. Owner changes roles, removes people, turns links off; collaborators can leave.
- **Concierge:** a chat that acts on the trip. Answers lead with the pick; a live status line shows real tool activity ("Checking Google Maps", "Searching the web"); place cards carry a photo, rating, hours for that day, the walk from the plan and "Add to Sat 14 Nov · 13:00"; changes arrive as one proposal card the traveller ticks, applies and can undo; 2 to 3 follow-up chips after each answer; the conversation is kept per trip (`trips-concierge-v1:<tripId>`) with New chat; location is shared for one message only, on request.
- **AI:** full-trip draft (`/generate`; from create, the empty overview, or "Start a fresh draft" with a replace confirmation), per-day "Ideas for this day" and whole-trip "Improve with AI" (`/enhance`; added places are auto-applied, flashed in the list and dropped onto the map; other suggestions are reviewed from a checklist, including moving a stop to another day and swapping two days), concierge chat FAB (`TripChat`, `chat.stylex.ts`). When a hotel is added or changed, the workspace offers "Staying at X. Rework the plan around it?" (never automatic); yes runs a whole-trip review briefed on the new base. A draft that could not fill every day says which days need another go.
- **Type:** Instrument Serif display (`--trips-display`, italic for the emphasised word), Inter body, Fragment Mono eyebrows / data (`--trips-mono`).
- **Accent (two, never mixed):** the **brand** accent is constant signal orange (`--brand` text, `--brand-fill`, `--brand-soft`, `--brand-ring`) and paints chrome: focus rings, AI actions, switches, links, the compass mark. The **trip** accent (`--ta`, `--ta-fill`, `--ta-on`, `--ta-soft`, `--ta-ring`; set by `data-trip-accent`, defaults to the brand) is reserved for trip identity: pins, route, date tiles, the status eyebrow, the pinned-location row, covers. Trip accents: rose "Poppy" `#e5484d`, amber "Saffron" `#f2a71b` (dark ink on fill), emerald "Jade" `#0f9b76`, sky "Cobalt" `#2f7bf0`, violet "Iris" `#7c5cff`. Primary buttons are ink.
- **Code:** `atlas.stylex.ts` (primitives `a`), `index.stylex.ts` (`shell`, `idx`, `cover`, `create`), `workspace.stylex.ts` (`share`, `ws`), `map/map.stylex.ts`, `chat.stylex.ts`, `components/kit.tsx` (`Menu`, `Modal`), `meta.ts`, `useTripEditor.ts`.
- **Motion:** spring on pins / buttons, fly-to camera, drop-in for new pins, staggered card rise. Reduced motion: map uses `jumpTo`, globe does not spin.
- **Anti-references:** the previous toy / sticker look, glassmorphism stacks, gradient text, stock travel photography, generic SaaS dashboards. Do not restyle Trips into the Korea dossier.

### Per-route Tokens

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| Canvas | `#f1f0eb` | `#0b0d10` | Page |
| Surface | `#faf9f6` | `#13161a` | Panes, cards |
| Raised | `#ffffff` | `#1a1e23` | Menus, dialogs, fields |
| Sunken | `#e8e7e1` | `#07090b` | Wells, rails |
| Ink | `#14171a` | `#eceae4` | Text, primary buttons |
| Ink secondary / tertiary | `#4d5259` / `#696e75` | `#b0b4ba` / `#8b9097` | Body / hints |
| Line | `rgb(20 23 26 / .1)` | `rgb(255 255 255 / .1)` | Hairline rules |
| Brand accent | `#f0582b` fill, `#b8400f` text | `#f0582b` fill, `#ff9166` text | `--brand-fill` / `--brand`: chrome. `--ta*` defaults to it |

Radius `0.875rem` (`-sm` `0.625rem`, `-lg` `1.375rem`); shadows `--trips-shadow-1/2/3`; spring `cubic-bezier(0.34, 1.4, 0.64, 1)`; ease-out `cubic-bezier(0.16, 1, 0.3, 1)`.

### Trips-specific Principles

1. **One map per viewport.** Keep the engine a lazy chunk (`maplibre`).
2. **AI-added places must carry structured locations**, never prose only.
3. **Never add destination-specific routes.**
4. **44px targets; draw your own focus ring.** Trips sets `.trips :focus-visible { outline: none }`, so every new control needs a `--brand-ring` ring (`a.focusable`).
5. **Editable titles** use the `trips-title-input` / `trips-day-title-input` classes to opt out of the 16px phone input pin.
6. **Portals** go through `kit.tsx` `Modal`, which re-declares the token scope (`.trips.trips-portal`).
7. **The photoreal 3D view must unmount** when closed (never React `Activity`).
8. **Brand for chrome, trip accent for identity.** Never tint focus rings, AI actions, switches or links with `--ta*`.
9. **One state, one owner.** The workspace remounts per trip (`key={tripId}`); day-scoped overlays reset when the day changes; async results (AI runs, chat writes, duplicates) are dropped once their trip or component is gone; editing is locked while an AI run is in flight; concierge writes to the itinerary are serialised. Model a mode as one union (`status`, `mutation`, `action`), not several booleans.
