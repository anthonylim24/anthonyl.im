/**
 * Items for Lim's world, built from an ItemSpec: every shape is a smooth
 * deformation of one icosphere (so any of them can be a soft body), drawn in
 * the same gel shader and ink outline as the rest of the stage. The first
 * part is the body; the others are light rigid meshes that ride on it.
 */
import * as THREE from 'three/webgpu'
import { attribute, normalize, positionLocal } from 'three/tsl'
import { Jelly, icosphere, type Vec3 } from '../../three/jelly'
import { syncJellyGeometry } from '../../three/jellyMesh'
import { PAINTS, type ItemSpec, type Paint, type Part, type Shape } from '../world/spec'
import { drawnOnTop, drawnWidth, glassFill, hullMaterial, nearDepth, netMaterial, toyFill, type Drawn, type F, type LimUniforms, type V3 } from './limLook'
import { ITEM_R, boundsOf, carryMatrix, fitToyMesh, isInk, outlineWidths, type Box, type ToyMesh } from './toyMesh'

export { ITEM_R }

const pw = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e
const smooth = (k: number) => {
  const x = Math.min(1, Math.max(0, k))
  return x * x * (3 - 2 * x)
}

/** Map a point on the unit sphere onto a shape that fits the unit cube. */
function shapePoint(shape: Shape, x: number, y: number, z: number): Vec3 {
  if (shape === 'ball') return [x, y, z]
  if (shape === 'bean') return [x, y * 0.62 + 0.2 * (1 - x * x) - 0.1, z * 0.66]
  if (shape === 'heart') {
    const taper = 0.55 + 0.45 * smooth((y + 0.95) / 1.3)
    return [x * taper * 1.08, y * 0.86 + 0.5 * Math.sqrt(Math.abs(x)) - 0.22, z]
  }
  if (shape === 'star') {
    const a = Math.atan2(y, x) - Math.PI / 2
    const seg = (Math.PI * 2) / 5
    const k = Math.abs((((a % seg) + seg) % seg) / (seg / 2) - 1)
    const r = 0.52 + 0.48 * k ** 1.4
    return [x * r * 1.05, y * r * 1.05, z]
  }
  if (shape === 'drop') {
    const up = (y + 1) / 2
    const pinch = 1 - 0.9 * up ** 2.4
    return [x * pinch, y * 0.82 + 0.36 * up * up - 0.12, z * pinch]
  }
  // Superellipsoids: round across, flatter top and bottom.
  const lat = Math.asin(Math.max(-1, Math.min(1, y)))
  const lon = Math.atan2(z, x)
  const e1 = shape === 'box' ? 0.36 : 0.26
  const e2 = shape === 'box' ? 0.36 : 1
  const c = pw(Math.cos(lat), e1)
  let px = c * pw(Math.cos(lon), e2)
  const py = pw(Math.sin(lat), e1)
  let pz = c * pw(Math.sin(lon), e2)
  if (shape === 'cone') {
    const k = 1 - 0.9 * smooth((py + 1) / 2)
    px *= k
    pz *= k
  }
  return [px, py, pz]
}

type Mesh = { positions: Float32Array; index: Uint32Array }
const cache = new Map<string, Mesh>()

/** A ring (the one shape that is not a deformed sphere), facing the viewer. */
function torus(across: number, around: number): Mesh {
  const R = 0.68
  const r = 0.32
  const positions = new Float32Array(across * around * 3)
  const index: number[] = []
  for (let i = 0; i < around; i++) {
    const u = (i / around) * Math.PI * 2
    for (let j = 0; j < across; j++) {
      const v = (j / across) * Math.PI * 2
      const k = (i * across + j) * 3
      positions[k] = (R + r * Math.cos(v)) * Math.cos(u)
      positions[k + 1] = (R + r * Math.cos(v)) * Math.sin(u)
      positions[k + 2] = r * Math.sin(v)
      const a = i * across + j
      const b = ((i + 1) % around) * across + j
      const c = i * across + ((j + 1) % across)
      const d = ((i + 1) % around) * across + ((j + 1) % across)
      index.push(a, b, c, b, d, c)
    }
  }
  return { positions, index: Uint32Array.from(index) }
}

/** Unit-size closed mesh with shared vertices for a shape. */
export function shapeMesh(shape: Shape, detail: number): Mesh {
  const key = `${shape}:${detail}`
  let mesh = cache.get(key)
  if (!mesh) {
    if (shape === 'ring') mesh = torus(detail > 2 ? 12 : 8, detail > 2 ? 28 : 18)
    else {
      const base = icosphere(1, detail)
      const positions = new Float32Array(base.positions.length)
      for (let i = 0; i < positions.length; i += 3) {
        const p = shapePoint(shape === 'disc' ? 'cylinder' : shape, base.positions[i], base.positions[i + 1], base.positions[i + 2])
        positions[i] = p[0]
        positions[i + 1] = p[1]
        positions[i + 2] = p[2]
      }
      mesh = { positions, index: base.index }
    }
    cache.set(key, mesh)
  }
  return mesh
}

/** The body part's rest shape in world units, centred on the origin. */
export function bodyRest(spec: ItemSpec): Mesh & { radius: number; half: Vec3; lift: number } {
  const part = spec.parts[0]
  const R = ITEM_R * spec.size
  const base = shapeMesh(part.shape, 3)
  const positions = new Float32Array(base.positions.length)
  const cs = Math.cos((part.tilt * Math.PI) / 180)
  const sn = Math.sin((part.tilt * Math.PI) / 180)
  for (let i = 0; i < positions.length; i += 3) {
    const x = base.positions[i] * part.scale[0] * R
    const y = base.positions[i + 1] * part.scale[1] * R
    positions[i] = x * cs - y * sn
    positions[i + 1] = x * sn + y * cs
    positions[i + 2] = base.positions[i + 2] * part.scale[2] * R
  }
  const half: Vec3 = [part.scale[0] * R, part.scale[1] * R, part.scale[2] * R]
  // Parts that hang below the body (legs, fins, a base) need the body to rest higher.
  let low = part.scale[1]
  for (const p of spec.parts.slice(1)) low = Math.max(low, p.scale[1] - p.at[1])
  return { positions, index: base.index, radius: Math.max(0.12, (half[0] + half[1] + half[2]) / 3), half, lift: Math.min(1.2, low - part.scale[1]) * R }
}

/** Darker, slightly cooler version of a colour for the shadow side. */
export function shadeOf(hex: string): string {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  c.setHSL((hsl.h + 0.97) % 1, Math.min(1, hsl.s * 1.1 + 0.05), hsl.l * 0.68)
  return `#${c.getHexString()}`
}


/** A unit shape stretched to real half-sizes, with smooth normals (so an ink hull closes at the corners). */
export function solidGeometry(shape: Shape, sx: number, sy: number, sz: number): THREE.BufferGeometry {
  const { positions, index } = shapeMesh(shape, 2)
  const out = new Float32Array(positions.length)
  for (let i = 0; i < out.length; i += 3) {
    out[i] = positions[i] * sx
    out[i + 1] = positions[i + 1] * sy
    out[i + 2] = positions[i + 2] * sz
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(out, 3))
  geo.setIndex(Array.from(index))
  geo.computeVertexNormals()
  return geo
}

const geoCache = new Map<Shape, THREE.BufferGeometry>()
function rigidGeometry(shape: Shape): THREE.BufferGeometry {
  let geo = geoCache.get(shape)
  if (!geo) {
    const { positions, index } = shapeMesh(shape, 2)
    geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setIndex(Array.from(index))
    geo.computeVertexNormals()
    geoCache.set(shape, geo)
  }
  return geo
}

/** A part's colours: its own, and a painted pattern in a second colour. */
export type Paintwork = Pick<Part, 'color' | 'paint' | 'ink'>

/**
 * Every material a toy, a hoop or a goal is drawn with, shared across the stage. There is one shader
 * per kind of surface (a fill per paint pattern, glass, ink, the outlines, a net); a colour or a width
 * is data on a cheap material instance, so nothing new compiles when a toy arrives. `shaders()` lists
 * one material per shader for the stage to draw once while it loads. A model's geometry never changes
 * (its body moves it by matrix), so every toy of a kind shares one, built once.
 */
export type ItemMaterials = {
  /** A part's fill. A `soft` body paints its pattern in rest space, so the pattern turns with the jelly. */
  fill(part: Paintwork, soft?: boolean): THREE.Material
  glass(hex: string): THREE.Material
  ink: THREE.Material
  /** The ink outline, `width` out along the normals in the mesh's own units. */
  hull(width: number): THREE.Material
  /** The ink outline whose width each vertex carries (a model's `outline` attribute). */
  outline: THREE.Material
  net(cells: [number, number]): THREE.Material
  /** A catalog model fitted over `spec`'s body, with its outline widths and normals. */
  model(mesh: ToyMesh, spec: ItemSpec): { geo: THREE.BufferGeometry; box: Box }
  shaders(): THREE.Material[]
  dispose(): void
}

export function createItemMaterials(u: LimUniforms, ink: V3): ItemMaterials {
  const onTop = drawnOnTop()
  const made: THREE.Material[] = []
  const keep = <M extends THREE.Material>(m: M) => (made.push(m), m)
  const colors = (hex: string, inkHex = '#2B2140'): Partial<Drawn> => ({
    base: new THREE.Color(hex),
    shade: new THREE.Color(shadeOf(hex)),
    ink: new THREE.Color(inkHex),
    inkShade: new THREE.Color(shadeOf(inkHex)),
  })
  /** A material that shares `template`'s shader, carrying its own values. */
  const instance = (template: THREE.Material, data: Partial<Drawn>) => {
    // three r187's NodeMaterial.copy reads the deprecated `iridescenceThicknessRange` and warns; a
    // hidden own property shadows it (non-enumerable, so it stays out of the shader's cache key).
    if (!Object.prototype.hasOwnProperty.call(template, 'iridescenceThicknessRange')) Object.defineProperty(template, 'iridescenceThicknessRange', { value: undefined })
    const m = keep(template.clone())
    m.userData = data
    return m
  }
  const fillShaders = new Map<string, THREE.Material>()
  const fillShader = (paint: Paint, soft: boolean) => {
    const key = paint === 'plain' ? 'plain' : `${paint}|${soft}`
    let m = fillShaders.get(key)
    if (!m) {
      const at = (soft ? attribute('rest', 'vec3') : positionLocal) as unknown as V3
      m = keep(toyFill(u, onTop, paint === 'plain' ? undefined : { kind: paint, dir: normalize(at) }))
      m.userData = colors('#FFFFFF')
      fillShaders.set(key, m)
    }
    return m
  }
  const glassShader = u.lit ? keep(glassFill(u, onTop)) : null
  if (glassShader) glassShader.userData = colors('#FFFFFF')
  const inkMat = keep(new THREE.MeshBasicNodeMaterial())
  inkMat.colorNode = ink
  inkMat.vertexNode = nearDepth(onTop)
  const hullShader = keep(hullMaterial(ink, drawnWidth()))
  hullShader.vertexNode = nearDepth(onTop)
  hullShader.userData = { width: 0.016 }
  const outline = keep(hullMaterial(ink, attribute('outline', 'float') as unknown as F))
  outline.vertexNode = nearDepth(onTop)
  const nets = new Map<string, THREE.Material>()

  const fills = new Map<string, THREE.Material>()
  const glasses = new Map<string, THREE.Material>()
  const hulls = new Map<number, THREE.Material>()
  const models = new Map<ToyMesh, { geo: THREE.BufferGeometry; box: Box }>()
  return {
    fill(part, soft = false) {
      const paint = part.paint ?? 'plain'
      const key = `${part.color}|${paint}|${part.ink ?? ''}|${soft && paint !== 'plain'}`
      let m = fills.get(key)
      if (!m) fills.set(key, (m = instance(fillShader(paint, soft), colors(part.color, part.ink))))
      return m
    },
    glass(hex) {
      if (!glassShader) return this.fill({ color: hex })
      let m = glasses.get(hex)
      if (!m) glasses.set(hex, (m = instance(glassShader, colors(hex))))
      return m
    },
    ink: inkMat,
    hull(width) {
      const key = Math.round(width * 1000) / 1000
      let m = hulls.get(key)
      if (!m) hulls.set(key, (m = instance(hullShader, { width: key })))
      return m
    },
    outline,
    net(cells) {
      const key = cells.join('x')
      let m = nets.get(key)
      if (!m) nets.set(key, (m = keep(netMaterial(u, '#FFFFFF', cells))))
      return m
    },
    model(mesh, spec) {
      let shape = models.get(mesh)
      if (!shape) {
        const fitted = fitToyMesh(mesh, spec)
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(fitted, 3))
        geo.setAttribute('rest', new THREE.BufferAttribute(fitted, 3))
        geo.setAttribute('outline', new THREE.BufferAttribute(outlineWidths(mesh, fitted, 0.016), 1))
        geo.setIndex(new THREE.BufferAttribute(mesh.index, 1))
        geo.computeVertexNormals()
        mesh.groups.forEach((g, i) => geo.addGroup(g.start, g.count, i))
        models.set(mesh, (shape = { geo, box: boundsOf(fitted) }))
      }
      return shape
    },
    shaders() {
      for (const paint of PAINTS) for (const soft of [false, true]) fillShader(paint, soft)
      this.net([16, 3])
      this.net([1, 1])
      return [...fillShaders.values(), ...(glassShader ? [glassShader] : []), inkMat, hullShader, outline, ...nets.values()]
    },
    dispose() {
      for (const m of made) m.dispose()
      for (const { geo } of models.values()) geo.dispose()
    },
  }
}

const q = new THREE.Quaternion()
const tiltQ = new THREE.Quaternion()
const Z = new THREE.Vector3(0, 0, 1)
const out: Vec3 = [0, 0, 0]

/**
 * The parts that ride on an item's body (and its eyes). `update` glues them
 * to wherever the soft body is now, turned and stretched with it.
 */
export class ItemExtras {
  readonly group = new THREE.Group()
  private readonly rides: { mesh: THREE.Object3D; rest: Vec3; tilt: number; size: THREE.Vector3 }[] = []

  constructor(spec: ItemSpec, restCentre: Vec3, mats: ItemMaterials) {
    const R = ITEM_R * spec.size
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, part: Pick<Part, 'at' | 'scale' | 'tilt'>, hull: boolean) => {
      const holder = new THREE.Group()
      const mesh = new THREE.Mesh(geo, mat)
      holder.add(mesh)
      if (hull) {
        // Outline width is in the part's local units, so thin parts keep a thin line.
        const mean = (part.scale[0] + part.scale[1] + part.scale[2]) / 3
        holder.add(new THREE.Mesh(geo, mats.hull(Math.min(0.2, 0.016 / (mean * R)))))
      }
      holder.scale.set(part.scale[0] * R, part.scale[1] * R, part.scale[2] * R)
      this.group.add(holder)
      this.rides.push({
        mesh: holder,
        rest: [restCentre[0] + part.at[0] * R, restCentre[1] + part.at[1] * R, restCentre[2] + part.at[2] * R],
        tilt: (part.tilt * Math.PI) / 180,
        size: holder.scale.clone(),
      })
    }
    spec.parts.slice(1).forEach((part) => add(rigidGeometry(part.shape), mats.fill(part), part, true))
    const face = spec.parts[spec.face]
    if (face) {
      const at = spec.face === 0 ? [0, 0, 0] : face.at
      for (const side of [-1, 1]) {
        add(rigidGeometry('ball'), mats.ink, {
          at: [at[0] + side * 0.32 * face.scale[0], at[1] + 0.12 * face.scale[1], at[2] + 0.9 * face.scale[2]],
          scale: [0.1, 0.12, 0.06],
          tilt: 0,
        }, false)
      }
    }
    for (const o of this.group.children) o.traverse((m) => (m.frustumCulled = false))
  }

  update(jelly: Jelly) {
    q.set(...jelly.rotation)
    const s = jelly.scale
    for (const ride of this.rides) {
      jelly.attach(ride.rest, out)
      ride.mesh.position.set(out[0], out[1], out[2])
      ride.mesh.quaternion.copy(q).multiply(tiltQ.setFromAxisAngle(Z, ride.tilt))
      ride.mesh.scale.copy(ride.size).multiplyScalar(s)
    }
  }

  dispose() {
    this.group.removeFromParent()
  }
}

/** An item as a still model at the origin (the toy box's pictures): the same meshes the stage uses, without the physics. */
export function buildItemModel(spec: ItemSpec, mats: ItemMaterials): { group: THREE.Group; dispose(): void } {
  const rest = bodyRest(spec)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(rest.positions, 3))
  geo.setAttribute('rest', new THREE.BufferAttribute(rest.positions, 3))
  geo.setIndex(Array.from(rest.index))
  geo.computeVertexNormals()
  const extras = new ItemExtras(spec, [0, 0, 0], mats)
  extras.update(new Jelly(rest.positions))
  const group = new THREE.Group()
  group.add(new THREE.Mesh(geo, mats.fill(spec.parts[0], true)), new THREE.Mesh(geo, mats.hull(0.016)), extras.group)
  return {
    group,
    dispose() {
      geo.dispose()
    },
  }
}

/** How a toy is drawn on the stage: carried by its soft body every frame, drawn over everything while in hand. */
export interface ToyLook {
  readonly group: THREE.Group
  /** Whether it draws the body's skin, which the stage must then compute (`skinJelly`) each frame. */
  readonly skinned: boolean
  /** `skin` is the body as drawn (`skinJelly`), whatever this look draws from it. */
  update(skin: THREE.BufferGeometry, jelly: Jelly): void
  onTop(on: boolean): void
  dispose(): void
}

type Rest = ReturnType<typeof bodyRest>

/** How much of the particles' own squash a model takes on top of its body's goal shape. */
const WOBBLE = 0.7

/** A part that draws nothing (an outline left off glass). Never compiled, so one serves everywhere. */
const HIDDEN = new THREE.MeshBasicNodeMaterial({ visible: false })

/** In hand: every part of the look draws near the camera (`nearDepth`), in front of everything else. */
function drawOnTop(group: THREE.Group, on: boolean) {
  group.traverse((o) => (o.userData.onTop = on ? 1 : 0))
}

/** The toy as its jelly: the body drawn straight from the skin, the other parts and the eyes riding on it. */
export function jellyLook(spec: ItemSpec, skin: THREE.BufferGeometry, mats: ItemMaterials): ToyLook {
  const mesh = new THREE.Mesh(skin, mats.fill(spec.parts[0], true))
  const hull = new THREE.Mesh(skin, mats.hull(0.016))
  mesh.frustumCulled = hull.frustumCulled = false
  const extras = new ItemExtras(spec, [0, 0, 0], mats)
  const group = new THREE.Group()
  group.add(mesh, hull, extras.group)
  return {
    group,
    skinned: true,
    update(geo, jelly) {
      syncJellyGeometry(geo)
      extras.update(jelly)
    },
    onTop: (on) => drawOnTop(group, on),
    dispose() {
      group.removeFromParent()
      extras.dispose()
    },
  }
}

/**
 * The toy as its Blender model (`toyMesh.ts`), in the same gel and ink: one fill per catalog
 * colour, ink parts in ink, the body's paint where the model has no pattern of its own.
 */
export function modelLook(spec: ItemSpec, model: ToyMesh, rest: Rest, u: LimUniforms, mats: ItemMaterials): ToyLook {
  // The body's turn and squash are the group's matrix (`carryMatrix`).
  const { geo, box } = mats.model(model, spec)
  const body = spec.parts[0]
  const own = (hex: string) => model.groups.some((g) => g.color === hex.toUpperCase())
  // The body's pattern, where the model has no ink of its own to show it.
  const painted = body.ink && own(body.ink) ? { color: body.color } : body
  const fills = model.groups.map((g) => {
    if (isInk(g.color)) return mats.ink
    if (g.glass && u.lit) return mats.glass(g.color)
    return mats.fill(g.color === body.color.toUpperCase() ? { ...painted, color: g.color } : { color: g.color }, true)
  })
  const fill = new THREE.Mesh(geo, fills)
  // Lit glass shows what is behind it, and the hull's far side would show through as ink.
  const hull = new THREE.Mesh(geo, model.groups.map((g) => (g.glass && u.lit ? HIDDEN : mats.outline)))
  fill.frustumCulled = hull.frustumCulled = false
  // The floor is transparent too and sorts nearer the camera, so lit glass must draw after it to show it through.
  if (u.lit && model.groups.some((g) => g.glass)) fill.renderOrder = 1
  const group = new THREE.Group()
  group.matrixAutoUpdate = false
  group.add(fill, hull)
  return {
    group,
    skinned: false,
    update(_skin, jelly) {
      carryMatrix(jelly, box, (jelly.floor ?? -Infinity) - rest.lift, WOBBLE, group.matrix)
      group.matrixWorldNeedsUpdate = true
    },
    onTop: (on) => drawOnTop(group, on),
    dispose() {
      group.removeFromParent()
    },
  }
}
