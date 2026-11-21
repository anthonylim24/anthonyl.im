# Pre-rendered art

Some art on the site is made offline and committed: Lim's toy box and the models its toys wear on the stage, BreathFlow's wax seals and the Trips engravings. Everything that makes them lives in `frontend/art/`, and one command rebuilds each set.

| Set | Source | Output | Shown by |
|-----|--------|--------|----------|
| Toys | `art/toys.py`: each catalog toy in `chat/world/spec.ts` modelled by hand after the concept sheet `art/concepts/toybox.webp` (ChatGPT Image) | `src/chat/toys/<key>.webp` (240 px still) and `<key>.turn.webp` (48 frames of one turn, 160 px each, in one strip, played over 1.6 s at 30 fps) | `ToyCard.tsx` via `chat/toyArt.ts` |
| Stage models | The same `art/toys.py` builders at stage detail, every catalog toy but the hoop and the goal | `src/chat/toys/<key>.mesh` (at most 3000 triangles, 11 to 28 kB) | `modelLook` in `chat/scene/items.ts` via `chat/scene/toyMesh.ts` |
| Seals | `art/seals.py`: a wax puddle in the badge's `sealInk`, pressed with a beaded ring and its Fraunces monogram | `src/breathflow/seals/<badge id>.webp` (144 px) | `WaxSeal` in `BadgeGrid.tsx` |
| Engravings | `art/concepts/<name>.webp`, black ink on white from ChatGPT Image | `src/pages/Trips/art/<name>.webp` (640 px alpha mask) | `Engraving` in `pages/Trips/components/kit.tsx` |

## Rebuilding

From `frontend/`:

```bash
bun art/render.ts toys
```

```bash
bun art/render.ts toys --only donut,teddy --pack-only
```

```bash
bun art/render.ts meshes
```

```bash
bun art/render.ts seals
```

```bash
bun art/render.ts engravings
```

`toys`, `meshes` and `seals` run Blender headless (`BLENDER` overrides `/Applications/Blender.app/Contents/MacOS/Blender`) and need `ffmpeg` and `cwebp`. A full toy run is about 25 minutes on an M1 Max; seals take about two. Renders stay in `art/.cache/` (gitignored, with the Poly Haven HDRI and the Fraunces font it downloads), so `--pack-only` re-encodes without rendering. Commit the WebP and mesh files with the change to the scripts that made them.

Parity tests fail when a catalog toy has no picture or no stage model, or a badge has no picture: `chat/__tests__/ToyCard.test.tsx`, `chat/__tests__/toyMesh.test.ts`, `breathflow/components/__tests__/BadgeGrid.test.tsx`. A new toy needs a builder in `BUILD` (`toys.py` refuses to run without one), a render and a mesh. A new badge needs only a render.

## Stage models

`bun art/render.ts meshes` builds each toy again with `Kit(detail=0.6)` (fewer segments), subdivision capped at one level, and writes one welded, triangulated mesh, decimated to `BUDGET` (3000) triangles when it is over. The picture's tilts are dropped; `ON_STAGE` turns the few toys whose builders face another way (the donut stands on its rim, the duck faces front, the chili stands upright). Faces are grouped by colour (the catalog hex a material was made from), and the vertices and triangles are written in a sorted order, so a rerun of an unchanged toy writes the same bytes.

The format is little-endian: the tag `TOY1`; vertex, index and group counts (`u32`); the bounds (six `f32`); per group its first index, index count and colour (`u32`); positions quantised to 16 bits within the bounds; 16-bit indices. Axes are three.js's (y up, front toward +z), the toy standing on y = 0, centred on x and z. Anything a shader painted in the picture (the beach ball's panels) must be geometry or a spec paint to reach the stage.

## The studio

`art/studio.py` is shared by both Blender sets: Cycles on the GPU only, a transparent film with a shadow catcher, Khronos PBR Neutral tone mapping (so catalog hexes come out as themselves) and +0.3 exposure.

- **Light.** The Poly Haven `studio_small_08` HDRI is used for reflections and fill. A rig adds a soft key from the upper left, which is the only light that casts shadows, plus a broad front light, a fill and a rim.
- **Shadows.** The catcher keeps only a contact shadow. It fades out with distance from the subject and again near the frame's border, measured in screen space, so no shadow reaches an edge and turns into a grey box on a card.
- **Materials.** `gummy` for sorbet plastic, `matte`, `glass`, `gloss`. Every material is in linear colour converted from the catalog hex.

## Working live with Blender MCP

The [Blender MCP](https://github.com/ahujasid/blender-mcp) add-on is the fastest way to iterate on a model. Install `addon.py` in Blender and start its server (port 9876). Register the MCP server with `uvx blender-mcp`, which gives an agent tools such as `execute_code` and `get_viewport_screenshot`. Without the MCP tools, `art/bmcp.py` talks to the same socket:

```bash
python3 art/bmcp.py exec snippet.py
```

A snippet imports `studio` and `toys` (or `seals`), reloads them and calls `toys.shoot(key, spec, out, frames=1)` or `seals.seal(spec, out, font)`. The scripts never reset Blender's factory settings, so they are safe in a session you are using. They build into a scene named `art`.

## Drawing with ChatGPT Image

The concept sheet and the engravings were drawn in the ChatGPT desktop app. The engraving prompts asked for an antique copperplate engraving in pure black ink on pure white, with hatching only and no text, border or colour. Save the result to `art/concepts/<name>.webp` and run `bun art/render.ts engravings`, which turns ink into alpha. Add a new name to `ENGRAVINGS` in `render.ts`.
