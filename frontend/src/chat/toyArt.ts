import { ITEMS } from './world/spec'

/** A catalog toy pre-rendered in Blender (`bun art/render.ts toys`): a still, and one turn as a strip of frames. */
export type ToyArt = { still: string; turn: string }

const files = import.meta.glob<string>('./toys/*.webp', { eager: true, query: '?url', import: 'default' })

/** Keyed like `ITEMS`. Model-made toys have no entry and draw live. */
export const TOY_ART: Record<string, ToyArt> = Object.fromEntries(
  Object.keys(ITEMS).flatMap((key) => {
    const slug = key.replace(/ /g, '-')
    const still = files[`./toys/${slug}.webp`]
    const turn = files[`./toys/${slug}.turn.webp`]
    return still && turn ? [[key, { still, turn }]] : []
  }),
)

const decoded = new Map<string, Promise<boolean>>()

/** Resolves true once the strip can paint its first frame, so a turn never starts on a blank card. */
export function loadTurn(url: string): Promise<boolean> {
  let ready = decoded.get(url)
  if (!ready) {
    const img = new Image()
    img.src = url
    ready = img.decode().then(
      () => true,
      () => {
        decoded.delete(url)
        return false
      },
    )
    decoded.set(url, ready)
  }
  return ready
}
