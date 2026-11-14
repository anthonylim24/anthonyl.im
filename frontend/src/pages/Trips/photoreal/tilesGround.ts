import { Raycaster, Vector3, type Material, type Object3D, type WebGLRenderer } from "three"
import { TilesRenderer } from "3d-tiles-renderer"
import {
  GLTFExtensionsPlugin,
  GoogleCloudAuthPlugin,
  ReorientationPlugin,
  TileCompressionPlugin,
} from "3d-tiles-renderer/plugins"
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js"
import type { Ground, GroundContext, GroundPalette } from "./ground"
import { pickFloorHit, YOU_RAY_FAR, YOU_RAY_HEIGHT, type TerrainHit } from "./terrainAnchor"

// Google Photorealistic 3D Tiles, re-centred on the day: the anchor sits at
// the origin with +X west, +Z north, +Y up (ReorientationPlugin's frame).

const DEG = Math.PI / 180

/** The parts of a 3D Tiles tile we read (see the library's `Tile` type). */
interface TileNode {
  parent: TileNode | null
  geometricError: number
  internal?: { hasRenderableContent?: boolean }
}

interface TintTarget {
  color?: { setRGB: (r: number, g: number, b: number) => void }
  emissive?: { setRGB: (r: number, g: number, b: number) => void }
  userData: { prelit?: boolean }
}

/**
 * Photogrammetry is lit by the day it was flown. Flatten every tile
 * material to unlit (albedo through emissive) so our lights can't shade it
 * twice, and give its textures sRGB + anisotropy so facades stay crisp at
 * grazing angles. Returns the materials so the theme can tint them.
 */
function prepareTile(root: Object3D, renderer: WebGLRenderer, into: Set<TintTarget>): void {
  const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
  root.traverse((node) => {
    const material = (node as { material?: Material | Material[] }).material
    if (!material) return
    for (const mat of Array.isArray(material) ? material : [material]) {
      const m = mat as Material & {
        map?: { isTexture?: boolean; anisotropy: number; colorSpace: string; needsUpdate: boolean } | null
        emissiveMap?: unknown
        emissive?: { setRGB: (r: number, g: number, b: number) => void }
        color?: { setRGB: (r: number, g: number, b: number) => void }
        emissiveIntensity?: number
        metalness?: number
        roughness?: number
        envMapIntensity?: number
        isMeshStandardMaterial?: boolean
      }
      if (m.map?.isTexture) {
        m.map.anisotropy = anisotropy
        m.map.colorSpace = "srgb"
        m.map.needsUpdate = true
      }
      if (m.isMeshStandardMaterial && m.map?.isTexture && !m.userData.prelit) {
        m.emissiveMap = m.map
        m.emissive?.setRGB(1, 1, 1)
        m.emissiveIntensity = 1
        m.color?.setRGB(0, 0, 0)
        m.metalness = 0
        m.roughness = 1
        m.envMapIntensity = 0
        m.userData.prelit = true
      } else if (typeof m.envMapIntensity === "number") {
        m.envMapIntensity = 0
      }
      into.add(m as unknown as TintTarget)
    }
  })
}

export function createTilesGround(ctx: GroundContext, apiKey: string): Ground {
  const { renderer, camera } = ctx
  const draco = new DRACOLoader().setDecoderPath("/draco/gltf/")
  const ktx2 = new KTX2Loader().setTranscoderPath("/basis/").detectSupport(renderer)

  const tiles = new TilesRenderer()
  tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: apiKey, autoRefreshToken: true }))
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco, ktxLoader: ktx2 }))
  tiles.registerPlugin(new TileCompressionPlugin())
  tiles.registerPlugin(new ReorientationPlugin({ lat: ctx.anchor.lat * DEG, lon: ctx.anchor.lng * DEG, height: 0 }))
  tiles.setCamera(camera)
  tiles.setResolutionFromRenderer(camera, renderer)
  tiles.errorTarget = 16

  const materials = new Set<TintTarget>()
  // Night theme: the tiles stay daylight imagery, so pull them down to a
  // cool dusk instead of leaving a bright city behind dark chrome.
  let tint: [number, number, number] = [1, 1, 1]
  const applyTint = (m: TintTarget) => {
    if (m.userData.prelit) m.emissive?.setRGB(...tint)
    else m.color?.setRGB(...tint)
  }
  const setPalette = (palette: GroundPalette) => {
    tint = palette.dark ? [0.44, 0.5, 0.62] : [1, 1, 1]
    materials.forEach(applyTint)
    ctx.invalidate()
  }
  setPalette(ctx.palette)

  let failed = false
  const onModel = (event: { scene?: Object3D }) => {
    if (!event.scene) return
    const fresh = new Set<TintTarget>()
    prepareTile(event.scene, renderer, fresh)
    fresh.forEach((m) => {
      materials.add(m)
      applyTint(m)
    })
    ctx.invalidate()
  }
  const onDisposeModel = (event: { scene?: Object3D }) => {
    event.scene?.traverse((node) => {
      const material = (node as { material?: Material | Material[] }).material
      if (!material) return
      for (const mat of Array.isArray(material) ? material : [material]) materials.delete(mat as unknown as TintTarget)
    })
  }
  // A tile Google refuses (it 404s parts of some cities, Seoul among them)
  // counts as "loaded" to the traversal, which then swaps its parent out for
  // nothing: a hole in the ground. So when a tile fails, hold the nearest
  // ancestor that has a model: with no geometric error it is never refined
  // away, and the missing child is never asked for again. The refusals are
  // per file and repeatable (the same session loads its neighbours), so
  // there is no retry; the library's `resetFailedTiles()` also throws on
  // tiles it has not preprocessed yet.
  const held = new Set<TileNode>()
  let failures = 0
  const onError = (event: { tile?: TileNode | null; error?: unknown }) => {
    if (event.tile) {
      failures += 1
      let node = event.tile.parent
      while (node && !node.internal?.hasRenderableContent) node = node.parent
      if (node && !held.has(node)) {
        held.add(node)
        node.geometricError = 0
      }
      ctx.invalidate()
      return
    }
    // A single bad tile is survivable; a refused root tileset is not.
    if (failed) return
    failed = true
    ctx.onFatal(event.error instanceof Error ? event.error.message : "tileset refused")
  }
  const onNeeds = () => ctx.invalidate()
  // The library's event map is not exported; these are its documented names.
  const listen = tiles.addEventListener.bind(tiles) as (type: string, fn: (event: never) => void) => void
  const unlisten = tiles.removeEventListener.bind(tiles) as (type: string, fn: (event: never) => void) => void
  listen("load-model", onModel)
  listen("dispose-model", onDisposeModel)
  listen("load-error", onError)
  listen("needs-render", onNeeds)
  listen("needs-update", onNeeds)
  listen("tiles-load-end", onNeeds)

  const ray = new Raycaster()
  const origin = new Vector3()
  const down = new Vector3(0, -1, 0)
  const dir = new Vector3()
  const normal = new Vector3()

  return {
    group: tiles.group,
    update: () => tiles.update(),
    busy: () => !failed && (tiles.loadProgress < 1 || !tiles.group.children.length),
    hasContent: () => tiles.group.children.length > 0,
    progress: () => (tiles.group.children.length > 0 ? tiles.loadProgress : 0),
    failures: () => failures,
    floorAt(x, z) {
      origin.set(x, YOU_RAY_HEIGHT, z)
      ray.set(origin, down)
      ray.near = 0
      ray.far = YOU_RAY_FAR
      const hits: TerrainHit[] = []
      let raw = ray.intersectObject(tiles.group, true)
      if (raw.length === 0) {
        // The library's tree raycast only tests tiles it counts as "active",
        // and some tiles on screen are visible without being that (seen on
        // real tiles: a strip of Lisbon that drew fine but could not be hit,
        // leaving a stop at sea level). Ask the visible tiles directly.
        raw = []
        for (const tile of tiles.visibleTiles as Set<{ engineData?: { scene?: Object3D } }>) {
          const scene = tile.engineData?.scene
          if (scene) ray.intersectObject(scene, true, raw)
        }
      }
      for (const h of raw) {
        if (!h.face) continue
        normal.copy(h.face.normal).transformDirection(h.object.matrixWorld)
        if (normal.lengthSq() < 1e-8) continue
        hits.push({
          distance: h.distance,
          point: { x: h.point.x, y: h.point.y, z: h.point.z },
          normal: { x: normal.x, y: normal.y, z: normal.z },
        })
      }
      return pickFloorHit(hits)
    },
    blocked(from, to) {
      dir.subVectors(to, from)
      const length = dir.length()
      if (length < 1) return false
      ray.set(from, dir.divideScalar(length))
      ray.near = 2
      ray.far = length - 6
      ;(ray as Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true
      const hit = ray.intersectObject(tiles.group, true).length > 0
      ;(ray as Raycaster & { firstHitOnly?: boolean }).firstHitOnly = false
      return hit
    },
    resize: () => tiles.setResolutionFromRenderer(camera, renderer),
    setErrorTarget(target) {
      if (tiles.errorTarget !== target) tiles.errorTarget = target
    },
    setPalette,
    setSun: () => {},
    attribution() {
      const seen = new Set<string>()
      for (const entry of tiles.getAttributions() as Array<{ value?: string }>) {
        if (entry.value) seen.add(entry.value)
      }
      return [...seen].join(" · ")
    },
    dispose() {
      unlisten("load-model", onModel)
      unlisten("dispose-model", onDisposeModel)
      unlisten("load-error", onError)
      unlisten("needs-render", onNeeds)
      unlisten("needs-update", onNeeds)
      unlisten("tiles-load-end", onNeeds)
      held.clear()
      tiles.dispose()
      draco.dispose()
      ktx2.dispose()
      materials.clear()
    },
  }
}
