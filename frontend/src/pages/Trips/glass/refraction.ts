// Real refraction for the Liquid Glass look, in Chromium only: each glass
// surface gets its own SVG displacement filter, drawn to its size and corner
// radius, and `glass.css` puts it in front of the blur in `backdrop-filter`.
// Other browsers (Safari, Firefox) cannot use `url()` in `backdrop-filter`,
// so they keep the frosted material, which is designed to stand on its own.
//
// The engine writes one registered, non-inheriting custom property per
// surface (`--tg-refract`); it never writes `backdrop-filter` itself, so the
// reduced-transparency and contrast rules in `glass.css` still win, and
// disposing leaves the page exactly as the CSS draws it.

import {
  displacementScale,
  fillDisplacement,
  lensKey,
  mapSize,
  pickRefracting,
  snappedSpec,
  type Corners,
  type LensSpec,
  type Material,
} from "./bezel"

const MATERIALS: Record<string, Material> = {
  "trips-glass-pill": "pill",
  "trips-glass-bar": "bar",
  "trips-glass-sheet": "sheet",
}
/** Refracting surfaces at once; the rest stay frosted. */
const BUDGET = 12
/** Bent band at the rim and the largest shift there, px, per material. */
const LENS: Record<Material, { bezel: number; shift: number }> = {
  pill: { bezel: 14, shift: 12 },
  bar: { bezel: 16, shift: 14 },
  sheet: { bezel: 22, shift: 16 },
}
/** A new surface stays frosted this long, so a sheet's entrance never waits on a map. */
const SETTLE_MS = 320
const MAX_MAPS = 24
const SVG_NS = "http://www.w3.org/2000/svg"

interface Navigator {
  userAgentData?: { brands?: { brand: string }[] }
}

/** Chromium draws `url()` filters in `backdrop-filter`; nothing else does. Brands, not `CSS.supports`, which says yes everywhere. */
export function refractsBackdrop(nav: Navigator = navigator as Navigator): boolean {
  const brands = nav.userAgentData?.brands ?? []
  return brands.some(({ brand }) => brand === "Chromium" || brand === "Google Chrome" || brand === "Microsoft Edge")
}

interface Surface {
  el: HTMLElement
  material: Material
  id: string
  width: number
  height: number
  corners: Corners
  visible: boolean
  /** Before this time it stays frosted (entrance animations). */
  settleAt: number
  /** The key its filter currently shows, or null while frosted. */
  shown: string | null
  filter: SVGFilterElement | null
}

const px = (value: string) => {
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

function readCorners(el: HTMLElement): Corners {
  const style = getComputedStyle(el)
  return {
    tl: px(style.borderTopLeftRadius),
    tr: px(style.borderTopRightRadius),
    br: px(style.borderBottomRightRadius),
    bl: px(style.borderBottomLeftRadius),
  }
}

/** Paints a lens into a blob URL off the main thread where it can. */
async function drawMap(spec: LensSpec): Promise<string> {
  const { columns, rows } = mapSize(spec.width, spec.height)
  const pixels = fillDisplacement(spec, columns, rows)
  const image = new ImageData(new Uint8ClampedArray(pixels.buffer as ArrayBuffer), columns, rows)
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(columns, rows)
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("no 2d context")
    ctx.putImageData(image, 0, 0)
    return URL.createObjectURL(await canvas.convertToBlob({ type: "image/png" }))
  }
  const canvas = document.createElement("canvas")
  canvas.width = columns
  canvas.height = rows
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("no 2d context")
  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL("image/png")
}

const idle = (fn: () => void) =>
  typeof requestIdleCallback === "function" ? requestIdleCallback(fn, { timeout: 400 }) : window.setTimeout(fn, 60)

/** Starts the engine; returns its dispose. A no-op outside Chromium. */
export function startRefraction(): () => void {
  if (typeof document === "undefined" || !refractsBackdrop()) return () => {}
  const quiet = window.matchMedia("(prefers-reduced-transparency: reduce), (prefers-contrast: more)")

  const svg = document.createElementNS(SVG_NS, "svg")
  svg.setAttribute("aria-hidden", "true")
  svg.setAttribute("width", "0")
  svg.setAttribute("height", "0")
  svg.style.cssText = "position:fixed;width:0;height:0;pointer-events:none;visibility:hidden"
  const defs = document.createElementNS(SVG_NS, "defs")
  svg.append(defs)
  document.body.append(svg)
  document.documentElement.dataset.tripsRefraction = ""

  const surfaces = new Map<HTMLElement, Surface>()
  /** Lens key → blob URL (or a pending draw). Insertion order is the LRU. */
  const maps = new Map<string, Promise<string>>()
  const collections = Object.keys(MATERIALS).map((name) => [document.getElementsByClassName(name), MATERIALS[name]!] as const)
  let serial = 0
  let disposed = false
  let frame = 0
  let assignTimer = 0

  const mapFor = (spec: LensSpec): Promise<string> => {
    const key = lensKey(spec)
    const hit = maps.get(key)
    if (hit) {
      maps.delete(key)
      maps.set(key, hit)
      return hit
    }
    const drawn = drawMap(snappedSpec(spec))
    maps.set(key, drawn)
    while (maps.size > MAX_MAPS) {
      const [oldest, url] = maps.entries().next().value as [string, Promise<string>]
      maps.delete(oldest)
      void url.then((u) => u.startsWith("blob:") && URL.revokeObjectURL(u), () => {})
    }
    return drawn
  }

  const frost = (s: Surface) => {
    if (s.shown === null) return
    s.shown = null
    s.el.style.removeProperty("--tg-refract")
  }

  const lensOf = (s: Surface): LensSpec => ({ width: s.width, height: s.height, corners: s.corners, bezel: LENS[s.material].bezel })

  const refract = (s: Surface) => {
    const spec = lensOf(s)
    const key = lensKey(spec)
    if (s.shown === key) return
    mapFor(spec).then(
      (url) => {
        if (disposed || !surfaces.has(s.el) || lensKey(lensOf(s)) !== key) return
        if (!s.filter) {
          s.filter = document.createElementNS(SVG_NS, "filter")
          s.filter.id = s.id
          s.filter.setAttribute("color-interpolation-filters", "sRGB")
          s.filter.setAttribute("filterUnits", "userSpaceOnUse")
          s.filter.setAttribute("primitiveUnits", "userSpaceOnUse")
          const image = document.createElementNS(SVG_NS, "feImage")
          image.setAttribute("preserveAspectRatio", "none")
          image.setAttribute("result", "lens")
          const bend = document.createElementNS(SVG_NS, "feDisplacementMap")
          bend.setAttribute("in", "SourceGraphic")
          bend.setAttribute("in2", "lens")
          bend.setAttribute("xChannelSelector", "R")
          bend.setAttribute("yChannelSelector", "G")
          s.filter.append(image, bend)
          defs.append(s.filter)
        }
        const [image, bend] = s.filter.children as unknown as [SVGFEImageElement, SVGFEDisplacementMapElement]
        for (const node of [s.filter, image]) {
          node.setAttribute("x", "0")
          node.setAttribute("y", "0")
          node.setAttribute("width", String(s.width))
          node.setAttribute("height", String(s.height))
        }
        image.setAttribute("href", url)
        bend.setAttribute("scale", displacementScale(LENS[s.material].shift).toFixed(2))
        s.shown = key
        s.el.style.setProperty("--tg-refract", `url(#${s.id})`)
      },
      () => frost(s),
    )
  }

  /** Decides who refracts, after sizes and visibility settle. */
  const assign = () => {
    assignTimer = 0
    if (disposed) return
    if (quiet.matches) {
      surfaces.forEach(frost)
      return
    }
    const now = performance.now()
    let wait = 0
    const chosen = pickRefracting(
      [...surfaces.values()].map((s) => ({ key: s, material: s.material, visible: s.visible, area: s.width * s.height })),
      BUDGET,
    )
    surfaces.forEach((s) => {
      if (!chosen.has(s)) return frost(s)
      if (now < s.settleAt) {
        wait = Math.max(wait, s.settleAt - now)
        return
      }
      idle(() => !disposed && refract(s))
    })
    if (wait > 0) schedule(wait + 16)
  }

  const schedule = (delay = 0) => {
    if (assignTimer) window.clearTimeout(assignTimer)
    assignTimer = window.setTimeout(assign, delay)
  }

  const resize = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const s = surfaces.get(entry.target as HTMLElement)
      if (!s) continue
      const box = entry.borderBoxSize?.[0]
      s.width = box ? box.inlineSize : (entry.target as HTMLElement).offsetWidth
      s.height = box ? box.blockSize : (entry.target as HTMLElement).offsetHeight
      s.corners = readCorners(s.el)
    }
    // A sheet growing as it opens settles first; its map is drawn once.
    schedule(120)
  })

  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const s = surfaces.get(entry.target as HTMLElement)
      if (s) s.visible = entry.isIntersecting
    }
    schedule(60)
  })

  const scan = () => {
    frame = 0
    if (disposed) return
    const live = new Set<HTMLElement>()
    for (const [collection, material] of collections) {
      for (const el of Array.from(collection) as HTMLElement[]) {
        live.add(el)
        if (surfaces.has(el)) continue
        // Print, the recap card and the photoreal view stay as they are.
        if (el.closest(".trips-glass-off, .trips-print-root, .trips-recap-print-root")) continue
        surfaces.set(el, {
          el,
          material,
          id: `tg-lens-${++serial}`,
          width: el.offsetWidth,
          height: el.offsetHeight,
          corners: readCorners(el),
          visible: false,
          settleAt: performance.now() + SETTLE_MS,
          shown: null,
          filter: null,
        })
        resize.observe(el)
        seen.observe(el)
      }
    }
    surfaces.forEach((s, el) => {
      if (live.has(el)) return
      resize.unobserve(el)
      seen.unobserve(el)
      el.style.removeProperty("--tg-refract")
      s.filter?.remove()
      surfaces.delete(el)
    })
    schedule(60)
  }

  const queueScan = () => {
    if (!frame) frame = requestAnimationFrame(scan)
  }
  // Only additions and removals matter; the live collections make the scan cheap.
  const mutations = new MutationObserver(queueScan)
  mutations.observe(document.body, { childList: true, subtree: true })
  const onQuiet = () => schedule()
  quiet.addEventListener("change", onQuiet)
  scan()

  return () => {
    disposed = true
    if (frame) cancelAnimationFrame(frame)
    if (assignTimer) window.clearTimeout(assignTimer)
    mutations.disconnect()
    resize.disconnect()
    seen.disconnect()
    quiet.removeEventListener("change", onQuiet)
    surfaces.forEach((s) => s.el.style.removeProperty("--tg-refract"))
    surfaces.clear()
    svg.remove()
    delete document.documentElement.dataset.tripsRefraction
    maps.forEach((url) => void url.then((u) => u.startsWith("blob:") && URL.revokeObjectURL(u), () => {}))
    maps.clear()
  }
}
