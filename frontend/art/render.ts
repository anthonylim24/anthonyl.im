/**
 * Renders the site's pre-rendered art in Blender and packs it for the app.
 *
 *   bun art/render.ts toys [--only donut,teddy] [--frames 48] [--samples 128] [--pack-only]
 *   bun art/render.ts meshes [--only donut,teddy]
 *   bun art/render.ts seals [--only streak_7] [--samples 128] [--pack-only]
 *   bun art/render.ts engravings
 *
 * toys: every catalog toy in `src/chat/world/spec.ts` as a still (`src/chat/toys/<slug>.webp`)
 * and a one-turn sprite strip (`<slug>.turn.webp`).
 * meshes: the same toys as light models for Lim's stage (`src/chat/toys/<slug>.mesh`), every one
 * but the hoop and the goal, which `scene/fixtures.ts` draws to fit their colliders.
 * seals: every BreathFlow badge in `src/breathflow/gamify/badges.ts` as a pressed wax seal
 * (`src/breathflow/seals/<id>.webp`) in its `sealInk` colour.
 * engravings: the ink-on-white engravings in `art/concepts/` (drawn with ChatGPT Image) as
 * alpha masks in `src/pages/Trips/art/`, which the page inks in its own colour.
 *
 * Needs Blender (BLENDER=path to override), ffmpeg and cwebp. Renders are kept in `art/.cache/`
 * so a re-pack does not re-render.
 */
import { $ } from 'bun'
import { mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ITEMS } from '../src/chat/world/spec'
import { BADGES } from '../src/breathflow/gamify/badges'
import { sealInk } from '../src/breathflow/pigments'
import { WORK, frame, level, plate, print, rgba } from './sky'

const ART = import.meta.dir
const CACHE = join(ART, '.cache')
const BLENDER = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender'
const STILL = 240
const FRAME = 160
const SEAL = 144
/** Engraving → its mask's edge in px. */
const ENGRAVINGS: Record<string, number> = { serpent: 640, compass: 640 }
/** The forecast's skies (shown at most ~6rem wide), each as an ink mask and a print for dark paper. */
const SKIES = ['clear', 'partly-cloudy', 'cloudy', 'fog', 'drizzle', 'rain', 'showers', 'snow', 'thunder']
const SKY_EDGE = 384
/** Skies whose fine strokes (rain, drizzle) need weight to survive the downscale. */
const SKY_WEIGHT: Record<string, number> = { showers: 0.5, drizzle: 0.6, rain: 0.4 }
/** Stroke tone every sky is levelled to; fog's soft mist reads heavy at the same tone, so a little less. */
const SKY_TONE: Record<string, number> = { fog: 0.42 }
const FONT = 'https://github.com/google/fonts/raw/main/ofl/fraunces/Fraunces-Italic%5BSOFT,WONK,opsz,wght%5D.ttf'

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const slug = (key: string) => key.replace(/ /g, '-')

async function toys() {
  const frames = Number(arg('frames', '48'))
  const samples = arg('samples', '128')
  const only = arg('only', '')
  const specs = join(CACHE, 'specs.json')
  const out = join(CACHE, 'toys')
  const dest = join(ART, '../src/chat/toys')
  mkdirSync(out, { recursive: true })
  mkdirSync(dest, { recursive: true })
  await Bun.write(specs, JSON.stringify(Object.fromEntries(Object.entries(ITEMS).map(([key, entry]) => [key, entry.spec]))))
  const keys = only ? only.split(',') : Object.keys(ITEMS)
  if (!process.argv.includes('--pack-only')) {
    await $`${BLENDER} -b -P ${join(ART, 'toys.py')} -- ${specs} ${out} --only ${keys.join(',')} --frames ${frames} --samples ${samples} --res 320`
  }
  for (const key of keys) {
    const dir = join(out, slug(key))
    const still = join(dest, `${slug(key)}.webp`)
    const turn = join(dest, `${slug(key)}.turn.webp`)
    const strip = join(CACHE, `${slug(key)}.strip.png`)
    await $`cwebp -quiet -q 84 -alpha_q 90 -resize ${STILL} ${STILL} ${join(dir, '00.png')} -o ${still}`
    await $`ffmpeg -loglevel error -y -framerate 1 -i ${join(dir, '%02d.png')} -vf scale=${FRAME}:${FRAME}:flags=lanczos,tile=${frames}x1 -frames:v 1 -pix_fmt rgba ${strip}`
    await $`cwebp -quiet -q 78 -alpha_q 80 ${strip} -o ${turn}`
    console.log(`${key.padEnd(12)} still ${(statSync(still).size / 1024).toFixed(1)} kB · turn ${(statSync(turn).size / 1024).toFixed(1)} kB`)
  }
}

async function meshes() {
  const specs = join(CACHE, 'specs.json')
  const dest = join(ART, '../src/chat/toys')
  mkdirSync(dest, { recursive: true })
  const stage = Object.entries(ITEMS).filter(([, entry]) => !entry.spec.traits.some((t) => t === 'hoop' || t === 'goal'))
  await Bun.write(specs, JSON.stringify(Object.fromEntries(Object.entries(ITEMS).map(([key, entry]) => [key, entry.spec]))))
  const only = arg('only', '')
  const keys = only ? only.split(',') : stage.map(([key]) => key)
  await $`${BLENDER} -b -P ${join(ART, 'toys.py')} -- ${specs} ${dest} --mesh --only ${keys.join(',')}`
  for (const key of keys) console.log(`${key.padEnd(12)} ${(statSync(join(dest, `${slug(key)}.mesh`)).size / 1024).toFixed(1)} kB`)
}

async function seals() {
  const only = arg('only', '')
  const specs = join(CACHE, 'seals.json')
  const out = join(CACHE, 'seals')
  const dest = join(ART, '../src/breathflow/seals')
  const font = join(CACHE, 'Fraunces-Italic.ttf')
  mkdirSync(dest, { recursive: true })
  if (!(await Bun.file(font).exists())) await Bun.write(font, await fetch(FONT))
  const all = BADGES.map((badge) => ({ id: badge.id, letter: badge.name.charAt(0), ink: sealInk(badge.id) }))
  await Bun.write(specs, JSON.stringify(all))
  const ids = only ? only.split(',') : all.map((seal) => seal.id)
  if (!process.argv.includes('--pack-only')) {
    await $`${BLENDER} -b -P ${join(ART, 'seals.py')} -- ${specs} ${out} ${font} --only ${ids.join(',')} --samples ${arg('samples', '128')}`
  }
  for (const id of ids) {
    const file = join(dest, `${id}.webp`)
    await $`cwebp -quiet -q 84 -alpha_q 90 -resize ${SEAL} ${SEAL} ${join(out, `${id}.png`)} -o ${file}`
    console.log(`${id.padEnd(18)} ${(statSync(file).size / 1024).toFixed(1)} kB`)
  }
}

async function engravings() {
  const dest = join(ART, '../src/pages/Trips/art')
  mkdirSync(dest, { recursive: true })
  mkdirSync(CACHE, { recursive: true })
  for (const [name, edge] of Object.entries(ENGRAVINGS)) {
    const ink = `format=rgba,geq=r=0:g=0:b=0:a='clip((255-r(X,Y))*1.12-18,0,255)',scale=${edge}:${edge}:flags=lanczos`
    const mask = join(CACHE, `${name}.mask.png`)
    const file = join(dest, `${name}.webp`)
    await $`ffmpeg -loglevel error -y -i ${join(ART, 'concepts', `${name}.webp`)} -vf ${ink} ${mask}`
    await $`cwebp -quiet -q 40 -alpha_q 85 ${mask} -o ${file}`
    console.log(`${name.padEnd(18)} ${(statSync(file).size / 1024).toFixed(1)} kB`)
  }
  for (const sky of SKIES) {
    const source = join(ART, 'concepts', `sky-${sky}.webp`)
    const size = Number((await $`ffprobe -v error -show_entries stream=width -of csv=p=0 ${source}`.text()).trim())
    const grey = new Uint8Array(await $`ffmpeg -loglevel error -i ${source} -vf format=gray -f rawvideo -pix_fmt gray -`.arrayBuffer())
    const ink = level(frame(grey, size), SKY_TONE[sky] ?? 0.5, SKY_WEIGHT[sky] ?? 0)
    const masks = { ink, print: print(ink, plate(ink)) }
    for (const [kind, mask] of Object.entries(masks)) {
      const png = join(CACHE, `sky-${sky}.${kind}.png`)
      const file = join(dest, kind === 'ink' ? `sky-${sky}.webp` : `sky-${sky}.print.webp`)
      await $`ffmpeg -loglevel error -y -f rawvideo -pix_fmt rgba -s ${WORK}x${WORK} -i - ${png} < ${Buffer.from(rgba(mask))}`
      await $`cwebp -quiet -q 40 -alpha_q 85 -resize ${SKY_EDGE} ${SKY_EDGE} ${png} -o ${file}`
      console.log(`${`sky-${sky}.${kind}`.padEnd(18)} ${(statSync(file).size / 1024).toFixed(1)} kB`)
    }
  }
}

const jobs: Record<string, () => Promise<void>> = { toys, meshes, seals, engravings }
const job = jobs[process.argv[2] ?? '']
if (job) await job()
else {
  console.error('usage: bun art/render.ts toys|meshes|seals|engravings [--only a,b] [--samples 128] [--pack-only] (toys: [--frames 48])')
  process.exit(1)
}
