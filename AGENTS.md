# anthonyl.im

This repo hosts five experiences under one Vite SPA: a personal AI chatbot at the root (`/`; `/chatbot` redirects), the anthonyl.im lab landing page (`/lab`), **BreathFlow**, the **Korea** itinerary, and a generic **trip planner**. Each has its own visual identity; all share the craft principles below.

**Where to read what**

| Need | File |
|------|------|
| Engineering, routes, env, CI, tree | [`CLAUDE.md`](CLAUDE.md) |
| Design context for UI work | [`PRODUCT.md`](PRODUCT.md) |
| Skill catalog (what to use, what to ignore) | [`.agents/skills/README.md`](.agents/skills/README.md) |
| CI/CD | [`docs/ci-cd.md`](docs/ci-cd.md) |
| PR previews + Clerk screenshot login | [`docs/pr-previews.md`](docs/pr-previews.md) |

## Shared Design Principles (apply to every route)

1. **Craft over convention.** Prefer custom, considered solutions over generic component-library defaults. Spacing, typography weight contrast, surface hierarchy, and motion should feel intentionally designed, not assembled.
2. **Motion with purpose.** Every animation should serve comprehension (orient, reveal, guide) or affect (calm, anticipation, delight). Decorative-only motion is rejected. Spring physics over linear tweens; respect `prefers-reduced-motion` everywhere.
3. **Depth through restraint.** No more than one vivid moment per viewport. Use neutral mass to make accents punch. Avoid glassmorphism stacking, gradient text on headings, and generic SaaS gradients.
4. **Typography as the design language.** Cormorant Garamond for display moments, Inter for body. Weight + size + tracking carry the hierarchy — let the type breathe.
5. **One accent, many neutrals.** Each app gets a single signature accent; the rest of the palette stays disciplined.

## Shared Accessibility Standards

- **Target:** WCAG AA (4.5:1 contrast, keyboard navigation, screen-reader support)
- **Reduced motion:** All transforms / pulses / orbital rotations must honor `prefers-reduced-motion`
- **Touch targets:** Minimum 44 × 44 px for all interactive elements
- **Focus indicators:** Visible focus rings on every interactive element (route-specific accent color)
- **ARIA:** Live regions, proper roles, and explicit labels on every dynamic surface (breathing orb, Map Mode bubbles, status banners)
- **i18n:** No layouts that break on long Korean / hangul strings; copy uses `break-words` + `overflow-wrap:anywhere` defensively

## Shared Tech Stack

- React 19 + Vite 8 + React Router v7 (`react-router-dom`, Vite SPA — not the React Router SSR framework)
- TypeScript: frontend lint `~6.0`, frontend/root **build** `~7.0` via the `typescript7` alias
- StyleX 0.19 (`@stylexjs/stylex`) + semantic classes in `index.css` + shadcn/ui (Radix primitives)
- Zustand v5 (BreathFlow persisted stores), Motion 13, Lucide icons
- Effect v3 for frontend I/O — see [Frontend Effect-TS](#frontend-effect-ts)
- Bun + Hono (server), Clerk (`@clerk/clerk-react` ^5, Core 2), Supabase, PostHog
- MapLibre GL JS v6 + OpenFreeMap vector tiles for Trips maps (no API key)
- Gemini 4 Hydrogen (`GEMINI_MODEL`) leads on every AI surface: trip drafts and reviews, the concierge, Instagram extraction and transcription, entity blurbs and the homepage chatbot. Backups are Gemini 3.8 Flash (when the key cannot use Hydrogen), `gpt-oss-120b` on Groq (Cerebras behind it) and Whisper on Groq. Maps and Search grounding cannot share a request on these models.
- Three.js (WebGL) for the photoreal 3D view, "Fly the day" (`pages/Trips/photoreal/`)

## Frontend Effect-TS

Write new frontend network I/O in Effect. Full methodology: [`.agents/skills/effect-ts/SKILL.md`](.agents/skills/effect-ts/SKILL.md) (symlinked at `.claude/skills/effect-ts/SKILL.md`). Stable **Effect v3** only — not v4 beta.

| Piece | Location |
|-------|----------|
| Tagged errors (`errorMessage`) | `frontend/src/effect/errors.ts` |
| HTTP (`fetchApi`, `fetchExternal`, `requestJson`, `readAuthToken`, `bearerHeaders`, `sleep`) | `frontend/src/effect/http.ts` |
| SSE | `frontend/src/effect/sse.ts` |
| `runPromise` unwrap | `frontend/src/effect/runtime.ts` |
| Chat error remap | `frontend/src/effect/chatErrors.ts` |
| Stable token reader | `frontend/src/hooks/useLatestCallback.ts` |

**Do:** `Effect.fn` + `runPromise` from `frontend/src/effect/runtime.ts`; same-origin `/api/*` via `fetchApi` / `requestJson`; third-party URLs via `fetchExternal`; `Schema.TaggedError` + `readErrorMessage` modes; `useLatestCallback(getToken)` (never pass `useEffectEvent` as an argument); `useTransition` + latest-request-wins on overlapping refreshes; `Effect.fail` instead of `throw` around `yield*`.

**Do not:** replace `apiFetch` with `@effect/platform` FetchHttpClient; `Schema.decode` `Trip` / `ExtractedPlace` documents; add `Effect.Service` / AppLayer / effect-atom without real injectable deps; hide Map Mode WebGL with React `Activity`; migrate BreathFlow Zustand or `useCloudSync` onto Effect.

Per-route clients: `frontend/src/pages/Trips/tripsApi.ts`, `tripChatApi.ts`, `frontend/src/pages/Korea/*Api.ts`, `frontend/src/lib/apiService.ts` (homepage chatbot).

## Frontend StyleX

All UI styling is StyleX + semantic CSS classes — Tailwind is removed. Skill: [`.agents/skills/stylex/SKILL.md`](.agents/skills/stylex/SKILL.md) (symlinked at `.claude/skills/stylex/SKILL.md`).

| Piece | Location |
|-------|----------|
| Merge helper | `frontend/src/styles/merge.ts` — `sx(...)` |
| Shared layout | `frontend/src/styles/common.stylex.ts` — `layout.srOnly`, etc. |
| Route modules | `*.stylex.ts` (Trips `atlas.stylex.ts` + `index.stylex.ts` + `workspace.stylex.ts` + `chat.stylex.ts`, BreathFlow, Korea, chatbot) |
| Tokens + semantic classes | `frontend/src/index.css` (`@layer reset` Preflight, route token blocks, Trips `.atlas-pin*`, animations, photoreal `.photoreal-pin*`) |
| Vite plugin | `frontend/vite.config.ts` — `useCSSLayers` |

**Do:** `{...sx(a.fieldBare, 'trips-title-input')}` when a rule lives in `index.css` as a semantic class; `borderWidth` + `borderStyle` with `borderColor`; `layout.srOnly` for hidden labels; child-combinator spacing as `index.css` utilities; `:is(.group:hover) &` + `'group'` instead of `group-hover:*`.

**Do not:** reintroduce Tailwind; import plain token maps into `stylex.create()`; set only `borderColor` after Preflight; rely on StyleX `@layer` rules when unlayered CSS sets the same property (e.g. leaves overlay opacity).

**Trips parity (required):** local dev with matching `VITE_DEV_BEARER` + `IG_DEV_BEARER`; `cd frontend && bun run e2e -- e2e/smoke.spec.ts -g "trips skips"`. PR previews: `bun scripts/clerk-agent-login.ts` — never bake dev bearer into previews.

## Shared Tokens

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| Canvas | `#F5F2ED` | `#171613` | Page background |
| Surface | `#FFFEFA` | `hsl(40 6% 11%)` | Cards, panels |
| Ink Primary | `#1C1917` | `#E7E3DE` | Body text |
| Ink Secondary | `#78716C` | `#A8A29E` | Secondary text |
| Ink Tertiary | `#A8A29E` | `#78716C` | Hint / muted text |
| Destructive | `#EF4444` | `#EF4444` | Errors, delete |
| Border | `rgba(28,25,23,0.08)` | `rgba(255,252,245,0.06)` | Subtle edges |
| Body font | Inter (BreathFlow: Geist) | | Shared-site body; BreathFlow uses Geist |
| Display font | Cormorant Garamond (BreathFlow: Fraunces) | | Shared-site display; BreathFlow uses Fraunces |
| Border radius | `0.5rem` (default) / `1rem`+ in Korea orb cards | | Standard rounding |
| Spring easing | `cubic-bezier(0.16, 1, 0.3, 1)` | | Motion default |
| Decel easing | `cubic-bezier(0.33, 0, 0, 1)` | | Smooth stops |

Each app's *accent* color is its own (see per-app sections below).

---

## Design Context: `/` — anthonyl.im Lab Landing

Code: `frontend/src/pages/Landing/` (`Landing.tsx`, `parts.tsx`, `content.ts`, `landing.stylex.ts`, `HeroCanvas.tsx`, `scene/`). A fictional AI lab ("design study", disclosed in the footer). All copy and mock data live in `content.ts`. Product cards link to the real apps: Lim → `/`, Concierge → `/trips`, BreathFlow → `/breathwork`.

- **Palette:** bone `#EDE8DF` canvas, ink `#0E1024`, one ultramarine accent `#2433E0`. Tokens are `--lim-*` vars on `.landing` in `index.css`. Display type is Archivo (wdth axis), with Fragment Mono for data.
- **Hero:** WebGPU (WebGL2 fallback) soft-body glass droplet (`scene/heroScene.ts`). It's a three-blocks `MeshTransmissionNodeMaterial` with spring physics (drag, poke, stretch). Normals come from a procedurally hand-painted brush field (`scene/painter.ts`), which also serves as the static still and fallback. TSL post: bloom, scroll-driven ink dissolve, three-blocks `filmHD`. The scene runs only while on screen; reduced motion freezes the clock.
- **License:** `three-blocks` is PolyForm Noncommercial 1.0.0. The footer carries the Required Notice — keep it. Commercial use needs a three-blocks license.
- **Chunks:** the hero loads `three-core` + `three-webgpu` only; Map Mode loads `three-core` + `three`.

## Design Context: `/` — Lim, the jelly companion

Code: `frontend/src/App.tsx` (page shell), `frontend/src/chat/` (`useChat.ts` state + persistence, `LimStage.tsx` lazy 3D stage, `LimArt.tsx` SVG Lim, `caret.ts`, `eggs.ts` typed easter eggs, `world/` items and places (spec, catalog, client API), `sound.ts` WebAudio foley, `chat.css` tokens + code theme, `scene/limScene.ts` behaviour, `scene/limLook.ts` palette + expressions + TSL materials, `scene/fx.ts` particle pools + the tuft, `scene/items.ts` item meshes, `scene/env.ts` places and weather), `frontend/src/styles/chatbot.stylex.ts`, `messageContent.stylex.ts`, `components/message-content.tsx`.

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
- **Lim's world (items and places):** a visitor can give Lim things and send it places, from the toy box (the brick button in the composer) or by asking in chat. Code: `chat/world/spec.ts` (specs, cleaners for untrusted JSON, the catalog, the model-free matcher), `chat/world/worldApi.ts` (reading the model's orders out of the stream + persistence), `scene/items.ts` (procedural meshes), `scene/env.ts` (sky backdrop, weather), `server/src/lim/world.ts` (the model's instructions) and `server/src/lim/model.ts`.
  - **One spec format.** An item is 1 to 6 primitive parts (ball, box, cylinder, cone, disc, drop, star, heart, bean, ring) plus traits; a place is a palette, horizon, sun / moon / planet, stars, weather, gravity, grip and a mood; a tweak changes the air (weather, gravity, grip, light) without going anywhere. Catalog entries (20 items, 8 places) and things the model invents are the same data, drawn by the same gel shader and ink outline. Add catalog entries in `spec.ts` and mirror the id in `server/src/lim/world.ts` (`server/src/lim/world.test.ts` checks parity).
  - **Who decides: the chat model.** There is no separate intent call. When the 3D scene is up, the page sends the world (item names, place, weather) with every question to `POST /api/invoke`, whose system prompt gains `worldPrompt()` (`server/src/lim/world.ts`). The model answers normally, or, if and only if the message is an order for the toy world, with one line: `@@world {"ops":[...],"reply":"..."}`. `useChat` watches the stream for that marker, never shows it, and hands the finished line to `onWorld` (`App.tsx`), which cleans and applies the ops and shows Lim's line instead. So a real question is never delayed or misread by a pattern list, and loosely phrased orders ("I want a dragon", "kick it") work. In front of the model sits one shortcut, `localIntent` in `spec.ts`: an order whose whole text parses and names something Lim already knows (catalog, made earlier, or in the world) is acted out at once with no model call. It must stay strict: `chat/__tests__/world.test.ts` holds some 220 strings it may never act on. After editing `worldPrompt()` or changing the model, run `bun scripts/eval-lim-world.ts [model]` (real API, not CI): 127 cases judged through the page's own reader and cleaners: chat messages that must be answered in prose, orders that must come back as `@@world` with the right op, held-out sets of each that appear nowhere in the prompt, a conversation with earlier orders in it, and a page with no 3D scene. It costs real tokens (Carbon is the expensive one). Last full run: Hydrogen 125/127, before the "Make it …" sentence was added to the prompt; Carbon has only run an earlier 80-case version (80/80). Re-run both before relying on a prompt change. World orders go back to the model as history in their `@@world` form (`ChatMessage.sent`), and toy-box replies the model never wrote are left out. Without a live 3D scene the page sends `world.unavailable` and the model is told the toy box is down. Both the chat and the orders run on Gemini (`server/src/lim/model.ts`: Gemini 4 Carbon through December 1, 2026, Gemini 4 Hydrogen after; `LIM_GEMINI_MODEL` pins one), with Groq as the backup. Carbon takes 5 to 15 s to write an invention, so that wait is a performance: `scene.conjure(true)` gathers a ring of sparkles over a muttering Lim and the reply cycles progress lines (`MAKING` in `App.tsx`); a failed order fizzles and Lim says so. With motion reduced, items simply appear and actions apply their outcome only.
  - **Never trust a spec.** Everything from the model or from localStorage passes `cleanItem` / `cleanPlace` / `cleanTweak` / `cleanOps`: enums checked, numbers clamped, part and op counts bounded, names stripped to plain words, colours pulled into the palette, item size normalised. Nothing from the model is used before it is cleaned.
  - **What Lim does with things.** Every item: look, kick, hug, put away. By trait: bouncy / floaty → keepy-uppy; edible → eat (hot and cold have their own reactions); hat / glasses → wear (sprung to the head, third poke knocks them off); soft / cozy → nap; musical → dance; scary → flee; prickly → ouch. Lim also plays with items unprompted and reacts to the place's mood. Six items at most; the oldest makes way.
  - The world (items, place, tweak) persists in `localStorage` under `lim-world-v1`; things the model made are kept under `lim-made-v1` and listed in the toy box so they can be had again for free.
- **Sound:** off by default; the header speaker button (or `M`) turns on synthesised foley (`sound.ts`: boings, squeaks, gulp, babble, a dance beat). No audio files. Lim's voice pitch follows its size.
- **Layout:** desktop stage left, chat panel right; mobile stage on top (compact once chatting, so Lim stays visible while typing).
- **Accent:** Lim coral `#FF7E6B` (send button, Lim's name, list markers). Plum ink `#2B2140` carries the text.
- **Type:** Fredoka display (headings, chips, captions), Inter body.
- **Anti-references:** no purple "AI" gradients, no glowing borders, no rainbow typing indicators. Do not reuse the landing's ultramarine, BreathFlow's watercolour or the Trips atlas.

### Per-route Tokens
- Theme classes: `chatbot-shadow` (day) / `chatbot-dark` (night), both defined in `frontend/src/chat/chat.css` (`--chat-*` vars), not `index.css`
- `html:has(.chatbot-*)` paints the canvas so iOS safe areas blend
- The 3D scene is lazy (`import('./scene/limScene')`); `LimArt` SVG is the first paint and the no-WebGPU/WebGL fallback
- Reduced motion freezes the jiggle and renders on demand; CSS beats are paused; stunts and easter eggs become a still smile
- Settled toys sleep (no sim, no geometry sync) until something touches them; `Jelly.step` allocates nothing
- Eyes counter-turn toward the camera as the head turns (the iris never slides off round the side) and tuck away when facing backwards
- A dev build exposes the scene as `window.__lim` (`__lim.stunt('flip')`) and calls `window.__limFrame` after each render, for driving and filming beats
- Chat history persists in `localStorage` under `lim-chat-v1`; night mode under `lim-chat-night`; sound under `lim-chat-sound`
- I/O stays `invokeDeepseek` (Effect SSE) in `lib/apiService.ts`; the optional `signal` param powers Stop (Esc)

---

## Design Context: `/breathwork/*` — BreathFlow ("Watercolor breath")

Code: `frontend/src/breathflow/`. Session state is `useSessionEngine` (React state, not Zustand). The centrepiece is a WebGPU soft-body watercolour **cat**: `scene/catScene.ts` (three/webgpu + TSL, lazy-imported by `scene/BloomCanvas.tsx` so three stays out of the initial chunk), positioned by `scene/BloomAnchor.tsx` (painted CSS fallback + brush progress stroke) and driven by `scene/breathDrive.ts` (`useBreathReader` interpolates the 1 Hz engine tick into a smooth amplitude). Built on the shared toolkit in `frontend/src/three/` (`createStage`, `Jelly`, `bindJellyPointer`). `syncJellyGeometry` computes normals + bounding sphere straight on the typed arrays (three's `computeVertexNormals` was half the frame), and `createStage` starts phones at DPR ≤ 1.5 and runs a frame-rate governor that steps the pixel ratio down 15% when the median frame falls behind the display's own rate (60, 120 Hz alike). Pigments live in `pigments.ts`; paper/wash/brush CSS + SVG filters in `styles/watercolor.css` + `components/WatercolorDefs.tsx`. Fonts: Fraunces display (`.bf-display`, SOFT/WONK axes) + Geist body.

### Users
Wellness enthusiasts and people seeking anxiety / stress relief. They open BreathFlow when they need to decompress, build a daily breathing habit, or access structured breathwork techniques backed by science. The context is often evening wind-down, pre-performance calm, or mid-day stress breaks — moments that demand a UI that feels immediately calming upon launch.

### Brand Personality
**Calm, Scientific, Hand-made.** A precision instrument painted by hand: evidence-based protocols, delivered as a living watercolour. Gamification (XP, levels, wax-seal badges) exists to sustain habit, not to entertain.

**Emotional goals:** Immediate calm (wet paint spreading slowly on paper) and quiet confidence (the bloom fills exactly as long as the breath).

### Aesthetic Direction
- **World:** a hand-painted watercolour on warm cotton cold-press paper (`#F7F1E6`); dark mode is deep ink-blue paper (`#15161C`). A fixed `.bf-paper` tooth overlay multiplies over everything.
- **Cat:** a pen-and-wash cat painted in the technique's pigments. Body and head are `Jelly` soft bodies (the head rides a neck point on the body); ears, paws and a swept-tube tail follow them via `attach`; the face (amber eyes with slit pupils, nose, ω mouth, whiskers, blush) is painted in rest space. It acts out the breath: inhale swells the chest, lifts the head, perks the ears and widens the eyes; a full hold puffs the cheeks and goes still apart from a shiver; the exhale is a "haa" sigh with soft eyes and dropped ears; an empty hold is a contented squint. Idle: blinks, ear twitches, tail swish. One shared light model drives every part: a warm key from the upper left (ragged shadow edge, core shadow, pooling at the turn), a Blinn glint that leaves the paper bare, warm floor bounce in the shadows, and a cool moonlight rim from behind. Day paints it as a Beer–Lambert glaze over the paper; night lays an opaque moonlit body colour over the ink-blue paper with moon-white glints and a dark ink hull (never bare paper, which is dark at night). **High tier** (WebGPU, unless the stage reports it struggling at the lowest pixel ratio; `?quality=base|high` forces a tier): GTAO contact occlusion pooled as pigment where parts meet, a soft bloom on moonlight at night, and pen hatching through the cat's shadow side. **Easter egg:** five taps within 2.5 s pop it (paint splash) into a glossy pink puffball homage (Kirby's face: tall navy eyes fading to blue under a big glint, rosy oval cheeks, a tiny mouth; squeezed "> <" eyes on the inhale and when held; painted over clean paper so the blooms don't show through) that puffs up hugely on the inhale with an open "O", floats with flapping arms on a full hold, and blows air clouds on the exhale; five more taps bring the cat back (the form survives Home → Session). The paper sheet keeps wet-in-wet blooms, a splatter ring that flies out on each inhale, and a shadow wash under the cat. Noise and splatter are baked once in `scene/paintTextures.ts`. Post: paper tooth, colour bleed, vignette, static Three.js Blocks `filmHD` grain (credited on Settings). The session count sits beside the phase word so it never covers the face.
- **Interaction:** poke (a giggle) + drag the cat on Home and session setup, by mouse or touch (a finger on the cat drags it; elsewhere the page scrolls). Grabbed, a body goes loose and stays upright, stretching toward the finger (the cat goes wide-eyed, the puffball squeals and flaps); let go, it boings home, wobbles and squashes on the paper. The contact shadow follows and fades as it lifts. During a session, a gentle poke only. Taps count toward the puffball easter egg everywhere. Space toggles pause/resume.
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

## Design Context: `/trips/korea-2026` — Korea Trip Itinerary

The Korea trip is the seeded trip `korea-2026` (rose accent). It renders in the atlas workspace like any other trip; there is no separate rose / amber parchment dossier any more. Page design: the "Design Context: `/trips/*`" section below. Legacy `/korea*` frontend routes redirect here. `/api/korea/*` remains. Do not add new destination-specific routes.

What stays Korea-specific is data (snapshot seed, `/api/korea/chat` concierge fallback) and the Korea-scoped PWA.

### Users
Anthony (primary) and his partner, planning and executing a 12-day Seoul + Busan trip in late May / early June 2026. Phones for in-trip lookups, desktop for planning.

### Korea-specific Principles

1. **Smart links everywhere.** Flight numbers → carrier tracker, KTX → Korail timetable, addresses → Google Maps, phones → `tel:`, times → AM/PM tooltip. Free-form copy gets auto-linked by the `LinkifiedText` engine.
2. **PWA auto-update is mandatory.** Service worker + client must auto-swap to the latest version after each deploy. Bump `CACHE_VERSION` on every breaking SW change.

## Design Context: photoreal 3D view — "Fly the day"

Code: `frontend/src/pages/Trips/photoreal/`. Any trip day opens it from its "⋯" menu ("Fly the day in 3D"). The day's located stops stand on Google Photorealistic 3D Tiles; chrome is atlas paper plates (opaque `--trips-*` surfaces, no glass stacks).

- **Files:** `PhotorealOverlay.tsx` (chrome + state, `role="dialog"` with focus trap), `photoreal.stylex.ts`, `scene.ts` (engine), `tilesGround.ts` (Google tiles) / `devGround.ts` (DEV-only procedural model city, dynamic import), `camera.ts` + `sun.ts` + `stops.ts` (pure, tested), `terrainAnchor.ts`, `adaptiveQuality.ts`, `deviceTier.ts`, `youPin.ts`, `available.ts` (`photorealAvailable()`; the only file outside the `photoreal` chunk).
- **Stops:** the day map's `.atlas-pin` stop pins as DOM buttons (`.photoreal-pin*` in `index.css`), projected from terrain-snapped points, each with a 3D stem and ground ring. Crowded or occluded pins shrink to dots. Numbering comes from `dayStops` and matches `dayPins`.
- **Route:** one shallow 3D arc per leg in the trip accent on a paper casing; the selected stop's legs are emphasised.
- **Camera:** arrival fly-in once tiles exist (or after 2.5 s), fly-to on select (tilt 54°, 250–450 m), a slow idle orbit that any input stops, time-based tweens. Chrome insets shift the optical centre (`setInsets`). Reduced motion: jump cuts with a short canvas dip, no orbit, no tour.
- **Chrome:** desktop is a left panel (title, Play tour, stop list with legs; the selected stop unfolds into the card); phones get a title plate, a numbered rail and a swipeable bottom card. Top-right: compass, tilt, locate, fit all. Keys: ← / → step, Home / End, Space tour, F fit all, Esc close.
- **You:** no location prompt on open. Shown (brand-accent glass droplet) only when permission is already granted or the traveller taps locate, and only within 50 km of the stops.
- **Light:** sun from the trip's time zone, the day's date and the anchor latitude (the selected stop's time when it has one). Tiles stay unlit (pre-lit photogrammetry); the dark theme tints them to dusk. No bloom, god rays or clouds.
- **Rules:** renders on demand (no rAF at rest); disposes with `forceContextLoss()`; **must unmount** when closed (never React `Activity`); Google attribution stays visible; failure (no WebGL, tiles refused) shows a calm card with the stop list and Directions links.

---

## Design Context: `/trips/*` — Generic Trip Planner

Clerk-gated planner. Korea is the seeded trip at `/trips/korea-2026` (`/korea` redirects). Every new destination is a trip document, not a new route tree. Chatbot, BreathFlow, and the Korea seed keep their own visual worlds; do not restyle them as Trips.

Canonical visual spec: [`DESIGN.md`](DESIGN.md). Token source of truth: `frontend/src/index.css` `.trips`. Shared-site Cormorant / parchment does **not** apply on `/trips`.

### Users
The same travelers as Korea, plus future trips and the people they share a link with. Phone for in-trip lookups; desktop for planning, AI drafts, and concierge chat.

### Brand Personality
**"The atlas": a cartographer's desk.** Map-first planner. Cool chart-paper surfaces, hairline rules, soft layered shadows, serif names set like map labels, coordinates and data in mono, and one live 3D map per page. Two accents: a constant brand accent (signal orange, `--brand*`) for chrome, and the trip's own accent (`--ta*`) for trip identity; everything else is ink and paper. Precise and quiet. Not a hand-bound Korea dossier. Not Linear, Notion, or Airbnb.

**Emotional goal:** See the trip as a place first, then know what happens next.

### Aesthetic Direction
- **Material:** paper surfaces (`--trips-canvas` / `-surface` / `-raised` / `-sunken`), 1px `--trips-line` rules, soft layered `--trips-shadow-1/2/3`. No stickers, no hard offset shadows, no pastel fills.
- **Map:** MapLibre GL JS v6 + OpenFreeMap vector tiles (no API key). Custom two-palette basemap (`map/mapStyle.ts`): globe projection with atmosphere at low zoom, extruded 3D buildings from zoom ~13.2. One map per viewport; the engine (`map/engine.ts`) is a lazy chunk.
- **Pins and route:** pins are DOM buttons styled by `.atlas-pin*` in `index.css`. Overview map: one numbered pin per day at that day's centroid (click opens the day) over small dots for every stop, no routes. Day map: numbered stop pins plus the route, one shallow arc per leg (deduplicated), a solid 3px trip-accent line on a paper casing with small direction chevrons. Index globe: trip chips, which flip side past the globe's midline. Arrival frames tilt (pitch 52) for city-scale spans. Hovering a list item lifts its pin; clicking a stop pin flies the camera to it and opens a place card ("Stop N of M", Directions, Edit stop, previous / next stepping that flies the camera).
- **Type:** Instrument Serif display (`--trips-display`; italic for the emphasised word, e.g. "Where to *next?*"); Fragment Mono for eyebrows and data (`--trips-mono`); Inter body. No Cormorant on `/trips`.
- **Accent (two, never mixed):** the **brand** accent is constant signal orange (`--brand` text, `--brand-fill`, `--brand-soft`, `--brand-ring`) and paints chrome: focus rings, AI actions, switches, links, the compass mark. The **trip** accent (`--ta`, `--ta-fill`, `--ta-on`, `--ta-soft`, `--ta-ring`; set by `data-trip-accent`, defaults to the brand) is reserved for trip identity: pins, route, date tiles, the status eyebrow, the pinned-location row, covers. Trip accents: rose "Poppy" `#e5484d`, amber "Saffron" `#f2a71b` (dark ink on fill), emerald "Jade" `#0f9b76`, sky "Cobalt" `#2f7bf0`, violet "Iris" `#7c5cff`. Primary buttons are ink.
- **Index:** hero + ambient globe (no basemap labels, CSS limb shade, faces the next trip at rest) with one chip per trip. With three or fewer trips the cards sit in one row with no headings; from four they are bucketed Happening now / Upcoming / Past. Search `/`, new trip `n`. Card covers are real map stills rendered by one off-screen MapLibre map (`renderStills` in `map/engine.ts`); the SVG chart of the trip's stops (`components/TripCover.tsx`) is the loading / no-WebGL fallback. No stock imagery. **Never "Inbox".**
- **Create:** destinations with city autocomplete, a custom date-range calendar (`components/DateRange.tsx`, also used in Trip details; no native date inputs), optional name, "Draft the itinerary with AI" switch with a pace / interest brief, sticky submit row, no step circles. The map flies to each destination; on phones it is a small non-interactive strip under the title.
- **Workspace:** `TripWorkspace` renders `/trips/:tripId` (overview) and `/trips/:tripId/day/:dayId` (that day): itinerary pane + sticky map. The full trip header shows on the overview only; day pages use a compact one-row header (trip name links to the overview, Share, ⋯ with "Improve whole trip with AI"). Left / right arrow keys change day. Phones get a docked bottom bar with an Itinerary | Map switch (`radiogroup`) and the concierge button inside it.
- **Editing:** inline trip / day titles. Stop cards have a time column on the left (above the title on phones); the drag grip (Motion `Reorder`) shows on hover / focus and is hidden on phones; Alt+↑ / ↓ reorders with a live announcement, and the item editor keeps Move up / Move down. The day menu offers "Sort stops by time" when times are out of order. Stop times use a typed `TimeField` (`parseClock` in `meta.ts`) with "Add end time". One "Add a place, note or booking…" composer per day with keyless place search (picking a result pins it on the map immediately); per-item editor (time, location search / pin, notes, status, booking type + confirmation, move to day, duplicate, delete with Undo toast); autosave with a Saved / Saving / Retry indicator; trip details dialog (name, destinations, dates, colour accent, description, status, time zone); duplicate trip, delete trip (owner), clear day.
- **Icons:** sparkle = AI generation, lightbulb = "Ideas for this day", chat glyph = concierge.
- **Instagram import:** "Places from Instagram" sheet. Paste a post or Reel link (the day composer recognises links too). A card appears at once and shows plain step labels while the post is read; each place gets a row (name, address, the line from the post) and a pin; "+ Day N", "Add all", "On day N". Untimed imports land under a "To schedule" heading and stay off the route, numbering and distance until given a time. Everything found is kept under Saved for every trip. Never show pipeline logs or raw errors.
- **Concierge:** a chat that acts on the trip (`TripChat`, `ConciergeMessage`, `ConciergePlaceCards`, `ConciergeProposalCard`). Lead with the pick; show real tool activity as a status line; place cards with photo, rating, that day's hours, the walk from the plan and a dated "Add to …" action; changes come as one proposal card the traveller ticks, applies and can undo; 2 to 3 relevant follow-up chips; conversation kept per trip with New chat; location shared for one message only, on request. Never invent bookings, never edit without confirmation.
- **Sharing:** link-first. Owner picks "Can view" / "Can edit" and copies an invite link; anyone signed in who opens `/trips/join/:token` joins with that role. Owner can change roles, remove people, turn a link off. Collaborators can leave.
- **AI:** full-trip draft (create, the empty overview, or "Start a fresh draft" with a replace confirmation); per-day "Ideas for this day" and whole-trip "Improve with AI" with quick-prompt chips or free text. Added places are auto-applied, flashed in the list and dropped onto the map; other suggestions are reviewed from a checklist, including moving a stop to another day and swapping two days. When a hotel is added or changed, the workspace offers "Staying at X. Rework the plan around it?" (never automatic); yes runs a whole-trip review briefed on the new base. A draft that could not fill every day says which days need another go. Concierge chat FAB (`TripChat`).
- **Motion:** spring on pins / buttons, fly-to camera moves, drop-in for newly added pins, staggered card rise. Reduced motion: the map uses `jumpTo` and the globe does not spin.
- **Code:** `pages/Trips/atlas.stylex.ts` (primitives `a`: type, buttons, fields, chips, pills, menu, dialog), `index.stylex.ts` (`shell`, `idx`, `cover`, `create`), `workspace.stylex.ts` (`share`, `ws`), `map/map.stylex.ts`, `chat.stylex.ts`, `components/kit.tsx` (`Menu`, `Modal`), `meta.ts`, `useTripEditor.ts`, `index.css` `.trips` tokens.
- **IA (locked):** `/trips`, `/trips/new`, `/trips/:tripId`, `/trips/:tripId/day/:dayId`, `/trips/join/:token`. `/trips/:tripId/edit` and `/trips/:tripId/places` redirect to the trip. Removed from the UI: Instagram ingest, the extracted-places library, the per-trip places page, the clay globe scenes, the read-only day page.
- **Photoreal 3D ("Fly the day"):** Google 3D Tiles (`pages/Trips/photoreal/`), opened from the day map's "Fly in 3D" button or the day's "…" menu. Numbered pins stand on the terrain with route arcs; places parked under "To schedule" show as small hollow pins that are never routed or toured; anything imported from Instagram carries "From Instagram · Open the post". A missing tile falls back to its coarser parent rather than leaving a hole. **Must unmount** when closed; never hide with React `Activity`. Touch targets 44px.
- **Anti-references:** the previous toy / sticker look, glassmorphism stacks, gradient text, stock travel photography, generic SaaS dashboards.

### Trips-specific Principles

1. **Do not add `/japan`-style destination routes.** Extend `server/src/trips/` + `frontend/src/pages/Trips/`.
2. AI-added places must carry structured `TripLocation` (lat/lng/category/source), never prose only.
3. One map per viewport. Keep the map engine a lazy chunk (`maplibre`).
4. The photoreal 3D view reads the day document directly and **must unmount** when closed.
5. Frontend I/O is Effect v3 (`tripsApi.ts`, `tripChatApi.ts`, `geocode.ts` via `fetchExternal`).
6. Trips disables the global focus outline (`.trips :focus-visible { outline: none }`). Every new control draws its own ring with `--brand-ring` (`a.focusable`).
7. Editable titles use the `trips-title-input` / `trips-day-title-input` classes to opt out of the 16px phone input pin. Portaled UI goes through `kit.tsx` `Modal` (`.trips.trips-portal` token scope).
8. Keep the atlas on `/trips`; do not restyle it into Korea parchment/bloom/Cormorant or Linear/Notion zinc, and do not restyle chatbot or BreathFlow as Trips.

---

## Service Worker / Caching Contract

The installable PWA is Korea-scoped (`korea.webmanifest`, `CACHE_VERSION = korea-offline-v*`). BreathFlow has `site.webmanifest` but SW comments treat Korea as the install target. Every deploy must keep:

- **`/sw.js`** served with `Cache-Control: no-cache, no-store, must-revalidate` + `Service-Worker-Allowed: /`
- **SPA HTML** served with `no-cache, no-store, must-revalidate`
- **`/assets/*`** content-hashed bundles served with `public, max-age=31536000, immutable`
- **`CACHE_VERSION`** MUST be bumped on every SW-behavior change
- Client (`serviceWorker.ts`) posts `SKIP_WAITING` and reloads on `controllerchange`
- Preview paths (`/preview/`) must never be cached as production

`frontend/public/robots.txt` and `sitemap.xml` exist (`Disallow: /preview/`).

---

## Design Audit Status

The March 2025 BreathFlow audit is **historical**. Do not "fix" items that are already closed.

**Resolved:** light + dark tokens; `prefers-reduced-motion` (`useReducedMotion` + CSS); viewport pinch-zoom (`user-scalable=no` removed); `robots.txt`; BreathFlow rebuild in `frontend/src/breathflow/` with ARIA (`LiveAnnouncer`, session regions); cat reduced-motion in `scene/catScene.ts` (orb files were replaced by the watercolour bloom, then the breathing cat).

**Still worth watching:** leftover inline hex in some settings/badge surfaces; 44 px touch targets on compact toggles; token completeness.

Do not search for deleted files (`FluidOrb.tsx`, `BreathingSession.tsx`, `pages/Home.tsx`, `components/breathing/`, `sessionStore`, `KirbyCharacter.tsx`).

---

## Agent skills

Read the matching skill before writing code. Catalog: [`.agents/skills/README.md`](.agents/skills/README.md). Effect I/O rules win when they conflict with generic React fetch/SWR examples.

| Skill | When |
|-------|------|
| [`effect-ts`](.agents/skills/effect-ts/SKILL.md) | Any frontend `/api`, SSE, or third-party HTTP. Required. |
| [`stylex`](.agents/skills/stylex/SKILL.md) | UI styling, layout, tokens, visual parity, `*.stylex.ts`, `index.css` semantic classes. Required for frontend UI. |
| `vercel-react-best-practices` | React 19 render and bundle performance. Translate Next.js examples to Vite/`React.lazy` + Hono. |
| `clerk` + `clerk-react-patterns` | Clerk auth. Core 2 `@clerk/clerk-react`. See [`.agents/memory/clerk.md`](.agents/memory/clerk.md). |
| `clerk-testing` / `clerk-cli` | Tests or dashboard/CLI only |

**Do not apply** Clerk Next.js / React Router SSR / Expo / Vue / mobile / billing / orgs / webhook skills — wrong stack. `design-taste-frontend` is landing-page only (not BreathFlow/Korea/Trips).

Short pointers: [`.agents/memory/effect-ts.md`](.agents/memory/effect-ts.md), [`.agents/memory/stylex.md`](.agents/memory/stylex.md), [`.agents/memory/ci-cd.md`](.agents/memory/ci-cd.md), [`.agents/memory/clerk.md`](.agents/memory/clerk.md).

---

## CI/CD (agent memory)

Canonical reference: [`docs/ci-cd.md`](docs/ci-cd.md).

- PR gate: `.github/workflows/pr.yml` → aggregate check `pr-gate` (branch-protection required context; starts immediately so merge UIs wait). Also runs on `merge_group`.
- PR preview (not a gate): `.github/workflows/preview.yml` → `https://anthonyl.im/preview/pr/<n>/` (frontend + loopback `/api` sidecar, cap 1). **No production `/api` fallback.** Agent guide: [`docs/pr-previews.md`](docs/pr-previews.md).
- Deploy on merge: `.github/workflows/deploy.yml` (atomic `anthonyl.im.next` swap + `/health` smoke).
- Shared setup: `.github/actions/setup-ci` (Bun + `node_modules` caches).
- Lockfiles: text `bun.lock` only; Dependabot uses `package-ecosystem: bun`. Never commit `bun.lockb`.
- Local verify: `bash .codex/check.sh` (or `bash .claude/cloud/verify.sh`) — server tests + frontend typecheck. Full `pr-gate` also runs build + vitest + both cloud-setup invariant scripts.

---

## PR Workflow

### Frontend Screenshot Rule

When creating a pull request that includes frontend changes (any modifications to files in `frontend/src/` that affect UI — components, pages, CSS, layout, styles), you **must** attempt to capture screenshots of the affected pages using the Chrome MCP tools before creating the PR. Include these screenshots in the PR description under a `## Screenshots` section.

**Process:**
1. Prefer the remote PR preview (`https://anthonyl.im/preview/pr/<n>/`). Wait with `bun scripts/wait-for-preview.ts --pr <n> --sha <head-sha>` (see [`docs/pr-previews.md`](docs/pr-previews.md)). No local Vite server required.
2. For Clerk-gated preview routes (`/trips`, `/trips/korea-2026`), run `bun scripts/clerk-agent-login.ts --pr <n> --path /trips/korea-2026` once. The helper applies a screenshot-user session in the agent Chrome (Korea + Trips share cookies). **Do not paste the ticket URL** — that is how sign-in walls happen. The helper re-execs from `origin/main` before sending secrets. Cursor cloud `gh` tokens have no push — `CLERK_SECRET_KEY` is enough (screenshot-user default). Dedicated screenshot identity, not a personal production login — do not sign in to production `/trips` or `/trips/korea-2026`. Public routes only need `?hidePreviewChrome=1`.
3. **Local fallback for Trips:** when preview/Chrome MCP is unavailable, run backend + `cd frontend && bun run dev` with matching `VITE_DEV_BEARER` / `IG_DEV_BEARER` (see `deploy/README.md`). Confirm bypass with `bun run e2e -- e2e/smoke.spec.ts -g "trips skips"`. Note local screenshots in the PR.
4. **Upload screenshots to GitHub** using `gh api` so they get permanent URLs visible in the PR. Local file paths and repo blob URLs do not render in PR descriptions. Use: `gh api --method POST repos/{owner}/{repo}/issues/{pr_number}/comments --field body="![screenshot](url)"` or upload via the GitHub upload endpoint.
5. Add the uploaded screenshot URLs to the PR description body

If the preview is not live yet (serving code not on production, droplet down) **or** Chrome MCP is unavailable, fall back to a local `cd frontend && bun run dev` with `VITE_DEV_BEARER` and note that in the PR. Do not block PR creation on screenshot availability.
