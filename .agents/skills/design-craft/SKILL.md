---
name: design-craft
description: How interfaces are designed in this repo, from first principles. Use before designing, restyling or reviewing any UI, motion, 3D scene, copy or interaction here. Triggers on new screens or components, visual polish, animation, shaders, empty / loading / error states, dark mode, phone layouts and design review.
---

# Design craft (anthonyl.im)

People decide what they think of a screen in about a second, then spend the rest of the visit either confirming it or being surprised. Craft is what survives the second look: how a thing moves when touched, what it does when it fails, whether the tenth detail was cared for like the first.

This is the method. The facts about each app (who it is for, its palette, its type, what it must never look like) are in [`PRODUCT.md`](../../../PRODUCT.md); Trips tokens are in [`DESIGN.md`](../../../DESIGN.md); how styles are written is in [`stylex`](../stylex/SKILL.md). Read the app's section there before you draw anything.

## 1. One living thing, and quiet around it

Every surface in this repo is built the same way: one centrepiece that is alive, and chrome that gets out of its way.

| Surface | The living thing | The quiet |
|---------|------------------|-----------|
| Lim (`/`) | A jelly creature with physics, moods and a world | A calm, readable chat sheet |
| Lab (`/lab`) | A glass droplet you can stretch | Bone paper, one ultramarine, grotesque type |
| BreathFlow | A watercolour cat that breathes with you | Bare cotton paper |
| Trips | One real map of the trip | Chart paper, hairlines, ink buttons |

Start every design by naming the living thing on the screen. If there is none (a settings page, a legal page), typography is the centrepiece and everything else is margin. If there are two, one of them is decoration: remove it or demote it. "No more than one vivid moment per viewport" is this rule seen from the other side.

The centrepiece earns its place by responding. It reacts within a frame of being touched, it reflects the real state of the product (the cat's chest *is* the breath timer; the pins *are* the itinerary), and it would be missed if it were a picture.

## 2. A world is four decisions

Each app is its own world, and worlds do not mix. A world is defined by exactly four things. Settle them before any pixels, and for existing apps look them up rather than inventing:

1. **Material.** What is the screen made of? Cotton paper, chart paper, sorbet plastic, bone card. Material decides texture, how edges look, and how light falls.
2. **Type pair.** One display face with a character, one text face that disappears. Fredoka + Inter, Fraunces + Geist, Instrument Serif + Inter + Fragment Mono, Archivo + Fragment Mono.
3. **One accent.** A single colour that means one thing. Everything else is neutral.
4. **Motion character.** How things move here: Lim bounces, the cat swells like wet paint, the atlas flies a camera, the lab is taut and springy.

If a new component could be dropped into another app without looking wrong, it is generic. Push it until it could only live here.

## 3. Type does most of the work

- **Contrast in big steps.** Hierarchy comes from size, weight and tracking differing clearly, not from six nearly equal sizes. A display line three to six times the body size reads as intent; 18 px over 16 px reads as a mistake.
- **Set display type tight and large; set small labels wide.** Negative tracking on headlines, positive tracking on mono eyebrows and small caps. Line height falls as size rises: about 1.5 for body, 1.0 to 1.15 for display.
- **Measure.** Body text runs 45 to 75 characters. Wider than that, add a column or a margin, not a smaller font.
- **Numbers are data.** Times, coordinates, counts and prices use tabular figures or the mono face so they align and do not jitter as they change.
- **Finish the details.** `text-wrap: balance` on headings, `pretty` on paragraphs, real quotes and dashes, non-breaking spaces before units. Italic for the one emphasised word ("Where to *next?*"), never gradient text.
- **Strings will be long.** A Korean place name or a 60-character venue must wrap without breaking the layout (`overflow-wrap: anywhere`).

## 4. Colour is mostly neutral

- **Tint the neutrals.** Greys lean toward the world's temperature: warm for paper, cool for chart paper, plum for Lim. A neutral with no hue looks like a default.
- **The accent is rare, so it means something.** It marks the one action or the one identity on screen. If more than about a tenth of the viewport is accent, it has stopped being one. When an accent has two jobs, split it into two with a rule, as Trips does: `--brand*` for chrome, `--ta*` for the trip.
- **Dark mode is a second design.** Do not invert. Surfaces get lighter as they rise instead of casting bigger shadows, accents lose a little saturation and gain lightness, and pure white text is softened. Materials change behaviour: at night the cat is an opaque moonlit body, because bare dark paper would not read as a glaze.
- **Contrast is checked, not eyeballed.** 4.5:1 for text, 3:1 for the edges of controls and for focus rings, in both themes.
- **Colour never carries meaning alone.** Pair it with a shape, a label or a position.

## 5. Space, alignment and depth

- **Spacing comes from a scale** (multiples of 4 px). Related things sit close; unrelated things sit far. Get grouping right with distance first; reach for a rule or a box only when distance cannot say it.
- **Hairlines over boxes, boxes over shadows.** Every container you add is a border the eye must cross. A list of cards inside a card inside a panel is three frames around one idea.
- **Few edges.** Line content up on a small number of vertical edges. A layout with one strong left edge and one deliberate break from it looks composed; centred everything looks like a template.
- **One light.** Each world has a single light direction, and every shadow, highlight and glint agrees with it. Shadows are soft, layered and tinted with the surface colour. Three levels of elevation are enough: on the page, raised, floating.
- **No stacked glass.** Blur over blur is noise. Chrome is opaque material from the world.
- **Phones are held.** Primary actions sit in the thumb's reach at the bottom, targets are at least 44 × 44 px, safe areas are respected, and inputs are 16 px so iOS does not zoom. Design the phone layout as its own composition, not a squeezed desktop.

## 6. Motion is physics with a reason

Every animation must answer one of three questions for the person watching: where did this come from, where did it go, what just changed? If it answers none, cut it.

- **Touched things use springs.** Anything dragged, pressed or thrown keeps its velocity and settles; a fixed-duration tween feels dead in the hand. Untouched transitions use an ease-out curve.
- **Fast, and faster out.** 120 to 200 ms for feedback on a press, 240 to 400 ms for a panel or a page, exits about a third shorter than entrances. Nothing blocks input while it plays, and everything can be interrupted and reversed mid-flight.
- **Animation principles are the difference between moving and alive.** Anticipation before a jump, stretch in the air, squash on landing, overlapping action in the parts that trail (Lim's tuft, the cat's tail), a settle at the end. Offsets of a frame or two between parts do more than any easing curve.
- **Stagger with restraint.** 20 to 40 ms between items, capped so a long list does not make anyone wait.
- **Cheap properties only.** Animate `transform` and `opacity`. Layout animation is for the rare moment that needs it.
- **Reduced motion keeps the information and removes the travel.** A cut or a short fade replaces the flight; the cat holds its pose for each phase; nothing loops. It is a designed mode, tested like the other one.

## 7. Real-time scenes: hand-made, tactile, cheap

The 3D work is what people remember, so it gets the highest bar and the tightest budget.

- **Hand-made beats photoreal.** Toon ramps, ink hulls, paper grain, painted normals, pigment that pools. A stylised look hides nothing and ages well; a nearly real one looks cheap the moment a frame drops. (The one photoreal view, "Fly the day", is real photogrammetry and is kept honest: unlit, no added bloom or clouds.)
- **It reacts in one frame.** Poke, drag, fling, tilt. Latency between finger and response is the single thing that breaks the illusion.
- **One light model per scene,** shared by every material in it, so new parts match without tuning.
- **Post-processing is seasoning.** Grain, a restrained bloom on real highlights, a vignette. No lens flares, god rays or chromatic fringes used as decoration.
- **The first paint is a still by the same hand.** An SVG or painted CSS fallback shows immediately and for anyone without a GPU, and the scene takes over without a jump in position, colour or scale.
- **Sixty frames a second on a phone, or it ships smaller.** Cap the pixel ratio, let the stage governor step it down, pause off-screen, render on demand when at rest, and keep one draw call per kind of thing.
- **Easter eggs reward attention and are never required.** They are found by doing more of what the scene already invites.

## 8. Every state is designed

A component is not its resting screenshot. Before it is done it has, where they apply: rest, hover, focus-visible, pressed, selected, disabled, loading, empty, error, success, and overflowing with too much content.

- **Focus is visible and belongs to the world.** A ring in the app's accent on every interactive element. Keyboard paths are complete: tab order follows reading order, Escape closes, arrows move within a group, and real shortcuts exist for frequent actions.
- **Loading shows the shape of what is coming,** or says what is really happening ("Checking Google Maps"). A lone spinner says nothing.
- **Empty states are the first-run experience.** Say what goes here and offer the one action that fills it.
- **Errors are calm, specific and useful:** what happened, what was kept, what to do next. One sentence, in place, beside the thing that failed.
- **Prefer Undo to "Are you sure?".** Do the thing, show a toast with Undo. Confirm only what cannot be reversed.
- **Announce what changes off-screen.** Live regions for results, reorders and timers.

## 9. Words are interface

- Sentence case. Verbs on buttons. Name the outcome precisely: "Add to Sat 14 Nov · 13:00" beats "Add".
- Say it once and plainly. No "Oops", no exclamation marks, no "simply", no apology theatre.
- The product speaks in the person's terms: stops and days, not items and records.
- AI is shown doing real work, proposes rather than performs, and is always undoable. It never has a magic-purple look.

## 10. What we do not ship

These are the marks of a design nobody made a decision about: purple-to-blue "AI" gradients, gradient text, glowing borders, stacked glass, emoji as icons, a centred hero over three identical cards, stock photography, the same radius and shadow on everything, bounce on everything, and decoration that moves for no reason. Each app adds its own list in `PRODUCT.md`.

## How to work

1. **Look first.** Open the real screen on a phone-sized and a desktop viewport, in light and dark. Screenshot it. You are designing a change to *that*, not a blank canvas.
2. **Write the intent in one sentence.** "The day view should make the next stop obvious at a glance." If you cannot, you are not ready to draw.
3. **Compose from what exists.** Tokens, the app's primitives (`a.*` in Trips), its motion presets. A new token or primitive is a decision for the whole app; make it deliberately or not at all.
4. **Build the hard states with the easy one.** Empty, long, loading, failed, dark, phone, reduced motion.
5. **Run the passes** on the running app, not in your head:
   - *Squint:* blur your eyes. One thing should stand out, and it should be the right thing.
   - *Greyscale:* hierarchy must survive without colour.
   - *Thumb:* on a phone-sized viewport, reach every primary action; nothing sits under the browser chrome.
   - *Keyboard:* complete the task without a pointer and see the focus ring the whole way.
   - *Stress:* a 60-character Korean title, zero items, two hundred items.
   - *Stillness:* turn on reduced motion and confirm nothing is lost.
   - *Second look:* zoom to 200% and inspect edges, alignment, and the one-pixel things.
6. **Show it.** Capture before and after (`frontend/scripts/capture-trips.mjs`, `capture-lim.mjs`, or the preview) and put them in the PR.

It is finished when you would put the screenshot in a portfolio without cropping it.
