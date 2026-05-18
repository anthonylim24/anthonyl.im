import { useEffect, useRef } from "react"
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Clock,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three"
import type { RankedPlace } from "./mapModeTypes"
import { lookupPhoto } from "./placePhoto"
import { fetchSatelliteTexture } from "./satelliteTerrain"

interface MapModeSceneProps {
  places: RankedPlace[]
  onSelect: (place: RankedPlace) => void
  selectedId?: string | null
  reducedMotion?: boolean
  onWebglError?: () => void
  // World coordinates of the "YOU" anchor. Used to compute each place's real
  // bearing (angle around YOU) and distance for ring placement. If omitted,
  // bubbles fall back to a synthetic angular layout.
  userLat?: number
  userLng?: number
  // Optional ref the scene writes the live camera yaw into each tick.
  // Consumed by <MapModeCompass> in the overlay so the React tree can
  // rotate the compass without re-rendering on every frame.
  yawRef?: { current: number }
}

export function isWebglSupported(): boolean {
  if (typeof window === "undefined") return false
  try {
    const canvas = document.createElement("canvas")
    const ctx =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    return !!ctx
  } catch {
    return false
  }
}

// Bubble world-radius is now derived from a place's real distance from the
// user (see `distanceToWorldRadius`). Priority still drives bubble size and
// color, but no longer locks a place to a fixed ring.
const BUBBLE_RADIUS_BY_PRIORITY: Record<RankedPlace["priority"], number> = {
  scheduled: 2.0,
  core: 1.55,
  supplemental: 1.3,
}

// All bubbles share the same Y plane. Depth-from-camera comes from camera
// pitch + horizontal offset, not from staggered elevations — keeps YOU as
// the unambiguous geometric center.
const BUBBLE_Y = 1.6

// Inner / outer world-space radii for the bubble placement ring band.
// The CLOSEST visible place always lands on the inner ring; every other
// place sits on a ring proportional to (d / dMin), clamped to the outer
// ring. This keeps the layout legible regardless of how far the user is
// from their day's POIs — a Busan-from-Seoul day with 50 km minimum
// distance composes the same way as a 500 m walking day.
const WORLD_RING_MIN = 6
const WORLD_RING_MAX = 26
// Hard cap on the relative ratio. A place 10× farther than the closest
// gets clamped to the outer ring; anything beyond looks identical.
const MAX_RELATIVE_RATIO = 10

function radiusForRatio(ratio: number): number {
  if (!isFinite(ratio) || ratio < 1) return WORLD_RING_MIN
  if (ratio >= MAX_RELATIVE_RATIO) return WORLD_RING_MAX
  // Linear map [1, MAX_RELATIVE_RATIO] → [WORLD_RING_MIN, WORLD_RING_MAX].
  const t = (ratio - 1) / (MAX_RELATIVE_RATIO - 1)
  return WORLD_RING_MIN + (WORLD_RING_MAX - WORLD_RING_MIN) * t
}

// Decorative concentric rings on the ground plane. Rings are evenly spaced
// between the inner and outer placement radii — they read as "you are
// here" / "nearby" / "farther" bands without committing to specific meter
// values (because the meter scale is now per-day-relative).
const DECORATIVE_RING_RATIOS = [1, 2.5, 5, MAX_RELATIVE_RATIO] as const

// Compute the great-circle bearing (radians, 0 = north, +clockwise) from
// a→b. Used to place each bubble at its REAL geographic direction around
// YOU instead of an arbitrary index-based angle.
function bearingRad(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const φ1 = (aLat * Math.PI) / 180
  const φ2 = (bLat * Math.PI) / 180
  const Δλ = ((bLng - aLng) * Math.PI) / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return Math.atan2(y, x)
}

// Convert a compass bearing (0 = north) to scene-space angle around the Y
// axis. Scene convention: angle 0 places a bubble at (+X, 0, 0); +angle
// rotates CCW when looking down. We map north→-Z and east→+X so the visual
// "up on screen" corresponds to north when the camera yaw is at zero.
function bearingToSceneAngle(bearing: number): number {
  return Math.PI / 2 - bearing
}

// Convert a place's real lat/lng to world XZ in the LINEAR (satellite-
// matching) coordinate system. Bubble world XZ is warped by
// `radiusForRatio` for readability, but the satellite plane is real-
// scale — so the bubble's SHADOW lands at this linear XZ even when the
// bubble itself floats above a different spot. metersPerUnit comes from
// the bubble scale (dMin / WORLD_RING_MIN) so 1 unit ↔ the same meters
// everywhere.
function realWorldXZ(
  userLat: number,
  userLng: number,
  placeLat: number,
  placeLng: number,
  metersPerUnit: number,
): { x: number; z: number } {
  const METERS_PER_DEG_LAT = 111000
  const cosUserLat = Math.cos((userLat * Math.PI) / 180)
  const eastMeters = (placeLng - userLng) * METERS_PER_DEG_LAT * cosUserLat
  const northMeters = (placeLat - userLat) * METERS_PER_DEG_LAT
  return {
    x: eastMeters / metersPerUnit,
    z: -northMeters / metersPerUnit, // north → -Z in our scene convention
  }
}

// Camera distance per viewport. Tuned wider than the previous defaults so
// the trip opens at more of a bird's-eye altitude — the satellite terrain
// reads first, the bubbles second.
function cameraTargetRadiusFor(width: number): number {
  if (width < 360) return 82
  if (width < 480) return 75
  if (width < 768) return 65
  if (width < 1024) return 58
  if (width < 1440) return 52
  return 48
}

// Default camera pitch (radians from horizon). Bumped from ~0.78 (45° down)
// to ~1.05 (60° down) for a more top-down survey view. The user can still
// drag pitch lower for a cinematic angle; this is just the open shot.
const DEFAULT_PITCH = 1.05

type NodeKind = "place" | "cluster" | "member"

interface BubbleNode {
  // Logical kind:
  //   - "place"   → standalone bubble for a single place
  //   - "cluster" → synthetic bubble representing N same-category places
  //   - "member"  → individual place bubble that lives inside a cluster;
  //                 hidden when the parent cluster is collapsed, fanned
  //                 out around the cluster center when it's open
  kind: NodeKind
  // For "cluster" nodes this is members[0].place (used for icon/color
  // fallbacks); the visible label is rebuilt with the count. For "place"
  // and "member" nodes this is the underlying place.
  place: RankedPlace
  outer: Mesh
  innerBillboard: Mesh
  rim: Mesh
  // Dark shadow disc that sits ON the satellite terrain at the place's
  // REAL lat/lng — not directly under the bubble, because the bubble's
  // world position is warped by `radiusForRatio` for layout readability.
  // The shadow is the "pinpoint": it tells the user where the place
  // actually is on the map.
  shadow: Mesh
  // Thin diagonal tether from bubble down to its shadow so the user can
  // visually trace the bubble's floating position to its map pinpoint.
  tether: Line | null
  // The connecting line from YOU at world origin to the bubble.
  // Omitted for "member" nodes — the cluster's line is the visible spoke;
  // members orbit around the cluster center.
  line: Line | null
  basePos: Vector3
  bobOffset: number
  bobAmplitude: number
  label: HTMLDivElement
  entryDelay: number
  bornAt: number
  // Cluster-specific
  clusterId?: string
  members?: BubbleNode[]
  // Member-specific: offset from the cluster center to this member's
  // fan position when the cluster is fully expanded. Per-frame position
  // is `clusterBasePos + fanOffset * openness`.
  parentClusterId?: string
  fanOffset?: Vector3
  // Per-frame cache. Written once during the renderOrder pass and read
  // back by the label z-index pass to avoid re-computing.
  distToCamera?: number
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

// Build a CanvasTexture with a soft circular vignette in the given color so the
// billboard plane inside each orb feels like it's behind glass even before the
// real photo loads.
function makePlaceholderTexture(color: string, icon: string): CanvasTexture {
  const canvas = document.createElement("canvas")
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext("2d")!
  // Radial gradient
  const g = ctx.createRadialGradient(128, 128, 30, 128, 128, 120)
  g.addColorStop(0, color + "ff")
  g.addColorStop(0.7, color + "aa")
  g.addColorStop(1, color + "11")
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(128, 128, 120, 0, Math.PI * 2)
  ctx.fill()
  // Icon emoji
  ctx.font = "120px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.globalAlpha = 0.92
  ctx.fillText(icon, 128, 138)
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  return tex
}

export function MapModeScene({
  places,
  onSelect,
  selectedId,
  reducedMotion,
  onWebglError,
  userLat,
  userLng,
  yawRef: yawRefProp,
}: MapModeSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onWebglErrorRef = useRef(onWebglError)
  onWebglErrorRef.current = onWebglError
  const selectedIdRef = useRef<string | null>(selectedId ?? null)

  useEffect(() => {
    selectedIdRef.current = selectedId ?? null
  }, [selectedId])

  useEffect(() => {
    const mount = mountRef.current
    const overlay = overlayRef.current
    if (!mount || !overlay) return

    // ── Renderer ───────────────────────────────────────────────────
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" })
    } catch (err) {
      console.warn("[map-mode] WebGL unavailable:", err)
      onWebglErrorRef.current?.()
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = SRGBColorSpace
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    const sizeFromMount = () => ({ w: mount.clientWidth, h: Math.max(1, mount.clientHeight) })
    let { w, h } = sizeFromMount()
    renderer.setSize(w, h, false)
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)
    // Pin the canvas to fill the mount exactly. Without explicit CSS dims the
    // canvas falls back to its HTML width/height attributes (which are the
    // drawing buffer in device pixels, e.g. 2x with retina) and overflows the
    // mount, pushing the canvas's geometric center off the viewport center.
    // 100%/100% guarantees canvas center == mount center == viewport center.
    renderer.domElement.style.position = "absolute"
    renderer.domElement.style.top = "0"
    renderer.domElement.style.left = "0"
    renderer.domElement.style.width = "100%"
    renderer.domElement.style.height = "100%"
    renderer.domElement.style.touchAction = "none"
    renderer.domElement.style.display = "block"

    // ── Scene + Camera ─────────────────────────────────────────────
    const scene = new Scene()
    // Distance fog reads as atmospheric depth — far rings, stars, and
    // outer-band bubbles haze toward the backdrop tone so the eye anchors
    // on whatever's closest to YOU. We sample prefers-color-scheme once so
    // light vs dark mode get appropriately tinted fog (warm cream vs deep
    // plum) without having to re-render the scene on theme toggle.
    const prefersDark =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
    const FOG_COLOR = prefersDark ? 0x1d1426 : 0xfde0c6
    scene.fog = new Fog(FOG_COLOR, 35, 130)
    const camera = new PerspectiveCamera(38, w / h, 0.1, 400)

    // CAMERA: target world origin (where YOU lives, via the CSS overlay) so
    // the camera ORBITS around the visual center of the screen. The default
    // is a top-down isometric pitch so bubbles distribute as concentric
    // rings around YOU rather than bunching above. The orbit is user-driven
    // only — no auto-rotate — so the scene stays put unless dragged.
    const cameraTarget = new Vector3(0, 0, 0)
    const camYaw = { current: -Math.PI / 6 }
    const camPitch = { current: DEFAULT_PITCH }
    // Optional target for an animated yaw return (used by the compass
    // "orient north" affordance). Set to a target angle; the tick loop
    // lerps toward it and clears once reached.
    const camYawTarget = { current: null as number | null }
    const camRadius = { current: 90 }
    const camRadiusTarget = { current: cameraTargetRadiusFor(w) }
    // Optional target for an animated pitch shift (used when a place is
    // selected — we tilt toward bird's-eye to make the YOU→destination
    // line read as a flat distance on the satellite). Null when no
    // animation is in flight; manual drag clears it so the user-set
    // pitch sticks.
    const camPitchTarget = { current: null as number | null }

    function applyCamera() {
      const cosP = Math.cos(camPitch.current)
      camera.position.set(
        cameraTarget.x + Math.sin(camYaw.current) * camRadius.current * cosP,
        cameraTarget.y + Math.sin(camPitch.current) * camRadius.current,
        cameraTarget.z + Math.cos(camYaw.current) * camRadius.current * cosP,
      )
      camera.lookAt(cameraTarget)
    }
    applyCamera()

    // ── Lights — slightly more directional contrast to read as "scene
    // with depth" rather than evenly-lit set piece. Ambient dropped, key
    // raised, rim push a bit cooler so silhouettes feel three-dimensional.
    const ambient = new AmbientLight(0xffffff, 0.42)
    scene.add(ambient)
    const hemi = new HemisphereLight(0xfff0d6, 0x1a0e2a, 0.42)
    scene.add(hemi)
    const key = new DirectionalLight(0xfff4e6, 1.35)
    key.position.set(22, 34, 16)
    scene.add(key)
    const rim = new DirectionalLight(0x9bbaf2, 0.78)
    rim.position.set(-18, 12, -16)
    scene.add(rim)

    // ── Starfield background ──────────────────────────────────────
    const starCount = reducedMotion ? 280 : 800
    const starGeom = new BufferGeometry()
    const starPositions = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      const r = 90 + Math.random() * 60
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      starPositions[i * 3 + 1] = r * Math.abs(Math.cos(phi)) * 0.6 + 8
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }
    starGeom.setAttribute("position", new BufferAttribute(starPositions, 3))
    const starMat = new PointsMaterial({
      color: 0xfff5e0,
      size: 0.7,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
      depthWrite: false,
    })
    const stars = new Points(starGeom, starMat)
    scene.add(stars)

    // ── Ground plane + priority rings ─────────────────────────────
    const groundGeom = new CircleGeometry(60, 64)
    const groundMat = new MeshBasicMaterial({ color: 0xffd9c2, transparent: true, opacity: 0.04, depthWrite: false })
    const ground = new Mesh(groundGeom, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.6
    scene.add(ground)

    // Decorative concentric rings — visual reference for the relative
    // distance bands. The innermost ring sits where the closest place will
    // land; outer rings step out at 2.5×, 5×, and 10× the closest distance.
    const ringMeshes: Mesh[] = []
    const ringDefs: { radius: number; color: number; opacity: number }[] = DECORATIVE_RING_RATIOS.map(
      (ratio, i) => ({
        radius: radiusForRatio(ratio),
        // Innermost band is the warmest; outer rings cool toward stone-gray.
        color: i === 0 ? 0xff4d6d : i === 1 ? 0xfb923c : i === 2 ? 0xfbbf24 : 0xa3a3a3,
        opacity: 0.4 - i * 0.06,
      }),
    )
    for (const def of ringDefs) {
      const g = new RingGeometry(def.radius - 0.14, def.radius + 0.14, 96)
      const m = new MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: def.opacity,
        side: DoubleSide,
        depthWrite: false,
      })
      const ring = new Mesh(g, m)
      ring.rotation.x = -Math.PI / 2
      ring.position.y = -0.55
      scene.add(ring)
      ringMeshes.push(ring)
    }

    // ── Center YOU node ───────────────────────────────────────────
    const youGroup = new Group()
    const youCore = new Mesh(
      new SphereGeometry(1.25, 36, 36),
      new MeshStandardMaterial({
        color: 0xff4d6d,
        emissive: 0xff4d6d,
        emissiveIntensity: 0.7,
        metalness: 0.15,
        roughness: 0.25,
      }),
    )
    youGroup.add(youCore)
    const youGlow = new Mesh(
      new SphereGeometry(2.2, 32, 32),
      new MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.22, depthWrite: false }),
    )
    youGroup.add(youGlow)
    const youRing = new Mesh(
      new RingGeometry(2.4, 2.7, 96),
      new MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.55, side: DoubleSide, depthWrite: false }),
    )
    youRing.rotation.x = -Math.PI / 2
    youRing.position.y = -0.55
    youGroup.add(youRing)
    const youRing2 = new Mesh(
      new RingGeometry(3.6, 3.85, 96),
      new MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.3, side: DoubleSide, depthWrite: false }),
    )
    youRing2.rotation.x = -Math.PI / 2
    youRing2.position.y = -0.55
    youGroup.add(youRing2)
    youGroup.position.set(0, 0, 0) // at world origin so it projects to screen center
    scene.add(youGroup)

    // Texture loader (shared)
    const textureLoader = new TextureLoader()
    textureLoader.setCrossOrigin("anonymous")

    // Photo-fetch concurrency limiter. Without this, 30+ bubbles all
    // fire their Wikipedia search in parallel on mount, spiking network
    // and CPU. Four concurrent fetches keeps the queue moving without
    // overwhelming low-end devices.
    const PHOTO_CONCURRENCY = 4
    let activePhotoFetches = 0
    const photoQueue: { queries: string[]; resolve: (url: string | null) => void }[] = []
    function pumpPhotoQueue() {
      while (activePhotoFetches < PHOTO_CONCURRENCY && photoQueue.length > 0) {
        const job = photoQueue.shift()!
        activePhotoFetches++
        // Orb billboards render at ~100 px square inside the glass orb.
        // A 320 px thumbnail is sharp at 2× DPR and keeps each photo
        // under ~80 KB on the wire.
        void lookupPhoto(job.queries, { size: 320 })
          .then((url) => job.resolve(url))
          .catch(() => job.resolve(null))
          .finally(() => {
            activePhotoFetches--
            pumpPhotoQueue()
          })
      }
    }
    function queuePhotoLookup(queries: string[]): Promise<string | null> {
      return new Promise((resolve) => {
        photoQueue.push({ queries, resolve })
        pumpPhotoQueue()
      })
    }

    // ── Bubble nodes (glass orbs with refracted image plane inside) ─
    //
    // Position rules:
    //   - WORLD-RADIUS is RELATIVE to the closest visible place. The closest
    //     bubble lands on the inner ring; every other bubble sits at a
    //     radius proportional to (d / dMin), clamped at 10×. Practical
    //     effect: a Seoul-only day and a Seoul→Busan day both compose with
    //     the closest place near YOU and the furthest at the edge.
    //   - ANGULAR POSITION comes from each place's real geographic bearing
    //     from the user. If the user location is unknown we degrade to a
    //     deterministic index-based angle so bubbles still spread evenly.
    //
    // Bubbles are sorted by priority for stable z-fighting tie-breaks and
    // entry-animation order. Priority no longer pins them to a ring.
    const nodes: BubbleNode[] = []
    const sortedPlaces = [...places].sort((a, b) => {
      const order: Record<RankedPlace["priority"], number> = { scheduled: 0, core: 1, supplemental: 2 }
      return order[a.priority] - order[b.priority]
    })

    // Find the closest place's distance to anchor the relative scale.
    // Places without a distance are treated as far for purposes of dMin
    // (so a single missing-distance place doesn't collapse the layout).
    let dMin = Infinity
    for (const p of sortedPlaces) {
      if (typeof p.distanceMeters === "number" && p.distanceMeters > 0 && p.distanceMeters < dMin) {
        dMin = p.distanceMeters
      }
    }
    if (!isFinite(dMin)) dMin = 1

    // ── Satellite-terrain backdrop. Sits well below the bubble plane so
    // the orbs read as floating above the ground. Sized so the closest
    // place's true geographic distance from YOU corresponds to the inner
    // ring radius — gives a "looking down on the neighborhood" feel.
    //
    // We use ESRI World Imagery (no key, CORS-friendly) and stitch a 3×3
    // tile composite centered on the user, then map it onto a displaced
    // PlaneGeometry so the terrain has subtle relief instead of reading
    // as a flat printed map.
    const METERS_PER_UNIT = dMin / WORLD_RING_MIN
    // Diameter of the satellite plane in world units. Bumped from 3× to
    // 4.5× the outer ring so there's terrain visible past every bubble
    // (no abrupt parchment cut-off near the edge of the view).
    const TERRAIN_PLANE_UNITS = WORLD_RING_MAX * 4.5
    const TERRAIN_BASE_Y = -3.2

    // Shared procedural height function used both for the terrain
    // displacement AND for placing bubble shadows at the right Y so they
    // sit ON the surface of the map (not floating above it). The plane
    // is rotated -π/2 around X, which maps local (px, py) → world
    // (px, h, -py), so the height function takes world XZ in and remaps
    // back to plane-local XY.
    function terrainHeightAt(worldX: number, worldZ: number): number {
      const px = worldX
      const py = -worldZ
      return (
        Math.sin(px * 0.08) * Math.cos(py * 0.08) * 0.9 +
        Math.sin(px * 0.21 + 1.7) * Math.cos(py * 0.17 + 0.4) * 0.45 +
        Math.sin(px * 0.41 + 2.3) * Math.cos(py * 0.37 - 1.2) * 0.22
      )
    }

    // 64×64 segments gives smooth displacement without exploding vertex
    // count for a backdrop element (≈4k verts).
    const terrainGeom = new PlaneGeometry(TERRAIN_PLANE_UNITS, TERRAIN_PLANE_UNITS, 64, 64)
    {
      const pos = terrainGeom.attributes.position as BufferAttribute
      for (let i = 0; i < pos.count; i++) {
        // Plane-local (x, y) maps to world (x, h, -y); flip y to pull the
        // same world XZ that we feed `terrainHeightAt` elsewhere.
        const px = pos.getX(i)
        const py = pos.getY(i)
        pos.setZ(i, terrainHeightAt(px, -py))
      }
      pos.needsUpdate = true
      terrainGeom.computeVertexNormals()
    }
    // Placeholder material until the satellite texture loads.
    const terrainMat = new MeshStandardMaterial({
      color: 0x2a2520,
      roughness: 0.92,
      metalness: 0.0,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    })
    const terrain = new Mesh(terrainGeom, terrainMat)
    terrain.rotation.x = -Math.PI / 2
    terrain.position.y = TERRAIN_BASE_Y
    // Renders before everything else (decorative rings, bubbles, etc.).
    terrain.renderOrder = -10000
    scene.add(terrain)

    // Async fetch + texture swap. Bail silently on network failure — the
    // placeholder color stays put. `terrainCancelled` guards against
    // the cleanup unmounting the scene while the fetch is in flight.
    let terrainCancelled = false
    if (typeof userLat === "number" && typeof userLng === "number") {
      const realSpanMeters = TERRAIN_PLANE_UNITS * METERS_PER_UNIT
      void fetchSatelliteTexture(userLat, userLng, realSpanMeters).then((result) => {
        if (!result || terrainCancelled) return
        // Offset the texture's UV so the user's geographic position lands
        // at the geometric center of the plane.
        const tex = result.texture
        tex.center.set(0.5, 0.5)
        tex.offset.set(result.userU - 0.5, 0.5 - result.userV)
        terrainMat.map = tex
        terrainMat.color.setHex(0xffffff)
        terrainMat.opacity = 0.85
        terrainMat.needsUpdate = true
      })
    }

    // Fallback angle: spread places that share an undefined location evenly
    // around the user. Use a stable seed so the layout doesn't shuffle on
    // re-mount.
    const fallbackSpread = Math.max(1, sortedPlaces.length)
    const haveUserLoc = typeof userLat === "number" && typeof userLng === "number"

    // ── Position pass 1: initial placement from bearing + relative distance.
    interface PlacedPlace {
      place: RankedPlace
      x: number
      z: number
      bubbleRadius: number
    }
    const placed: PlacedPlace[] = sortedPlaces.map((place, i) => {
      const placeDist =
        typeof place.distanceMeters === "number" && place.distanceMeters > 0
          ? place.distanceMeters
          : dMin * MAX_RELATIVE_RATIO
      const ringRadius = radiusForRatio(placeDist / dMin)
      const angle = haveUserLoc
        ? bearingToSceneAngle(bearingRad(userLat as number, userLng as number, place.lat, place.lng))
        : (i / fallbackSpread) * Math.PI * 2
      // Tiny deterministic angular jitter (≈ ±0.3°) so two places with
      // identical lat/lng or perfectly-matching bearings don't share the
      // exact same position — without jitter, repulsion can't pick a
      // separation direction (gradient is zero).
      const jitter = (((i * 2654435761) >>> 0) / 0xffffffff - 0.5) * 0.01
      const a = angle + jitter
      return {
        place,
        x: Math.cos(a) * ringRadius,
        z: -Math.sin(a) * ringRadius,
        bubbleRadius: BUBBLE_RADIUS_BY_PRIORITY[place.priority],
      }
    })

    // ── Cluster detection: group same-category places whose initial
    // positions would visibly overlap. Union-find by pairwise XZ proximity
    // among matching categories. Singletons stay as plain place slots;
    // clusters become a single representative slot at the centroid.
    const CLUSTER_PROXIMITY = 1.45 // (rA + rB) * this → considered overlapping
    const parent = placed.map((_, i) => i)
    function find(x: number): number {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]]
        x = parent[x]
      }
      return x
    }
    function union(a: number, b: number) {
      const ra = find(a)
      const rb = find(b)
      if (ra !== rb) parent[ra] = rb
    }
    for (let a = 0; a < placed.length; a++) {
      for (let b = a + 1; b < placed.length; b++) {
        if (placed[a].place.category !== placed[b].place.category) continue
        const dx = placed[b].x - placed[a].x
        const dz = placed[b].z - placed[a].z
        const minDist = (placed[a].bubbleRadius + placed[b].bubbleRadius) * CLUSTER_PROXIMITY
        if (Math.hypot(dx, dz) < minDist) union(a, b)
      }
    }
    const groupsByRoot = new Map<number, number[]>()
    placed.forEach((_, i) => {
      const root = find(i)
      const list = groupsByRoot.get(root) ?? []
      list.push(i)
      groupsByRoot.set(root, list)
    })

    // ── Layout slots: clusters + singletons. We layout-relax this set
    // (not the individual cluster members) so the map's spacing reflects
    // logical entities the user can click.
    interface LayoutSlot {
      kind: NodeKind
      clusterId?: string
      members?: PlacedPlace[]
      anchor: PlacedPlace
      x: number
      z: number
      bubbleRadius: number
    }
    const slots: LayoutSlot[] = []
    groupsByRoot.forEach((indices, root) => {
      if (indices.length === 1) {
        const p = placed[indices[0]]
        slots.push({
          kind: "place",
          anchor: p,
          x: p.x,
          z: p.z,
          bubbleRadius: p.bubbleRadius,
        })
        return
      }
      // Cluster: centroid of members, slightly enlarged radius so the
      // group orb visually contains a count.
      const members = indices.map((i) => placed[i])
      const cx = members.reduce((s, m) => s + m.x, 0) / members.length
      const cz = members.reduce((s, m) => s + m.z, 0) / members.length
      const baseRadius = Math.max(...members.map((m) => m.bubbleRadius))
      slots.push({
        kind: "cluster",
        clusterId: `cluster-${root}-${members.length}`,
        members,
        anchor: members[0],
        x: cx,
        z: cz,
        bubbleRadius: baseRadius * 1.35,
      })
    })

    // ── Repulsion relaxation, now operating on the slot set. Clusters
    // and singletons all participate; cluster members do NOT (they live
    // INSIDE their cluster's slot).
    const SEPARATION = 1.18
    const RELAX_ITERATIONS = 24
    for (let iter = 0; iter < RELAX_ITERATIONS; iter++) {
      let movedThisIter = false
      for (let a = 0; a < slots.length; a++) {
        for (let b = a + 1; b < slots.length; b++) {
          const A = slots[a]
          const B = slots[b]
          const dx = B.x - A.x
          const dz = B.z - A.z
          const dist = Math.hypot(dx, dz)
          const minDist = (A.bubbleRadius + B.bubbleRadius) * SEPARATION
          if (dist < minDist) {
            const overlap = (minDist - dist) / 2
            let ux: number
            let uz: number
            if (dist < 1e-4) {
              const seed = (((a * 0x9e3779b1) ^ (b * 0x7f4a7c15)) >>> 0) / 0xffffffff
              const theta = seed * Math.PI * 2
              ux = Math.cos(theta)
              uz = Math.sin(theta)
            } else {
              ux = dx / dist
              uz = dz / dist
            }
            A.x -= ux * overlap
            A.z -= uz * overlap
            B.x += ux * overlap
            B.z += uz * overlap
            movedThisIter = true
          }
        }
      }
      if (!movedThisIter) break
    }

    // ── Mesh construction. Walks the slot set (clusters + singletons) and
    // creates the corresponding nodes; cluster members are created as
    // hidden child nodes that fan out around the cluster center when the
    // cluster is opened.
    function buildOrbMesh(opts: {
      place: RankedPlace
      bubbleRadius: number
      x: number
      z: number
      // Pin position = where the place actually sits on the satellite
      // terrain (real geographic XZ). Bubble x/z is warped for layout;
      // pin x/z is the truth. Shadow + tether use the pin.
      pinX: number
      pinZ: number
      isCluster: boolean
      isMember: boolean
      clusterMemberCount: number | null
    }): {
      outer: Mesh
      innerBillboard: Mesh
      rim: Mesh
      line: Line | null
      label: HTMLDivElement
      shadow: Mesh
      tether: Line | null
    } {
      const { place, bubbleRadius, x: bx, z: bz, pinX, pinZ, isCluster, isMember, clusterMemberCount } = opts
      const by = BUBBLE_Y
      const priority = place.priority
      const color = new Color(place.color)

      // Inner image billboard. Sized to fill ~92 % of the orb so the photo
      // is the dominant visual element; the glass shell adds the refraction
      // shimmer at the silhouette, not a full-coverage wash.
      const placeholderTex = makePlaceholderTexture(place.color, place.icon)
      const innerBillboard = new Mesh(
        new CircleGeometry(bubbleRadius * 0.92, 24),
        new MeshBasicMaterial({
          map: placeholderTex,
          transparent: true,
          depthWrite: false,
          // Fog dims the photo with distance — for a photo we want
          // visual fidelity over atmospheric integration.
          fog: false,
        }),
      )
      innerBillboard.position.set(bx, by, bz)
      innerBillboard.userData.placeholderTex = placeholderTex
      scene.add(innerBillboard)

      // Real photo lookup (skipped for clusters — the cluster orb shows the
      // category icon + count, not a single member's photo).
      //
      // Candidate cascade: most-specific → least-specific. We bias toward
      // queries that pin down the place (name + city, name + category) so
      // the MediaWiki search doesn't drift into a same-named place
      // elsewhere in the world.
      if (!isCluster) {
        const base = place.name.split("(")[0].trim()
        const photoQueries = [
          `${base} ${place.city}`,
          `${base} ${place.category} ${place.city}`,
          base,
          place.name,
        ].filter((s, idx, arr) => s && arr.indexOf(s) === idx)
        void queuePhotoLookup(photoQueries).then((url) => {
          if (!url) return
          textureLoader.load(
            url,
            (tex) => {
              tex.colorSpace = SRGBColorSpace
              const mat = innerBillboard.material as MeshBasicMaterial
              // Free the placeholder texture immediately when the real
              // photo arrives — keeps GPU memory flat for long sessions.
              const old = innerBillboard.userData.placeholderTex as CanvasTexture | undefined
              if (old) {
                old.dispose()
                delete innerBillboard.userData.placeholderTex
              }
              mat.map = tex
              mat.needsUpdate = true
            },
            undefined,
            () => {
              /* keep placeholder */
            },
          )
        })
      }

      // ── Outer glass orb. Tuned so the photo inside reads clearly:
      // - Very high transmission + low roughness lets the image come
      //   through the front face without color wash.
      // - Iridescence kept subtle so the fresnel rainbow only fires at
      //   the silhouette (not across the photo).
      // - Attenuation distance pushed long so the bubble color tints
      //   the silhouette but doesn't dye the image at center.
      const outerMat = new MeshPhysicalMaterial({
        color,
        transmission: 0.98,
        thickness: 0.6,
        roughness: 0.08,
        metalness: 0.0,
        ior: 1.45,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
        iridescence: priority === "scheduled" ? 0.22 : 0.12,
        iridescenceIOR: 1.3,
        attenuationColor: color,
        attenuationDistance: 4.0,
        transparent: true,
        opacity: 0.6,
        emissive: color,
        emissiveIntensity: priority === "scheduled" ? 0.08 : 0.04,
        side: DoubleSide,
        depthWrite: true,
      })
      // Sphere segments tuned for the bubble's screen size — at this scale
      // 32×32 (~1k verts) is visually indistinguishable from 56×56 and
      // cuts GPU work by ~3×. With up to ~50 orbs on screen that adds up.
      const outer = new Mesh(new SphereGeometry(bubbleRadius, 32, 32), outerMat)
      outer.position.set(bx, by, bz)
      outer.userData.placeId = place.id
      outer.userData.priority = priority
      outer.userData.isCluster = isCluster
      outer.userData.isMember = isMember
      outer.scale.setScalar(0.001)
      scene.add(outer)

      // Fresnel rim — backside shell with additive emissive at the
      // silhouette. Slightly bigger ring for cluster orbs to suggest mass.
      const rimMat = new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: isCluster ? 0.38 : 0.28,
        side: BackSide,
        depthWrite: false,
        blending: AdditiveBlending,
      })
      const rim = new Mesh(new SphereGeometry(bubbleRadius * (isCluster ? 1.18 : 1.12), 24, 24), rimMat)
      rim.position.set(bx, by, bz)
      rim.scale.setScalar(0.001)
      scene.add(rim)

      // Spoke from YOU. Members don't get their own spoke (the cluster's
      // spoke is the visible one).
      let line: Line | null = null
      if (!isMember) {
        const lineGeom = new BufferGeometry().setFromPoints([
          new Vector3(0, 0.6, 0),
          new Vector3(bx, by, bz),
        ])
        const lineMat = new LineBasicMaterial({
          color: priority === "scheduled" ? 0xff4d6d : priority === "core" ? 0xfb923c : 0x888888,
          transparent: true,
          opacity: priority === "scheduled" ? 0.55 : priority === "core" ? 0.35 : 0.18,
        })
        line = new Line(lineGeom, lineMat)
        scene.add(line)
      }

      // HTML label.
      const distance = place.distanceLabel ?? ""
      const label = document.createElement("div")
      label.dataset.placeId = place.id
      label.style.transform = "translate3d(-9999px, -9999px, 0)"
      label.style.visibility = "hidden"
      label.className = "pointer-events-none absolute left-0 top-0 select-none text-center"
      if (isCluster && clusterMemberCount && clusterMemberCount > 1) {
        label.innerHTML = `
          <div class="-translate-y-2 text-2xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] leading-none">${place.icon}</div>
          <div class="-mt-0.5 inline-flex max-w-[12rem] flex-col items-center gap-0.5 rounded-2xl bg-white/95 px-2 py-1 shadow-md ring-1 ring-stone-200 backdrop-blur-md dark:bg-stone-900/95 dark:ring-stone-700">
            <div class="text-[10px] font-semibold uppercase tracking-wide leading-tight text-stone-900 dark:text-stone-100">
              ${clusterMemberCount} ${escapeHtml(place.category)}s
            </div>
            <div class="rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-widest leading-none" style="background:${place.color}26;color:${place.color};">
              tap to expand
            </div>
          </div>
        `
      } else {
        label.innerHTML = `
          <div class="-translate-y-2 text-2xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] leading-none">${place.icon}</div>
          <div class="-mt-0.5 inline-flex max-w-[11rem] flex-col items-center gap-0.5 rounded-2xl bg-white/92 px-2 py-1 shadow-md ring-1 ring-stone-200 backdrop-blur-md dark:bg-stone-900/92 dark:ring-stone-700">
            <div class="max-w-full truncate text-[10px] font-semibold leading-tight text-stone-900 dark:text-stone-100">
              ${escapeHtml(place.name).length > 22 ? escapeHtml(place.name).slice(0, 21) + "…" : escapeHtml(place.name)}
            </div>
            ${
              distance
                ? `<div class="rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums leading-none" style="background:${place.color}26;color:${place.color};">${distance}</div>`
                : ""
            }
          </div>
        `
      }
      overlay!.appendChild(label)

      // Shadow / pinpoint on the satellite terrain. We compute the
      // surface Y by sampling the same procedural height function the
      // terrain geometry uses, then sit the disc fractionally above it
      // so it doesn't z-fight. The disc itself is colored toward the
      // bubble's category tint with a dark vignette underneath — reads
      // as both "shadow cast by floating orb" AND "map pin for the
      // place's real location".
      const pinY = TERRAIN_BASE_Y + terrainHeightAt(pinX, pinZ) + 0.06
      const shadowMat = new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: isCluster ? 0.62 : 0.5,
        depthWrite: false,
        depthTest: true,
        fog: false,
      })
      const shadow = new Mesh(new CircleGeometry(bubbleRadius * 0.85, 28), shadowMat)
      shadow.rotation.x = -Math.PI / 2
      shadow.position.set(pinX, pinY, pinZ)
      // Sort the shadow between the terrain (very negative renderOrder)
      // and the bubbles (per-frame distance-based renderOrder, near 0).
      shadow.renderOrder = -500
      shadow.scale.setScalar(0.001)
      scene.add(shadow)

      // Tether: thin diagonal line from the bubble down to its pinpoint.
      // Sells the connection between the floating orb and where the
      // place actually sits on the map.
      const tetherGeom = new BufferGeometry().setFromPoints([
        new Vector3(bx, by, bz),
        new Vector3(pinX, pinY, pinZ),
      ])
      const tetherMat = new LineBasicMaterial({
        color,
        transparent: true,
        opacity: isCluster ? 0.4 : 0.32,
        depthWrite: false,
        fog: false,
      })
      const tether = new Line(tetherGeom, tetherMat)
      tether.renderOrder = -400
      scene.add(tether)

      return { outer, innerBillboard, rim, line, label, shadow, tether }
    }

    // Helper: get a place's REAL XZ on the linear satellite plane. Falls
    // back to the bubble's own warped XZ when no user location is known
    // (so the shadow sits directly under the bubble in that case).
    function pinFor(place: RankedPlace, fallbackX: number, fallbackZ: number): { x: number; z: number } {
      if (typeof userLat !== "number" || typeof userLng !== "number") {
        return { x: fallbackX, z: fallbackZ }
      }
      return realWorldXZ(userLat, userLng, place.lat, place.lng, METERS_PER_UNIT)
    }

    let nodeIdx = 0
    slots.forEach((slot) => {
      if (slot.kind === "place") {
        const place = slot.anchor.place
        const pin = pinFor(place, slot.x, slot.z)
        const built = buildOrbMesh({
          place,
          bubbleRadius: slot.bubbleRadius,
          x: slot.x,
          z: slot.z,
          pinX: pin.x,
          pinZ: pin.z,
          isCluster: false,
          isMember: false,
          clusterMemberCount: null,
        })
        nodes.push({
          kind: "place",
          place,
          ...built,
          basePos: new Vector3(slot.x, BUBBLE_Y, slot.z),
          bobOffset: Math.random() * Math.PI * 2,
          bobAmplitude: place.priority === "scheduled" ? 0.4 : 0.28,
          entryDelay: nodeIdx * 0.06,
          bornAt: 0,
        })
        nodeIdx++
        return
      }

      // Cluster slot. Cluster's pinpoint = centroid of its members' real
      // lat/lng positions (in linear world space) — gives a single
      // shadow that visually represents "this neighborhood has X
      // restaurants" without picking an arbitrary member.
      const members = slot.members ?? []
      const clusterId = slot.clusterId ?? `cluster-${nodeIdx}`
      const memberPins = members.map((m) => pinFor(m.place, m.x, m.z))
      const clusterPinX =
        memberPins.reduce((s, p) => s + p.x, 0) / Math.max(1, memberPins.length)
      const clusterPinZ =
        memberPins.reduce((s, p) => s + p.z, 0) / Math.max(1, memberPins.length)
      const built = buildOrbMesh({
        place: slot.anchor.place,
        bubbleRadius: slot.bubbleRadius,
        x: slot.x,
        z: slot.z,
        pinX: clusterPinX,
        pinZ: clusterPinZ,
        isCluster: true,
        isMember: false,
        clusterMemberCount: members.length,
      })
      built.outer.userData.clusterId = clusterId
      const clusterNode: BubbleNode = {
        kind: "cluster",
        place: slot.anchor.place,
        ...built,
        basePos: new Vector3(slot.x, BUBBLE_Y, slot.z),
        bobOffset: Math.random() * Math.PI * 2,
        bobAmplitude: 0.32,
        entryDelay: nodeIdx * 0.06,
        bornAt: 0,
        clusterId,
        members: [],
      }
      nodes.push(clusterNode)
      nodeIdx++

      // Fan radius = enough to space members past the cluster's outline.
      // Members orbit around the cluster's center in a tidy ring.
      const memberRadius = Math.max(...members.map((m) => m.bubbleRadius))
      const fanR = slot.bubbleRadius + memberRadius * 1.45
      members.forEach((m, i) => {
        const a = (i / members.length) * Math.PI * 2 - Math.PI / 2
        const fx = Math.cos(a) * fanR
        const fz = -Math.sin(a) * fanR
        const memberPin = memberPins[i]
        const memberBuilt = buildOrbMesh({
          place: m.place,
          bubbleRadius: m.bubbleRadius,
          x: slot.x,
          z: slot.z,
          pinX: memberPin.x,
          pinZ: memberPin.z,
          isCluster: false,
          isMember: true,
          clusterMemberCount: null,
        })
        memberBuilt.outer.userData.parentClusterId = clusterId
        const memberNode: BubbleNode = {
          kind: "member",
          place: m.place,
          ...memberBuilt,
          basePos: new Vector3(slot.x, BUBBLE_Y, slot.z),
          bobOffset: Math.random() * Math.PI * 2,
          bobAmplitude: 0.2,
          entryDelay: nodeIdx * 0.04,
          bornAt: 0,
          parentClusterId: clusterId,
          fanOffset: new Vector3(fx, 0, fz),
        }
        nodes.push(memberNode)
        clusterNode.members!.push(memberNode)
        nodeIdx++
      })
    })

    // Center YOU label — anchored to viewport center via CSS so it never
    // drifts with the camera. The 3D YOU sphere is the "physical" pin in the
    // scene; this is the user-facing label that always reads as "YOU is here".
    const youLabel = document.createElement("div")
    youLabel.className =
      "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none text-center"
    youLabel.innerHTML = `
      <div class="flex flex-col items-center gap-0.5">
        <div class="text-3xl drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)] leading-none">📍</div>
        <div class="inline-block rounded-full bg-rose-600 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white shadow-lg ring-1 ring-rose-300/60">You</div>
      </div>
    `
    overlay.appendChild(youLabel)

    // ── Selection focus state ─────────────────────────────────────
    // When the user taps a bubble we draw a flat "bird's-eye" line on
    // the satellite plane from YOU (world origin) to the selected
    // place's REAL pinpoint, plus a label at the midpoint showing the
    // distance. Everything else dims so the eye reads the segment
    // unambiguously. The camera rotates so the destination sits toward
    // the top of the screen and pitches more top-down for a clearer
    // map-like reading.
    const SEL_LINE_Y = TERRAIN_BASE_Y + 0.22
    const selectionGroup = new Group()
    selectionGroup.visible = false
    selectionGroup.renderOrder = 2000
    const selLineGeom = new BufferGeometry().setFromPoints([
      new Vector3(0, SEL_LINE_Y, 0),
      new Vector3(0, SEL_LINE_Y, 0),
    ])
    const selLineMat = new LineBasicMaterial({
      color: 0xff4d6d,
      transparent: true,
      opacity: 0.92,
      depthTest: false,
      depthWrite: false,
      fog: false,
    })
    const selLine = new Line(selLineGeom, selLineMat)
    selLine.renderOrder = 2000
    selectionGroup.add(selLine)
    // Wider companion line behind for a soft halo so the route reads
    // crisply against busy satellite imagery.
    const selLineHaloMat = new LineBasicMaterial({
      color: 0xff4d6d,
      transparent: true,
      opacity: 0.32,
      depthTest: false,
      depthWrite: false,
      fog: false,
    })
    const selLineHalo = new Line(selLineGeom.clone(), selLineHaloMat)
    selLineHalo.renderOrder = 1999
    selectionGroup.add(selLineHalo)
    // Pulsing ring at the destination pinpoint — "this is where the
    // selected place actually sits on the map."
    const selPinMat = new MeshBasicMaterial({
      color: 0xff4d6d,
      transparent: true,
      opacity: 0.85,
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
    })
    const selPin = new Mesh(new RingGeometry(0.9, 1.35, 36), selPinMat)
    selPin.rotation.x = -Math.PI / 2
    selPin.renderOrder = 2001
    selectionGroup.add(selPin)
    // Small inner dot at YOU's ground projection so the line clearly
    // starts AT YOU and isn't an orphaned segment floating on the map.
    const selOriginMat = new MeshBasicMaterial({
      color: 0xff4d6d,
      transparent: true,
      opacity: 0.85,
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
    })
    const selOrigin = new Mesh(new RingGeometry(0.4, 0.7, 28), selOriginMat)
    selOrigin.rotation.x = -Math.PI / 2
    selOrigin.position.set(0, SEL_LINE_Y + 0.01, 0)
    selOrigin.renderOrder = 2001
    selectionGroup.add(selOrigin)
    scene.add(selectionGroup)

    // Midpoint distance label.
    const selectionLabel = document.createElement("div")
    selectionLabel.style.transform = "translate3d(-9999px,-9999px,0)"
    selectionLabel.style.visibility = "hidden"
    selectionLabel.className =
      "pointer-events-none absolute left-0 top-0 select-none"
    overlay.appendChild(selectionLabel)

    // ── Raycaster + input ─────────────────────────────────────────
    const raycaster = new Raycaster()
    const pointer = new Vector2()
    let hovered: BubbleNode | null = null
    let pointerDownAt = 0
    let pointerDownPos = { x: 0, y: 0 }
    let dragging = false
    let dragLastX = 0
    let dragLastY = 0

    function setPointerFromEvent(clientX: number, clientY: number) {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
    }

    // Cluster expansion state — lives inside the effect so it resets on
    // every scene rebuild. Drives per-frame member position/scale lerp.
    let expandedClusterId: string | null = null
    // Per-cluster openness (0 collapsed → 1 fully expanded). Stored on
    // the cluster node so we can lerp toward target each frame.
    const clusterOpenness = new Map<string, number>()
    for (const n of nodes) {
      if (n.kind === "cluster" && n.clusterId) clusterOpenness.set(n.clusterId, 0)
    }

    function pickAtPointer(): BubbleNode | null {
      raycaster.setFromCamera(pointer, camera)
      // Hidden cluster members are excluded — when their parent cluster
      // is collapsed, their scale tween is ~0 and they shouldn't intercept
      // clicks even if the geometry is still in the scene.
      const candidates: Mesh[] = []
      for (const n of nodes) {
        if (n.kind === "member" && n.parentClusterId && expandedClusterId !== n.parentClusterId) {
          continue
        }
        candidates.push(n.outer)
      }
      const hits = raycaster.intersectObjects(candidates, false)
      if (!hits.length) return null
      const obj = hits[0].object
      // Cluster-aware lookup: prefer cluster-id match for cluster orbs,
      // member-id match for members, place-id otherwise.
      const clusterId = obj.userData.clusterId as string | undefined
      if (clusterId) return nodes.find((n) => n.kind === "cluster" && n.clusterId === clusterId) ?? null
      const parentClusterId = obj.userData.parentClusterId as string | undefined
      const placeId = obj.userData.placeId as string | undefined
      if (parentClusterId && placeId) {
        return (
          nodes.find(
            (n) => n.kind === "member" && n.place.id === placeId && n.parentClusterId === parentClusterId,
          ) ?? null
        )
      }
      return nodes.find((n) => n.kind === "place" && n.place.id === placeId) ?? null
    }

    function onPointerMove(e: PointerEvent) {
      setPointerFromEvent(e.clientX, e.clientY)
      const node = pickAtPointer()
      hovered = node
      renderer.domElement.style.cursor = node ? "pointer" : dragging ? "grabbing" : "grab"

      if (dragging) {
        const dx = e.clientX - dragLastX
        const dy = e.clientY - dragLastY
        dragLastX = e.clientX
        dragLastY = e.clientY
        camYaw.current -= dx * 0.005
        // Pitch range allows the user to slide between cinematic-low and
        // top-down-isometric views.
        camPitch.current = Math.max(0.18, Math.min(1.25, camPitch.current + dy * 0.004))
        applyCamera()
      }
    }

    function onPointerDown(e: PointerEvent) {
      setPointerFromEvent(e.clientX, e.clientY)
      pointerDownAt = performance.now()
      pointerDownPos = { x: e.clientX, y: e.clientY }
      const node = pickAtPointer()
      if (!node) {
        dragging = true
        dragLastX = e.clientX
        dragLastY = e.clientY
        // Cancel any in-flight compass orient OR selection-reframe
        // animation — manual gesture always wins.
        camYawTarget.current = null
        camPitchTarget.current = null
      }
    }

    function buzz() {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(15)
        } catch {
          /* no-op */
        }
      }
    }

    function onPointerUp(e: PointerEvent) {
      const wasDragging = dragging
      dragging = false
      setPointerFromEvent(e.clientX, e.clientY)
      const dt = performance.now() - pointerDownAt
      const dx = e.clientX - pointerDownPos.x
      const dy = e.clientY - pointerDownPos.y
      const movedFar = Math.hypot(dx, dy) > 6
      if (wasDragging && movedFar) return
      if (dt > 600) return
      const node = pickAtPointer()
      if (!node) {
        // Tap on empty space — collapse any open cluster instead of clearing
        // the selected place. (Selection is handled by the parent.)
        if (expandedClusterId !== null) {
          expandedClusterId = null
        }
        return
      }
      buzz()
      if (node.kind === "cluster" && node.clusterId) {
        // Toggle: clicking the open cluster collapses; clicking another
        // cluster swaps to the new one.
        expandedClusterId = expandedClusterId === node.clusterId ? null : node.clusterId
        return
      }
      // place or member → drill in
      onSelectRef.current(node.place)
    }

    renderer.domElement.addEventListener("pointermove", onPointerMove)
    renderer.domElement.addEventListener("pointerdown", onPointerDown)
    renderer.domElement.addEventListener("pointerup", onPointerUp)
    renderer.domElement.addEventListener("pointerleave", () => {
      dragging = false
    })

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      camRadiusTarget.current = Math.max(20, Math.min(90, camRadiusTarget.current + e.deltaY * 0.07))
    }
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false })

    const onResetView = () => {
      camRadiusTarget.current = cameraTargetRadiusFor(mount.clientWidth)
      camYaw.current = -Math.PI / 6
      camPitch.current = DEFAULT_PITCH
      camYawTarget.current = null
    }
    // Window-level events so the React overlay can fire them from any
    // ancestor without depending on the DOM structure of the scene
    // mount. (Dispatching on `mount`'s parent doesn't reach mount —
    // events don't propagate from parent to child.)
    window.addEventListener("korea-map-reset", onResetView)

    // Compass "orient north" — animate yaw back to 0 (the convention is
    // world -Z = north, and camYaw = 0 places that direction at the top
    // of the screen). The tick loop reads camYawTarget and lerps.
    const onOrientNorth = () => {
      // Pick the equivalent angle nearest the current yaw so we don't
      // spin the long way around.
      const twoPi = Math.PI * 2
      const current = camYaw.current
      let target = 0
      const delta = ((target - current) % twoPi + twoPi + Math.PI) % twoPi - Math.PI
      target = current + delta
      camYawTarget.current = target
    }
    window.addEventListener("korea-map-orient-north", onOrientNorth)

    let pinchDist = 0
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        )
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        )
        if (pinchDist > 0) {
          const scale = pinchDist / d
          camRadiusTarget.current = Math.max(20, Math.min(90, camRadiusTarget.current * scale))
        }
        pinchDist = d
      }
    }
    renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: true })
    renderer.domElement.addEventListener("touchmove", onTouchMove, { passive: true })

    // ── Animation loop ─────────────────────────────────────────────
    const clock = new Clock()
    let running = true
    const sceneStart = performance.now()

    // Reused per-frame scratch buffer + cached canvas rect — eliminates
    // ~3N Vector3 allocs and N getBoundingClientRect calls per frame
    // (where N is the bubble count). Both matter on long sessions.
    const tmpVec3 = new Vector3()
    let cachedRect = renderer.domElement.getBoundingClientRect()

    // Per-tick caches to skip O(N) work when the camera hasn't moved.
    // With ~100 bubbles, the renderOrder sort + billboard.lookAt per
    // frame was a measurable cost when nothing on screen was changing.
    let lastCamX = NaN
    let lastCamY = NaN
    let lastCamZ = NaN
    let lastExpandedClusterId: string | null = null
    // Selection change tracker — used to reframe the camera + populate
    // the selection line once per selection event, not every frame.
    let lastSelectedId: string | null = selectedIdRef.current

    function projectToScreen(v: Vector3): { x: number; y: number; visible: boolean } {
      tmpVec3.copy(v).project(camera)
      return {
        x: ((tmpVec3.x + 1) / 2) * cachedRect.width,
        y: ((-tmpVec3.y + 1) / 2) * cachedRect.height,
        visible: tmpVec3.z > -1 && tmpVec3.z < 1,
      }
    }

    function tick() {
      if (!running) return
      const t = clock.getElapsedTime()
      const sceneT = (performance.now() - sceneStart) / 1000

      if (sceneT < 1.5 && !reducedMotion) {
        const k = easeOutCubic(sceneT / 1.5)
        camRadius.current = 90 + (camRadiusTarget.current - 90) * k
      } else {
        camRadius.current += (camRadiusTarget.current - camRadius.current) * 0.09
      }

      // Yaw ease toward camYawTarget (set by the compass "orient north"
      // affordance OR by a selection reframe). User drag clears the
      // target via the pointer-down handler so the manual gesture wins.
      if (camYawTarget.current !== null) {
        const target = camYawTarget.current
        camYaw.current += (target - camYaw.current) * 0.14
        if (Math.abs(target - camYaw.current) < 1e-3) {
          camYaw.current = target
          camYawTarget.current = null
        }
      }

      // Pitch ease toward camPitchTarget. Same shape as yaw — this is
      // how the selection reframe transitions to a more top-down view
      // and how deselection returns to the open-shot pitch. Cleared
      // once we reach the target so manual drag isn't fought.
      if (camPitchTarget.current !== null) {
        const pt = camPitchTarget.current
        camPitch.current += (pt - camPitch.current) * 0.12
        if (Math.abs(pt - camPitch.current) < 1e-3) {
          camPitch.current = pt
          camPitchTarget.current = null
        }
      }

      // Publish the live yaw to whoever's listening (the React compass).
      if (yawRefProp) yawRefProp.current = camYaw.current

      // ── Selection-change handling. Runs once per selection event,
      // not every frame: builds the YOU→destination line + label,
      // animates the camera to frame the segment, and shrinks the
      // pin/origin markers from 0 so they pop in.
      const curSelected = selectedIdRef.current
      if (curSelected !== lastSelectedId) {
        if (curSelected) {
          const sel = nodes.find(
            (n) =>
              (n.kind === "place" || n.kind === "member") && n.place.id === curSelected,
          )
          if (sel) {
            const pinX = sel.shadow.position.x
            const pinZ = sel.shadow.position.z
            // Update the line geometry to go from origin to the pin.
            // Both line meshes share the geometry buffer; setting once
            // updates both.
            const lpos = selLineGeom.attributes.position as BufferAttribute
            lpos.setXYZ(0, 0, SEL_LINE_Y, 0)
            lpos.setXYZ(1, pinX, SEL_LINE_Y, pinZ)
            lpos.needsUpdate = true
            const hpos = (selLineHalo.geometry as BufferGeometry).attributes
              .position as BufferAttribute
            hpos.setXYZ(0, 0, SEL_LINE_Y, 0)
            hpos.setXYZ(1, pinX, SEL_LINE_Y, pinZ)
            hpos.needsUpdate = true
            selPin.position.set(pinX, SEL_LINE_Y + 0.01, pinZ)
            selectionGroup.visible = true

            // Reframe camera so the line points toward the top of the
            // screen. With the camera orbiting world origin, a place at
            // scene XZ (px, pz) lands at screen-top when the camera
            // yaw = atan2(-px, -pz). Pick the equivalent yaw nearest
            // the current yaw so we don't spin the long way around.
            const targetYaw = Math.atan2(-pinX, -pinZ)
            const twoPi = Math.PI * 2
            const delta =
              (((targetYaw - camYaw.current) % twoPi) + twoPi + Math.PI) % twoPi -
              Math.PI
            camYawTarget.current = camYaw.current + delta
            // Tilt closer to top-down so the line reads as ground
            // distance, not a foreshortened spoke.
            camPitchTarget.current = 1.22
            // Adaptive radius: only zoom OUT if the pin can't fit at
            // the default radius. The perspective camera has 38°
            // vertical FOV (~tan = 0.344), so the visible vertical
            // span at the focus plane is ~2·R·0.344. With YOU at the
            // geometric center and the pin at screen-top, we need
            // R·0.344 ≳ pinDist plus margin. Capped at the global max
            // (90) so very-far pins still trigger the dim + label
            // even when they overflow the frame.
            const defaultR = cameraTargetRadiusFor(w)
            const pinDist = Math.hypot(pinX, pinZ)
            const desiredR = pinDist / (0.344 * 0.62)
            camRadiusTarget.current = Math.min(90, Math.max(defaultR, desiredR))

            // Populate label.
            const distLabel = sel.place.distanceLabel ?? ""
            selectionLabel.innerHTML = distLabel
              ? `
              <div class="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white shadow-lg ring-1 ring-rose-300/60">
                <span aria-hidden>↔</span>
                <span class="tabular-nums">${escapeHtml(distLabel)}</span>
              </div>
            `
              : ""
            selectionLabel.style.visibility = distLabel ? "visible" : "hidden"
          }
        } else {
          // Deselect → fade out the selection visualization and ease
          // pitch back to the survey angle. We keep the user's manual
          // yaw + zoom so deselection doesn't whip the view around.
          selectionGroup.visible = false
          selectionLabel.style.visibility = "hidden"
          camPitchTarget.current = DEFAULT_PITCH
          camRadiusTarget.current = cameraTargetRadiusFor(w)
        }
        lastSelectedId = curSelected
      }

      // No auto-rotate — the scene stays still so YOU stays centered. The
      // camera orbits around YOU only when the user drags.
      applyCamera()

      // Sort transparent bubble parts by camera distance so closer orbs
      // occlude farther ones. We only re-sort when the camera has moved
      // OR a cluster's expansion state changed — distance-from-camera
      // doesn't shift frame-to-frame when neither does, and with ~100
      // bubbles the per-tick cost adds up.
      const cameraMoved =
        Math.abs(camera.position.x - lastCamX) > 1e-3 ||
        Math.abs(camera.position.y - lastCamY) > 1e-3 ||
        Math.abs(camera.position.z - lastCamZ) > 1e-3
      const needsRenderOrderResort = cameraMoved || expandedClusterId !== lastExpandedClusterId
      if (needsRenderOrderResort) {
        for (const n of nodes) {
          const d = camera.position.distanceTo(n.outer.position)
          n.distToCamera = d
          const inExpandedCluster =
            expandedClusterId !== null &&
            (n.parentClusterId === expandedClusterId || n.clusterId === expandedClusterId)
          const focusBoost = inExpandedCluster ? 1000 : 0
          const base = -d + focusBoost
          n.innerBillboard.renderOrder = base - 0.01
          n.outer.renderOrder = base
          n.rim.renderOrder = base + 0.01
        }
        lastExpandedClusterId = expandedClusterId
      }
      lastCamX = camera.position.x
      lastCamY = camera.position.y
      lastCamZ = camera.position.z

      starMat.opacity = 0.7 + Math.sin(t * 0.7) * 0.08

      // YOU pin animation
      const pulse = 1 + Math.sin(t * 2.4) * 0.06
      youCore.scale.setScalar(reducedMotion ? 1 : pulse)
      youGlow.scale.setScalar(reducedMotion ? 1.0 : 1 + Math.sin(t * 1.6) * 0.12)
      ;(youRing.material as MeshBasicMaterial).opacity = reducedMotion ? 0.55 : 0.45 + Math.sin(t * 1.8) * 0.15
      youRing.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(t * 1.4) * 0.08)
      ;(youRing2.material as MeshBasicMaterial).opacity = reducedMotion ? 0.3 : 0.2 + Math.sin(t * 1.1 + 1) * 0.12
      youRing2.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(t * 0.9 + 1) * 0.1)

      ringMeshes.forEach((ring, i) => {
        const mat = ring.material as MeshBasicMaterial
        const base = ringDefs[i].opacity
        mat.opacity = reducedMotion ? base : base + Math.sin(t * 0.8 + i) * 0.05
      })

      // ── Cluster openness lerp. Each cluster eases its 0↔1 openness
      // toward the current target (1 if it's the expanded cluster, else
      // 0). reduced-motion users snap immediately.
      for (const [cid, val] of clusterOpenness) {
        const target = cid === expandedClusterId ? 1 : 0
        if (reducedMotion) {
          clusterOpenness.set(cid, target)
        } else {
          const next = val + (target - val) * 0.18
          clusterOpenness.set(cid, Math.abs(next - target) < 0.001 ? target : next)
        }
      }

      for (const node of nodes) {
        if (node.bornAt === 0 && sceneT >= node.entryDelay) node.bornAt = sceneT

        // ── Member visibility / position: lerp from cluster center
        // (collapsed) to fan position (expanded). Scale follows openness
        // so the orbs grow into existence on expand and shrink to a dot
        // on collapse.
        let openness = 1
        if (node.kind === "member" && node.parentClusterId) {
          openness = clusterOpenness.get(node.parentClusterId) ?? 0
        }
        let memberX = node.basePos.x
        let memberZ = node.basePos.z
        if (node.kind === "member" && node.fanOffset) {
          memberX = node.basePos.x + node.fanOffset.x * openness
          memberZ = node.basePos.z + node.fanOffset.z * openness
          node.outer.position.x = memberX
          node.outer.position.z = memberZ
          node.innerBillboard.position.x = memberX
          node.innerBillboard.position.z = memberZ
          node.rim.position.x = memberX
          node.rim.position.z = memberZ
          // Shadow stays at its pinpoint on the terrain — that's the
          // whole point. The tether is what connects the moving orb to
          // the fixed shadow.
        }

        if (node.bornAt > 0) {
          const sinceBirth = sceneT - node.bornAt
          const k = Math.min(1, sinceBirth / 0.7)
          const baseScale = reducedMotion ? 1 : easeOutBack(k)

          // Cluster shrinks toward the inner ring of its members as it
          // expands — a small "core" remains so the cluster keeps a
          // pickable hit target.
          let kindScale = 1
          if (node.kind === "cluster" && node.clusterId) {
            const o = clusterOpenness.get(node.clusterId) ?? 0
            kindScale = 1 - o * 0.6
          } else if (node.kind === "member") {
            kindScale = openness
          }

          const outerScale = baseScale * kindScale
          node.outer.scale.setScalar(outerScale)
          node.innerBillboard.scale.setScalar(outerScale * 0.95)
          node.rim.scale.setScalar(outerScale * 1.0)
          // Shadow: scale shrinks with the bubble + a touch by bob height
          // so floating-higher reads as "lifting off the ground".
          const shadowScale = Math.max(0, outerScale * (1 - 0.18 * Math.abs(Math.sin(t * 1.3 + node.bobOffset))))
          node.shadow.scale.setScalar(shadowScale)
        }

        const bob = reducedMotion ? 0 : Math.sin(t * 1.3 + node.bobOffset) * node.bobAmplitude
        const cy = node.basePos.y + bob
        node.outer.position.y = cy
        node.innerBillboard.position.y = cy
        node.rim.position.y = cy

        // Billboard always faces camera. lookAt is a matrix recompute
        // per call; with ~100 bubbles we only do it when the camera has
        // actually moved or this orb's own position has shifted (e.g.
        // a cluster member fanning out during expansion).
        if (cameraMoved || node.kind === "member") {
          node.innerBillboard.lookAt(camera.position)
        }

        // ── Focus-dim: cluster-expansion dim AND selection dim both
        // push non-focused bubbles to a low opacity so the user's eye
        // reads the focused subset. Selection dim is stronger so a
        // single picked place really pops against the rest.
        const inExpandedScope =
          expandedClusterId !== null &&
          (node.parentClusterId === expandedClusterId || node.clusterId === expandedClusterId)
        const selId = selectedIdRef.current
        const isSelectedNode =
          selId !== null && node.kind !== "cluster" && node.place.id === selId
        let focusDim = 1
        if (expandedClusterId !== null && !inExpandedScope) focusDim = 0.25
        if (selId !== null && !isSelectedNode) focusDim = Math.min(focusDim, 0.12)

        // Selection emphasis (only effect outer + rim — leave billboard scale alone)
        const rimMat = node.rim.material as MeshBasicMaterial
        if (isSelectedNode) {
          const sel = 1 + Math.sin(t * 4) * 0.08
          node.outer.scale.setScalar(Math.max(node.outer.scale.x, 1.2 * sel))
          node.rim.scale.setScalar(1.35 * sel)
          rimMat.opacity = 0.55 * focusDim
        } else if (hovered && hovered === node) {
          rimMat.opacity = 0.4 * focusDim
        } else {
          rimMat.opacity = (node.kind === "cluster" ? 0.32 : 0.22) * focusDim
        }

        // Outer + billboard opacity follow the dim too. We multiply,
        // not assign, so the underlying material opacity (which sets the
        // glass look) is preserved when nothing is dimmed.
        const outerMat = node.outer.material as MeshPhysicalMaterial
        outerMat.opacity = 0.6 * focusDim
        const billboardMat = node.innerBillboard.material as MeshBasicMaterial
        billboardMat.opacity = focusDim
        const shadowMat = node.shadow.material as MeshBasicMaterial

        // Update line endpoint (members don't own a line — cluster does)
        if (node.line) {
          const positions = node.line.geometry.attributes.position as BufferAttribute
          positions.setXYZ(1, node.outer.position.x, node.outer.position.y, node.outer.position.z)
          positions.needsUpdate = true
        }

        // Update tether: point 0 follows the bubble; point 1 stays
        // pinned to the shadow on the terrain. The tether also dims
        // with the focus state and fades for members of a collapsed
        // cluster (openness 0).
        if (node.tether) {
          const tpos = node.tether.geometry.attributes.position as BufferAttribute
          tpos.setXYZ(0, node.outer.position.x, node.outer.position.y, node.outer.position.z)
          tpos.needsUpdate = true
          const tmat = node.tether.material as LineBasicMaterial
          let tetherOpacity = node.kind === "cluster" ? 0.4 : 0.32
          if (node.kind === "member") tetherOpacity *= openness
          tmat.opacity = tetherOpacity * focusDim
        }

        // Match the shadow's opacity multiplier to the focus dim and
        // member openness, but never drag in the (now-large) base alpha
        // we set at construction.
        let shadowAlpha = node.kind === "cluster" ? 0.62 : 0.5
        if (node.kind === "member") shadowAlpha *= openness
        shadowMat.opacity = shadowAlpha * focusDim

        // Update label position. Member labels only show when their cluster
        // is mostly open; cluster labels fade out as they expand.
        const labelOffsetY =
          node.kind === "cluster"
            ? (node.outer.geometry as SphereGeometry).parameters.radius + 1.2
            : BUBBLE_RADIUS_BY_PRIORITY[node.place.priority] + 1.0
        // Reuse the scratch vector instead of cloning every frame.
        tmpVec3.copy(node.outer.position)
        tmpVec3.y += labelOffsetY
        const { x, y, visible } = projectToScreen(tmpVec3)
        let labelOpacity = 1
        if (node.kind === "cluster" && node.clusterId) {
          labelOpacity = 1 - (clusterOpenness.get(node.clusterId) ?? 0)
        } else if (node.kind === "member") {
          labelOpacity = openness > 0.4 ? (openness - 0.4) / 0.6 : 0
        }
        labelOpacity *= focusDim
        const showLabel = visible && node.bornAt > 0 && labelOpacity > 0.02
        if (showLabel) {
          node.label.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`
          node.label.style.visibility = "visible"
          node.label.style.opacity = labelOpacity.toFixed(2)
          // CSS z-index so the closer label paints over farther ones.
          // Reuse the cached distance computed during the renderOrder pass.
          const dToCamera = node.distToCamera ?? camera.position.distanceTo(node.outer.position)
          const labelZ = Math.max(1, Math.round(10000 - dToCamera * 50))
          node.label.style.zIndex = String(labelZ)
        } else {
          node.label.style.visibility = "hidden"
        }
      }

      // YOU label is anchored to viewport center via static CSS — nothing to
      // project per-frame. Camera moves; YOU stays put visually.

      // ── Selection line + midpoint label position. Updated every
      // frame because the camera may still be lerping toward the
      // reframe targets.
      if (selectionGroup.visible) {
        const sel = nodes.find(
          (n) =>
            (n.kind === "place" || n.kind === "member") &&
            n.place.id === selectedIdRef.current,
        )
        if (sel) {
          const pinX = sel.shadow.position.x
          const pinZ = sel.shadow.position.z
          // Subtle pulse on the destination ring so the eye lands there.
          const pulse = reducedMotion ? 1 : 1 + Math.sin(t * 3.2) * 0.12
          selPin.scale.setScalar(pulse)
          // Midpoint label projection. Lift slightly above the line so
          // depth-sorting against the bubbles behaves sanely.
          tmpVec3.set(pinX / 2, SEL_LINE_Y + 1.2, pinZ / 2)
          const projMid = projectToScreen(tmpVec3)
          if (projMid.visible) {
            selectionLabel.style.transform = `translate3d(${projMid.x.toFixed(1)}px, ${projMid.y.toFixed(1)}px, 0) translate(-50%, -50%)`
            selectionLabel.style.zIndex = "30000"
            selectionLabel.style.opacity = "1"
          } else {
            selectionLabel.style.opacity = "0"
          }
        }
      }

      renderer.render(scene, camera)
      requestAnimationFrame(tick)
    }
    tick()

    const ro = new ResizeObserver(() => {
      const s = sizeFromMount()
      w = s.w
      h = s.h
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      camRadiusTarget.current = cameraTargetRadiusFor(w)
      // Re-cache the canvas rect — projectToScreen reads it every frame.
      cachedRect = renderer.domElement.getBoundingClientRect()
    })
    ro.observe(mount)

    return () => {
      running = false
      terrainCancelled = true
      ro.disconnect()
      window.removeEventListener("korea-map-reset", onResetView)
      window.removeEventListener("korea-map-orient-north", onOrientNorth)
      renderer.domElement.removeEventListener("pointermove", onPointerMove)
      renderer.domElement.removeEventListener("pointerdown", onPointerDown)
      renderer.domElement.removeEventListener("pointerup", onPointerUp)
      renderer.domElement.removeEventListener("wheel", onWheel)
      renderer.domElement.removeEventListener("touchstart", onTouchStart)
      renderer.domElement.removeEventListener("touchmove", onTouchMove)
      for (const node of nodes) {
        node.outer.geometry.dispose()
        ;(node.outer.material as Material).dispose()
        node.innerBillboard.geometry.dispose()
        const im = node.innerBillboard.material as MeshBasicMaterial
        if (im.map) im.map.dispose()
        im.dispose()
        node.rim.geometry.dispose()
        ;(node.rim.material as Material).dispose()
        if (node.line) {
          node.line.geometry.dispose()
          ;(node.line.material as Material).dispose()
        }
        node.shadow.geometry.dispose()
        ;(node.shadow.material as Material).dispose()
        if (node.tether) {
          node.tether.geometry.dispose()
          ;(node.tether.material as Material).dispose()
        }
        node.label.remove()
        const placeholder = node.innerBillboard.userData.placeholderTex as CanvasTexture | undefined
        placeholder?.dispose()
      }
      youLabel.remove()
      youCore.geometry.dispose()
      ;(youCore.material as Material).dispose()
      youGlow.geometry.dispose()
      ;(youGlow.material as Material).dispose()
      youRing.geometry.dispose()
      ;(youRing.material as Material).dispose()
      youRing2.geometry.dispose()
      ;(youRing2.material as Material).dispose()
      ringMeshes.forEach((r) => {
        r.geometry.dispose()
        ;(r.material as Material).dispose()
      })
      selLineGeom.dispose()
      ;(selLineHalo.geometry as BufferGeometry).dispose()
      selLineMat.dispose()
      selLineHaloMat.dispose()
      selPin.geometry.dispose()
      selPinMat.dispose()
      selOrigin.geometry.dispose()
      selOriginMat.dispose()
      selectionLabel.remove()
      starGeom.dispose()
      starMat.dispose()
      groundGeom.dispose()
      groundMat.dispose()
      terrainGeom.dispose()
      if (terrainMat.map) terrainMat.map.dispose()
      terrainMat.dispose()
      renderer.dispose()
      try {
        mount.removeChild(renderer.domElement)
      } catch {
        /* already removed */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, reducedMotion, userLat, userLng])

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={mountRef} className="absolute inset-0" />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-10" aria-hidden />
    </div>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
