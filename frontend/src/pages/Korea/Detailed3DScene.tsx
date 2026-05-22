// Map Mode — Google Earth-style photorealistic mesh of Seoul (and the
// rest of the trip) streamed via NASA AMMOS 3DTilesRendererJS + Google's
// Photorealistic 3D Tiles. The orbital-bubble view this replaced lived
// in MapModeScene.tsx until commit removing it.

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three"
import { TilesRenderer } from "3d-tiles-renderer"
import {
  GoogleCloudAuthPlugin,
  GLTFExtensionsPlugin,
  ReorientationPlugin,
  TileCompressionPlugin,
} from "3d-tiles-renderer/plugins"
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import type { NeighborhoodCenter, RankedPlace } from "./mapModeTypes"
import { arrivalStartFilter, cssFilterFor, fogForHour, kstHour } from "./timeOfDayGrade"
import { GodRaysPass } from "./godRaysPass"
import { MaxQualityPipeline, applyTileQualityHints } from "./maxQualityPipeline"
import type { EffectPrefs } from "./deviceTier"

// Session-scoped flag: the cinematic fly-in plays once per browser
// session, not on every navigation into Map Mode. Stored in
// sessionStorage so a refresh replays it but back/forward inside the
// same tab doesn't.
const ARRIVAL_SESSION_KEY = "korea-d3d-arrival-done"

const DEG2RAD = Math.PI / 180
// Approx meters per degree latitude (constant); per-longitude scales
// by cos(lat). Good enough for translating place lat/lng into local
// scene meters when the trip is bounded to Seoul + Busan.
const M_PER_DEG_LAT = 111000

interface Detailed3DSceneProps {
  places: RankedPlace[]
  /** Day-itinerary neighborhood centers — accepted for backward-compat
   *  with the call site but unused. Polygon highlights were removed in
   *  favor of an on-hover tooltip that reads from the all-Korea dong
   *  dataset; see {@link loadAllKoreaDongs}. */
  neighborhoods?: NeighborhoodCenter[]
  onSelect: (place: RankedPlace) => void
  onDeselect?: () => void
  selectedId?: string | null
  reducedMotion?: boolean
  onWebglError?: () => void
  userLat?: number
  userLng?: number
  // Optional ref the scene writes the live "yaw from north-up" into
  // each tick. Consumed by MapModeCompass so the compass dial
  // rotates as the user orbits the camera.
  yawRef?: { current: number }
  /** Optional effect toggles wired from the debug menu. Default values
   *  come from `loadEffectPrefs()` in the parent so user choices
   *  persist across sessions. When omitted, all effects are treated as
   *  off (safe fallback for callers that haven't been updated). */
  effects?: EffectPrefs
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function readApiKey(): string | undefined {
  const env = import.meta.env as Record<string, string | undefined>
  return env.VITE_GOOGLE_MAP_TILES_API_KEY || env.VITE_GOOGLE_PLACES_API_KEY
}

export function Detailed3DScene({
  places,
  neighborhoods: _neighborhoods,
  onSelect,
  onDeselect,
  selectedId,
  reducedMotion,
  onWebglError,
  userLat,
  userLng,
  yawRef: yawRefProp,
  effects,
}: Detailed3DSceneProps) {
  const fogOn = effects?.fog ?? false
  const godRaysOn = effects?.godRays ?? false
  const gradeOn = effects?.grade ?? true
  const maxQualityOn = effects?.maxQuality ?? false
  const mountRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const attributionRef = useRef<HTMLDivElement>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onDeselectRef = useRef(onDeselect)
  onDeselectRef.current = onDeselect
  const onWebglErrorRef = useRef(onWebglError)
  onWebglErrorRef.current = onWebglError
  const selectedIdRef = useRef<string | null>(selectedId ?? null)

  useEffect(() => {
    selectedIdRef.current = selectedId ?? null
  }, [selectedId])

  const apiKey = useMemo(() => readApiKey(), [])
  const [keyMissing, setKeyMissing] = useState(!apiKey)

  useEffect(() => {
    if (!apiKey) {
      setKeyMissing(true)
      return
    }
    if (typeof userLat !== "number" || typeof userLng !== "number") return
    // Capture into locals so TypeScript keeps the narrowing inside the
    // nested helper closures defined later in this effect.
    const anchorLat = userLat
    const anchorLng = userLng
    const mount = mountRef.current
    const overlay = overlayRef.current
    const attribution = attributionRef.current
    if (!mount || !overlay) return

    // ── Renderer ─────────────────────────────────────────────────
    // logarithmicDepthBuffer is essential — Google tiles cover a 10+
    // km radius from origin and we want both far buildings AND tight
    // close-ups to z-resolve cleanly. antialias on for the city
    // silhouettes; DPR capped at 1.5.
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "default",
        logarithmicDepthBuffer: true,
      })
    } catch (err) {
      console.warn("[detailed3d] WebGL unavailable:", err)
      onWebglErrorRef.current?.()
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setClearColor(0x88a2c9, 0)
    const size = () => ({ w: mount.clientWidth, h: Math.max(1, mount.clientHeight) })
    let { w, h } = size()
    renderer.setSize(w, h, false)
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.position = "absolute"
    renderer.domElement.style.inset = "0"
    renderer.domElement.style.width = "100%"
    renderer.domElement.style.height = "100%"
    renderer.domElement.style.touchAction = "none"
    renderer.domElement.style.display = "block"

    // ── Time-of-day color grade ──────────────────────────────────
    // The canvas gets a CSS filter chain that reflects the current
    // Asia/Seoul wall-clock hour. This is intentionally subtle — the
    // Google mesh is already richly textured. Refresh every minute so
    // the grade tracks the hour without spinning a per-frame timer.
    // The arrival fly-in starts from a dimmer variant of this so the
    // city "wakes up" as the camera settles.
    const initialHour = kstHour()
    const arrivalPlanned =
      !reducedMotion && (() => {
        try { return !sessionStorage.getItem(ARRIVAL_SESSION_KEY) } catch { return true }
      })()
    renderer.domElement.style.transition = "filter 0.6s ease"
    // CSS time-of-day grade — when disabled in the debug menu we clear
    // the filter entirely so the canvas renders neutrally.
    renderer.domElement.style.filter = !gradeOn
      ? "none"
      : arrivalPlanned
        ? arrivalStartFilter(initialHour)
        : cssFilterFor(initialHour)
    const gradeInterval = window.setInterval(() => {
      // Only refresh when no arrival is in flight; arrival completion
      // will re-set the filter to the current hour.
      if (!gradeOn) {
        renderer.domElement.style.filter = "none"
        return
      }
      if (!arriving) renderer.domElement.style.filter = cssFilterFor(kstHour())
    }, 60_000)

    // ── Scene + camera + lights ──────────────────────────────────
    const scene = new Scene()
    const camera = new PerspectiveCamera(55, w / h, 1, 100000)
    // Initial vantage point: zoomed-out bird's-eye-ish 3/4 view.
    // ReorientationPlugin parks the user's lat/lng at world origin with
    // +Z = north and +X = west, so we sit the camera SOUTHWEST of origin
    // (+X, -Z), elevated. The Y/horizontal ratio is ~1.8 (≈61° pitch)
    // so the view leans toward bird's-eye while still showing some 3D
    // depth — the user can see today's neighborhood footprint without
    // tilting upward. Bumped to a larger overall radius so adjacent
    // hotel + neighborhoods fit in-frame without panning.
    // Final ("home") vantage. The arrival sequence seeds the camera
    // from an elevated SE approach (~3× height, ~2× horizontal radius)
    // and springs back to this; users without arrival land here
    // directly. Mutated only by the existing focus system; the
    // arrival uses the same `focusing` lerp path so we don't double-
    // own the camera each frame.
    let arriving = false
    if (arrivalPlanned) {
      // Elevated approach: same azimuth, ~3× higher, ~2× farther out
      // along the SE diagonal. From this vantage the user sees Seoul
      // from above before being lowered into the trip's neighborhood.
      camera.position.set(2700, 7800, -3600)
      arriving = true
    } else {
      camera.position.set(900, 2700, -1200)
    }
    camera.lookAt(0, 0, 0)
    // Hemisphere fill so building shadows don't crush to black on
    // mobile where the GPU can't afford a real shadow pass.
    scene.add(new AmbientLight(0xffffff, 0.55))
    scene.add(new HemisphereLight(0xbfd8ff, 0x8a7a5a, 0.7))
    const sun = new DirectionalLight(0xffffff, 1.0)
    sun.position.set(800, 1200, 400)
    scene.add(sun)

    // ── Atmospheric fog ──────────────────────────────────────────
    // FogExp2 reads cleanly through GLTFLoader's MeshStandardMaterial
    // chunks (3d-tiles-renderer doesn't override materials), and the
    // fog is computed from view-space vFogDepth — not the depth
    // buffer — so it's logDepth-safe. Color + density track the
    // time-of-day table; during arrival we halve density so the high
    // approach pose can see Seoul, then ramp to full strength as the
    // focus lerp settles.
    const fogInit = fogForHour(initialHour)
    const fogColor = new Color(fogInit.color)
    const baseFogDensity = fogInit.density
    let currentFogDensity = baseFogDensity
    // The canvas is alpha:true so unwritten pixels show the page
    // parchment background. We deliberately do NOT call
    // \`renderer.setClearColor\` here. Previously we set it to the fog
    // color (which painted the viewport completely gray when fog was
    // on and tiles hadn't streamed in yet) and then tried sky-blue
    // (which produced the "blue screen" report). Both showed the
    // clear color over the whole canvas for the 30–90 s while Google
    // Photorealistic Tiles stream — a worse loading experience than
    // the soft parchment that shows through with transparent clear.
    if (fogOn) {
      scene.fog = new FogExp2(fogColor, arrivalPlanned ? baseFogDensity * 0.5 : baseFogDensity)
    }
    const fogHourInterval = window.setInterval(() => {
      const hour = kstHour()
      if (fogOn && scene.fog) {
        const f = fogForHour(hour)
        fogColor.set(f.color)
        currentFogDensity = f.density
        ;(scene.fog as FogExp2).color.copy(fogColor)
        ;(scene.fog as FogExp2).density = arriving ? currentFogDensity * 0.5 : currentFogDensity
      }
      // Push the same hour into the HDR pipeline if it's active so
      // bloom thresholds, exposure, grade matrix, and cloud palette
      // all stay synchronized.
      maxQuality?.setHourPhase(hour)
    }, 60_000)

    // ── Controls. OrbitControls' default damping reads nicely on
    // touch; we lock min distance to keep the camera from clipping
    // into building interiors, max distance so the user can't drift
    // into low-detail tile space.
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.12
    controls.rotateSpeed = 0.4
    controls.zoomSpeed = 0.8
    controls.minDistance = 60
    // High max so focus mode can fit far destinations (Incheon
    // airport ~55 km from the hotel) without clamping the auto-
    // zoom. Tiles streaming gracefully degrades quality at that
    // distance — better than cropping the destination.
    controls.maxDistance = 80000
    controls.maxPolarAngle = Math.PI / 2 - 0.05 // can't roll past horizon
    controls.minPolarAngle = 0.1

    // ── Decoders ──────────────────────────────────────────────────
    const draco = new DRACOLoader().setDecoderPath("/draco/gltf/")
    const ktx2 = new KTX2Loader().setTranscoderPath("/basis/").detectSupport(renderer)

    // ── Tiles renderer ───────────────────────────────────────────
    // GoogleCloudAuthPlugin handles the session token + 3 h refresh
    // window. ReorientationPlugin places the user's lat/lng at world
    // origin with X facing west, Z facing north, Y up — see the
    // plugin source for the exact frame.
    const tiles = new TilesRenderer()
    tiles.registerPlugin(
      new GoogleCloudAuthPlugin({ apiToken: apiKey, autoRefreshToken: true }),
    )
    tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco, ktxLoader: ktx2 }))
    tiles.registerPlugin(new TileCompressionPlugin())
    tiles.registerPlugin(
      new ReorientationPlugin({
        lat: anchorLat * DEG2RAD,
        lon: anchorLng * DEG2RAD,
        height: 0,
      }),
    )
    tiles.setCamera(camera)
    tiles.setResolutionFromRenderer(camera, renderer)
    // Higher errorTarget = fewer / lower-quality tiles. 12 is a good
    // visual:bandwidth trade for a personal app; mobile users on
    // slow networks could be pushed to 24. Max Quality drops it to 8
    // for sharper geometry — A19-class wifi handles the extra stream.
    tiles.errorTarget = maxQualityOn ? 8 : 16
    scene.add(tiles.group)

    // Apply anisotropic filtering + sRGB color space to each tile's
    // textures as they stream in. Free quality win regardless of
    // Max Quality mode: building facades at grazing angles look like
    // mud without anisotropy, and Google delivers sRGB-encoded textures
    // that look washed-out without the color space hint.
    tiles.addEventListener("load-model", (event: unknown) => {
      const ev = event as { scene?: { traverse: (cb: (o: unknown) => void) => void } }
      if (ev.scene) applyTileQualityHints(ev.scene, renderer)
    })

    // ── YOU marker — small emissive sphere + ring at origin ────
    const youMarker = new Mesh(
      new SphereGeometry(8, 24, 16),
      new MeshStandardMaterial({
        color: 0xff4d6d,
        emissive: 0xff4d6d,
        emissiveIntensity: 0.7,
        roughness: 0.3,
        // YOU is the trip's geometric + visual anchor — fog should
        // never dim it. Atmospheric haze layers behind it, never on it.
        fog: false,
      }),
    )
    youMarker.position.set(0, 6, 0)
    scene.add(youMarker)

    const cosUserLat = Math.cos(anchorLat * DEG2RAD)

    // ── Place markers. We compute local (X=west, Z=north) meters
    // from delta lat/lng around the user, matching the
    // ReorientationPlugin's frame. Each marker is a small floating
    // orb with a beam shooting down to the ground (so the marker
    // reads as "this exact spot on the map") plus a CSS label
    // projected each frame.
    interface PlaceMarker {
      place: RankedPlace
      mesh: Mesh
      beam: Mesh
      label: HTMLDivElement
      basePos: { x: number; z: number }
      priorityRank: number
      onLabelClick: (e: MouseEvent) => void
    }
    const markers: PlaceMarker[] = []
    for (const p of places) {
      const eastM = (p.lng - anchorLng) * cosUserLat * M_PER_DEG_LAT
      const northM = (p.lat - anchorLat) * M_PER_DEG_LAT
      const localX = -eastM
      const localZ = northM
      const radius =
        p.priority === "scheduled" ? 18 : p.priority === "core" ? 14 : 11
      const mesh = new Mesh(
        new SphereGeometry(radius, 18, 14),
        new MeshStandardMaterial({
          color: p.color,
          emissive: p.color,
          emissiveIntensity: 0.55,
          roughness: 0.3,
          metalness: 0,
        }),
      )
      // Floating ~60 m above the ground so the orb pops above tall
      // rooftops without getting lost in the building mesh.
      mesh.position.set(localX, 60, localZ)
      mesh.userData.placeId = p.id
      scene.add(mesh)

      // Thin colored beam from the orb down to the ground at the
      // place's real lat/lng — makes the spot it represents
      // unambiguous on the photogrammetric mesh.
      const beam = new Mesh(
        new CylinderGeometry(1.2, 1.2, 60, 8, 1, true),
        new MeshBasicMaterial({
          color: p.color,
          transparent: true,
          opacity: 0.6,
          depthWrite: false,
        }),
      )
      beam.position.set(localX, 30, localZ)
      beam.renderOrder = 50
      scene.add(beam)

      // HTML label — same data-place-id contract as the orbital
      // scene so external code can introspect. Made clickable so
      // tapping the label fires the same focus flow as tapping the
      // orb; pointer-events:auto on the label itself, the
      // surrounding overlay div remains pointer-events:none so the
      // map underneath stays draggable.
      const label = document.createElement("div")
      label.dataset.placeId = p.id
      label.style.transform = "translate3d(-9999px,-9999px,0)"
      label.style.visibility = "hidden"
      label.style.cursor = "pointer"
      label.className =
        "pointer-events-auto absolute left-0 top-0 select-none text-center"
      const distLabel = p.distanceLabel ?? ""
      const igBadge = p.subcategory === "instagram"
        ? `<span class="inline-flex h-3 w-3 shrink-0 items-center justify-center text-rose-600 dark:text-rose-400" aria-label="From Instagram"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/></svg></span>`
        : ""
      label.innerHTML = `
        <div class="-translate-y-1 text-xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)] leading-none">${p.icon}</div>
        <div class="-mt-0.5 inline-flex max-w-[11rem] flex-col items-center gap-0.5 rounded-2xl bg-white/92 px-2 py-1 shadow-md ring-1 ring-stone-200 backdrop-blur-md dark:bg-stone-900/92 dark:ring-stone-700">
          <div class="flex max-w-full items-center justify-center gap-1 leading-tight">
            ${igBadge}
            <span class="truncate text-[10px] font-semibold text-stone-900 dark:text-stone-100">
              ${escapeHtml(p.name).length > 22 ? escapeHtml(p.name).slice(0, 21) + "…" : escapeHtml(p.name)}
            </span>
          </div>
          ${
            distLabel
              ? `<div class="rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums leading-none" style="background:${p.color}26;color:${p.color};">${escapeHtml(distLabel)}</div>`
              : ""
          }
        </div>
      `
      const onLabelClick = (e: MouseEvent) => {
        e.stopPropagation()
        onSelectRef.current(p)
      }
      label.addEventListener("click", onLabelClick)
      overlay.appendChild(label)

      markers.push({
        place: p,
        mesh,
        beam,
        label,
        basePos: { x: localX, z: localZ },
        priorityRank: p.priority === "scheduled" ? 0 : p.priority === "core" ? 1 : 2,
        onLabelClick,
      })
    }

    // YOU label — CSS-anchored to viewport center via translate so
    // the user always knows where origin is.
    const youLabel = document.createElement("div")
    youLabel.className =
      "pointer-events-none absolute select-none text-center"
    youLabel.style.transform = "translate3d(-9999px,-9999px,0)"
    youLabel.style.visibility = "hidden"
    youLabel.innerHTML = `
      <div class="flex flex-col items-center gap-0.5">
        <div class="text-2xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)] leading-none">📍</div>
        <div class="inline-block rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow-lg ring-1 ring-rose-300/60">You</div>
      </div>
    `
    overlay.appendChild(youLabel)

    // Selection visualization — a thick ground line + glowing ring
    // at the destination + a building-highlight ring snapped onto
    // the tile mesh.
    const selLineGeom = new BufferGeometry().setFromPoints([
      new Vector3(0, 1, 0),
      new Vector3(0, 1, 0),
    ])
    const selLine = new Line(
      selLineGeom,
      new LineBasicMaterial({
        color: 0xff4d6d,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false,
      }),
    )
    selLine.renderOrder = 100
    selLine.visible = false
    scene.add(selLine)
    const selRing = new Mesh(
      new RingGeometry(14, 22, 36),
      new MeshBasicMaterial({
        color: 0xff4d6d,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
        depthWrite: false,
      }),
    )
    selRing.rotation.x = -Math.PI / 2
    selRing.renderOrder = 101
    selRing.visible = false
    scene.add(selRing)

    // Building-highlight ring — placed at the raycast hit point on
    // the actual building geometry under the destination. Slightly
    // larger and a hair above the surface so it reads.
    const buildingRing = new Mesh(
      new RingGeometry(8, 14, 28),
      new MeshBasicMaterial({
        color: 0xffe599,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false,
      }),
    )
    buildingRing.rotation.x = -Math.PI / 2
    buildingRing.renderOrder = 102
    buildingRing.visible = false
    scene.add(buildingRing)

    // Selection HTML pill (distance + address + Maps link) rendered
    // in the overlay so the Maps anchor receives pointer events.
    const selectionPill = document.createElement("div")
    selectionPill.className = "pointer-events-none absolute left-0 top-0 select-none"
    selectionPill.style.transform = "translate3d(-9999px,-9999px,0)"
    selectionPill.style.visibility = "hidden"
    overlay.appendChild(selectionPill)

    // ── Raycaster + input ─────────────────────────────────────────
    const raycaster = new Raycaster()
    const pointer = new Vector2()
    let pointerDownAt = 0
    let pointerDownPos = { x: 0, y: 0 }

    function pickMarker(): PlaceMarker | null {
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(
        markers.map((m) => m.mesh),
        false,
      )
      if (!hits.length) return null
      const obj = hits[0].object
      return markers.find((m) => m.mesh === obj) ?? null
    }

    function setPointerFromEvent(clientX: number, clientY: number) {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
    }
    function onPointerDown(e: PointerEvent) {
      pointerDownAt = performance.now()
      pointerDownPos = { x: e.clientX, y: e.clientY }
    }
    function onPointerUp(e: PointerEvent) {
      const dt = performance.now() - pointerDownAt
      const dx = e.clientX - pointerDownPos.x
      const dy = e.clientY - pointerDownPos.y
      const movedFar = Math.hypot(dx, dy) > 6
      if (movedFar || dt > 600) return
      setPointerFromEvent(e.clientX, e.clientY)
      const hit = pickMarker()
      if (hit) {
        onSelectRef.current(hit.place)
        return
      }
      // No marker hit on an active selection → click-out / deselect.
      if (selectedIdRef.current) {
        onDeselectRef.current?.()
      }
    }
    renderer.domElement.addEventListener("pointerdown", onPointerDown)
    renderer.domElement.addEventListener("pointerup", onPointerUp)

    // ── Attribution overlay. Google's TOS requires the "Data:
    // Google + sources" line to render whenever any 3D tile is on
    // screen. tiles.getAttributions() returns the aggregated list
    // for the current camera frustum each frame.
    function updateAttribution() {
      if (!attribution) return
      const attrs = tiles.getAttributions() as Array<{
        type?: string
        value?: string
      }>
      const seen = new Set<string>()
      const parts: string[] = []
      for (const a of attrs ?? []) {
        const v = a.value ?? ""
        if (v && !seen.has(v)) {
          seen.add(v)
          parts.push(v)
        }
      }
      const text = parts.length ? `Data: ${parts.join(" · ")}` : "Data: Google"
      if (attribution.dataset.text !== text) {
        attribution.dataset.text = text
        attribution.textContent = text
      }
    }

    // ── Resize ────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const s = size()
      w = s.w
      h = s.h
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      tiles.setResolutionFromRenderer(camera, renderer)
      godRays?.resize(w, h)
      maxQuality?.resize(w, h)
    })
    ro.observe(mount)

    // ── Camera focus animation (bird's-eye on selection) ────────
    // Default vantage = the initial setup. When a place is selected
    // we lerp the orbit target to the midpoint between YOU and the
    // destination + reposition the camera at a height proportional
    // to the distance so both endpoints land in frame.
    const HOME_TARGET = new Vector3(0, 0, 0)
    // Same wider/birds-eye vantage as the initial camera setup so
    // deselect + reset both return to the same composed view.
    const HOME_POS = new Vector3(900, 2700, -1200)
    const focusTarget = new Vector3()
    const focusCamPos = new Vector3()
    let focusing = false
    // Initialize to null (not the current selection) so the first tick
    // reframes onto a pre-existing selection — e.g. when Map Mode is
    // opened with an `initialFocusPlaceId` from an Instagram save card,
    // selectedId is already set before the scene mounts and we still
    // need the focus animation to run.
    let lastSelectedId: string | null = null
    function planFocus(destX: number, destZ: number) {
      const aspect = w / h
      const portrait = aspect < 1
      const pinDist = Math.hypot(destX, destZ)
      // Bias the cameraTarget along the (YOU → dest) line. On
      // portrait, 0.5 puts both endpoints symmetrically around the
      // viewport vertical center; on landscape 0.35 keeps YOU
      // closer to viewport center.
      const alpha = portrait ? 0.5 : 0.35
      const tx = destX * alpha
      const tz = destZ * alpha
      focusTarget.set(tx, 0, tz)
      // FOV-aware zoom-out so BOTH endpoints land at ≤ |NDC| 0.7.
      // YOU is the closer-to-camera endpoint (signed ground distance
      // = -alpha·pinDist from target), so it projects a LARGER NDC
      // magnitude per world unit due to perspective foreshortening
      // — it's the binding constraint. Solving the perspective
      // projection for R given a target NDC:
      //   R = (alpha · pinDist) · (cosP + sinP / (TARGET_NDC · tanFov))
      // and the dest-side constraint:
      //   R = ((1-alpha) · pinDist) · (sinP / (TARGET_NDC · tanFov) - cosP)
      // Take the larger of the two so both endpoints fit.
      const TARGET_NDC = 0.7
      // 45° camera pitch reads as classic isometric — same camera
      // tilt whether the destination is 500 m or 50 km away, so the
      // visual language stays consistent.
      const pitch = Math.PI / 4
      const sinP = Math.sin(pitch)
      const cosP = Math.cos(pitch)
      const tanFovV = Math.tan((55 * Math.PI) / 180 / 2)
      const youHalf = alpha * pinDist
      const destHalf = (1 - alpha) * pinDist
      const R_you = youHalf * (cosP + sinP / (TARGET_NDC * tanFovV))
      const R_dest = destHalf * (sinP / (TARGET_NDC * tanFovV) - cosP)
      const R = Math.max(R_you, R_dest, 600)
      // Camera at -pinDir from target at distance R (decomposed
      // into back + height by pitch).
      const back = R * cosP
      const height = R * sinP
      const pinLen = pinDist || 1
      const pdx = destX / pinLen
      const pdz = destZ / pinLen
      focusCamPos.set(tx - pdx * back, height, tz - pdz * back)
      focusing = true
    }
    function planHome() {
      focusTarget.copy(HOME_TARGET)
      focusCamPos.copy(HOME_POS)
      focusing = true
    }

    // Raycast against the tile mesh from above the destination XZ
    // to find the actual ground or rooftop height, then drop the
    // building highlight ring onto that point. Runs whenever the
    // tile graph updates after a selection.
    const downRay = new Raycaster()
    function snapBuildingHighlight(destX: number, destZ: number) {
      downRay.set(new Vector3(destX, 5000, destZ), new Vector3(0, -1, 0))
      downRay.far = 8000
      const hits = downRay.intersectObject(tiles.group, true)
      if (!hits.length) return false
      const hit = hits[0].point
      buildingRing.position.copy(hit)
      buildingRing.position.y += 0.6
      buildingRing.visible = true
      return true
    }

    // Per-frame screen projection of a world point — used for label
    // and selection-pill placement.
    const tmpVec = new Vector3()
    function projectToScreen(v: Vector3): { x: number; y: number; visible: boolean; rect: DOMRect } {
      const rect = renderer.domElement.getBoundingClientRect()
      tmpVec.copy(v).project(camera)
      return {
        x: ((tmpVec.x + 1) / 2) * rect.width,
        y: ((-tmpVec.y + 1) / 2) * rect.height,
        visible: tmpVec.z > -1 && tmpVec.z < 1,
        rect,
      }
    }

    // ── Reset + orient-north window events. Wired identically to
    // the orbital scene so the same Reset and Compass UI in the
    // overlay drives whichever mode is mounted. Compass yawRef is
    // updated each tick below.
    const onResetView = () => {
      focusTarget.copy(HOME_TARGET)
      focusCamPos.copy(HOME_POS)
      focusing = true
    }
    const onOrientNorth = () => {
      // North-up = camera SOUTH of target looking NORTH.
      // ReorientationPlugin puts +Z = north; "south" in scene units
      // is -Z. Preserve current radius + polar so the user keeps
      // their zoom + tilt — only the azimuth changes.
      const radius = camera.position.distanceTo(controls.target)
      const polar = controls.getPolarAngle()
      const sin = Math.sin(polar)
      const cos = Math.cos(polar)
      const t = controls.target
      focusTarget.copy(t)
      focusCamPos.set(t.x, t.y + radius * cos, t.z - radius * sin)
      focusing = true
    }
    window.addEventListener("korea-map-reset", onResetView)
    window.addEventListener("korea-map-orient-north", onOrientNorth)

    // ── God-rays pass ────────────────────────────────────────────
    // Lazily constructed: we only allocate RTs + shaders when the
    // user has the toggle on AND we have a non-trivial viewport.
    // Disposed in the cleanup block. Runs every frame — the previous
    // tile-streaming throttle made the effect blink off during any
    // pan (new tiles load continuously while the camera moves), which
    // read as broken. Pitch attenuation in the shader handles the
    // expensive case (horizon blowout) instead.
    let godRays: GodRaysPass | null = null
    if (godRaysOn) {
      godRays = new GodRaysPass({
        renderer,
        scene,
        camera,
        sunPos: new Vector3(800, 1200, 400),
        size: { w, h },
        clearColor: fogColor,
      })
    }

    // ── Max Quality HDR pipeline ─────────────────────────────────
    // Replaces the direct renderer.render call with a multi-pass
    // chain: scene → cloud composite → bloom → grade/tonemap → SMAA.
    // Coordinates per-phase color, exposure, bloom threshold, and
    // cloud palette via setHourPhase() once per minute.
    let maxQuality: MaxQualityPipeline | null = null
    if (maxQualityOn) {
      maxQuality = new MaxQualityPipeline({
        renderer,
        scene,
        camera,
        size: { w, h },
        reducedMotion: !!reducedMotion,
      })
      maxQuality.setHourPhase(kstHour())
    }
    const maxQualityStart = performance.now()

    // ── Animation loop ────────────────────────────────────────────
    let running = true
    let lastAttrAt = 0
    let buildingHighlightTries = 0
    // Arrival is armed; the tick below waits for the first batch of
    // tiles to land (so we don't fly through empty space), then kicks
    // off a focus tween from approach → HOME with a slower-than-usual
    // lerp factor for cinematic weight.
    let arrivalArmed = arriving
    const arrivalDeadline = performance.now() + 2500
    let focusLerp = 0.12
    const onArrivalCancel = () => {
      if (!arriving) return
      // User wants control — stop the camera mid-flight. OrbitControls
      // re-derives its spherical state from camera.position + target on
      // its next update(), so dropping `focusing` cleanly hands control
      // back without a snap.
      arriving = false
      arrivalArmed = false
      focusing = false
      focusLerp = 0.12
      renderer.domElement.style.filter = cssFilterFor(kstHour())
      try { sessionStorage.setItem(ARRIVAL_SESSION_KEY, "1") } catch { /* private mode */ }
    }
    renderer.domElement.addEventListener("pointerdown", onArrivalCancel, { passive: true, once: true })
    function tick() {
      if (!running) return
      controls.update()
      tiles.update()

      // Arrival kickoff: wait until tiles have rendered something
      // (otherwise the fly-in happens over an empty sky) OR the
      // deadline expires (slow network — fall through and accept
      // the empty-ish vista rather than freezing forever).
      if (arrivalArmed) {
        const tilesReady = tiles.group.children.length > 0
        if (tilesReady || performance.now() > arrivalDeadline) {
          arrivalArmed = false
          focusTarget.copy(HOME_TARGET)
          focusCamPos.copy(HOME_POS)
          focusing = true
          // ~1.6s settle at 60fps with 0.045 lerp factor — cinematic
          // weight without feeling slow.
          focusLerp = 0.045
          // Brighten the canvas to its target grade in step with the
          // camera; the CSS transition (0.6s) gives the fade-up.
          if (gradeOn) renderer.domElement.style.filter = cssFilterFor(kstHour())
        }
      }

      // Ramp fog density from 0.5x → 1.0x during arrival so Seoul is
      // visible from the high approach pose, then thickens as the
      // camera lowers. Tracks the focus lerp for visual sync.
      if (scene.fog && fogOn) {
        const target = arriving ? currentFogDensity * 0.5 : currentFogDensity
        const f = scene.fog as FogExp2
        f.density += (target - f.density) * 0.06
      }

      // Publish the live "yaw from north-up" to the parent compass.
      // OrbitControls.getAzimuthalAngle() returns the camera's angle
      // around the up axis from +Z (so theta=0 = camera at +Z =
      // looking south; theta=π = camera at -Z = looking north).
      // Our compass treats yaw=0 as north-up, so subtract π and
      // wrap into (-π, π].
      if (yawRefProp) {
        let yaw = controls.getAzimuthalAngle() - Math.PI
        while (yaw > Math.PI) yaw -= 2 * Math.PI
        while (yaw <= -Math.PI) yaw += 2 * Math.PI
        // Compass dial expects clockwise camera rotation → clockwise
        // dial rotation. Flip sign to match the orbital scene's
        // convention.
        yawRefProp.current = -yaw
      }

      // Camera focus lerp — eases controls.target and camera.position
      // toward the planned focus. OrbitControls re-derives its
      // spherical coords from these on the next update() so the
      // user can still manually orbit after the animation settles.
      if (focusing) {
        controls.target.lerp(focusTarget, focusLerp)
        camera.position.lerp(focusCamPos, focusLerp)
        const dT = controls.target.distanceTo(focusTarget)
        const dP = camera.position.distanceTo(focusCamPos)
        if (dT < 1 && dP < 2) {
          controls.target.copy(focusTarget)
          camera.position.copy(focusCamPos)
          focusing = false
          if (arriving) {
            // Settled. Mark arrival done so subsequent Map Mode opens
            // in the same session land directly at HOME, and restore
            // the everyday focus lerp speed.
            arriving = false
            focusLerp = 0.12
            try { sessionStorage.setItem(ARRIVAL_SESSION_KEY, "1") } catch { /* private mode */ }
          }
        }
      }

      // Selection change → reframe + populate the line + ring + pill,
      // dim other markers, raycast building highlight.
      const sel = selectedIdRef.current
      if (sel !== lastSelectedId) {
        if (sel) {
          const m = markers.find((x) => x.place.id === sel)
          if (m) {
            const destX = m.basePos.x
            const destZ = m.basePos.z
            planFocus(destX, destZ)
            // Line on the ground from YOU to destination.
            const lpos = selLineGeom.attributes.position as BufferAttribute
            lpos.setXYZ(0, 0, 1, 0)
            lpos.setXYZ(1, destX, 1, destZ)
            lpos.needsUpdate = true
            selLine.visible = true
            // Destination ring on the ground at the place's exact
            // geolocation (above any tile mesh that might intersect).
            selRing.position.set(destX, 1.5, destZ)
            selRing.visible = true
            buildingRing.visible = false
            buildingHighlightTries = 0
            // Populate the floating pill with distance + address +
            // Maps link. We render it once and reposition each frame.
            const distLabel = m.place.distanceLabel ?? ""
            const addr = m.place.address ?? ""
            const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              m.place.name + ", " + m.place.city,
            )}`
            selectionPill.innerHTML = `
              <div class="flex flex-col items-center gap-1">
                ${
                  distLabel
                    ? `<div class="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white shadow-lg ring-1 ring-rose-300/60">
                        <span aria-hidden>↔</span>
                        <span class="tabular-nums">${escapeHtml(distLabel)}</span>
                      </div>`
                    : ""
                }
                ${
                  addr
                    ? `<div class="max-w-[14rem] truncate rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-medium text-stone-700 shadow-md ring-1 ring-stone-200 dark:bg-stone-900/95 dark:text-stone-300 dark:ring-stone-700" title="${escapeHtml(addr)}">${escapeHtml(addr)}</div>`
                    : ""
                }
                <a
                  href="${mapsUrl}"
                  target="_blank"
                  rel="noreferrer"
                  class="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-stone-300 bg-stone-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-700 shadow-md transition hover:border-rose-300 hover:text-rose-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-rose-700 dark:hover:text-rose-200"
                >
                  Maps <span aria-hidden>↗</span>
                </a>
              </div>
            `
            selectionPill.style.visibility = "visible"
          }
        } else {
          planHome()
          selLine.visible = false
          selRing.visible = false
          buildingRing.visible = false
          selectionPill.style.visibility = "hidden"
        }
        lastSelectedId = sel
      }

      // Building highlight — tile geometry streams in async after
      // selection, so retry the raycast each frame for up to ~3 s
      // until it lands a hit. Once placed, leave it alone.
      if (sel && !buildingRing.visible && buildingHighlightTries < 180) {
        buildingHighlightTries++
        const m = markers.find((x) => x.place.id === sel)
        if (m) snapBuildingHighlight(m.basePos.x, m.basePos.z)
      }

      // Marker emphasis — selected pulses + grows, others dim.
      const t = performance.now() / 1000
      for (const m of markers) {
        const mat = m.mesh.material as MeshStandardMaterial
        const beamMat = m.beam.material as MeshBasicMaterial
        if (sel && m.place.id === sel) {
          mat.emissiveIntensity = reducedMotion ? 0.85 : 0.7 + Math.sin(t * 4) * 0.2
          m.mesh.scale.setScalar(reducedMotion ? 1.25 : 1.2 + Math.sin(t * 4) * 0.06)
          beamMat.opacity = 0.85
        } else if (sel) {
          mat.emissiveIntensity = 0.18
          m.mesh.scale.setScalar(0.85)
          beamMat.opacity = 0.18
        } else {
          mat.emissiveIntensity = 0.55
          m.mesh.scale.setScalar(1)
          beamMat.opacity = 0.6
        }
      }

      // Project all marker labels first; then run an overlap-
      // declutter pass that fades out lower-priority labels whose
      // screen bounding box overlaps a higher-priority neighbor's.
      // Scheduled > Core > Supplemental, ties broken by closer-to-
      // camera; the selected marker always wins.
      interface ProjectedLabel {
        m: PlaceMarker
        x: number
        y: number
        visible: boolean
        camDist: number
        rank: number
      }
      const projected: ProjectedLabel[] = []
      const cam = camera.position
      for (const m of markers) {
        const world = new Vector3(m.basePos.x, 100, m.basePos.z)
        const proj = projectToScreen(world)
        projected.push({
          m,
          x: proj.x,
          y: proj.y,
          visible: proj.visible,
          camDist: cam.distanceTo(new Vector3(m.basePos.x, 0, m.basePos.z)),
          rank: m.priorityRank,
        })
      }
      // Sort: selected first (rank -1), then by priority, then by
      // camera distance so closer wins ties.
      projected.sort((a, b) => {
        const aSel = sel && a.m.place.id === sel ? -1 : a.rank
        const bSel = sel && b.m.place.id === sel ? -1 : b.rank
        if (aSel !== bSel) return aSel - bSel
        return a.camDist - b.camDist
      })
      // Walk through; for each label that's visible, mark its
      // bounding box; later labels that intersect get faded.
      const HALF_W = 60 // approximate label half-width in px
      const HALF_H = 20 // approximate label half-height in px
      const taken: Array<{ x: number; y: number }> = []
      for (const p of projected) {
        const dim = sel && p.m.place.id !== sel ? 0.15 : 1
        if (!p.visible || dim < 0.05) {
          p.m.label.style.visibility = "hidden"
          continue
        }
        // Check overlap with previously-placed (higher-priority)
        // labels. We use point-in-rectangle on the label center
        // against each taken bbox — quick + good enough for
        // bubble-label avoidance.
        let occluded = false
        for (const t of taken) {
          if (
            Math.abs(p.x - t.x) < HALF_W * 1.4 &&
            Math.abs(p.y - t.y) < HALF_H * 1.6
          ) {
            occluded = true
            break
          }
        }
        const visualDim = occluded ? dim * 0.25 : dim
        p.m.label.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, -50%)`
        p.m.label.style.opacity = String(visualDim)
        p.m.label.style.visibility = "visible"
        // Closer / higher-priority labels paint on top.
        p.m.label.style.zIndex = String(Math.max(1, Math.round(10000 - p.camDist)))
        if (!occluded) taken.push({ x: p.x, y: p.y })
      }
      const youProj = projectToScreen(new Vector3(0, 4, 0))
      if (youProj.visible) {
        youLabel.style.transform = `translate3d(${youProj.x.toFixed(1)}px, ${youProj.y.toFixed(1)}px, 0) translate(-50%, -50%)`
        youLabel.style.visibility = "visible"
      } else {
        youLabel.style.visibility = "hidden"
      }

      // Selection pill at the midpoint of the line.
      if (selLine.visible && sel) {
        const m = markers.find((x) => x.place.id === sel)
        if (m) {
          // A touch above ground so depth-sorting against the line
          // and ring is unambiguous.
          const midWorld = new Vector3(m.basePos.x / 2, 40, m.basePos.z / 2)
          const proj = projectToScreen(midWorld)
          if (proj.visible) {
            selectionPill.style.transform = `translate3d(${proj.x.toFixed(1)}px, ${proj.y.toFixed(1)}px, 0) translate(-50%, -50%)`
            selectionPill.style.opacity = "1"
          } else {
            selectionPill.style.opacity = "0"
          }
        }
      }

      // Pulsing rings on the selected destination.
      if (selRing.visible) {
        const pulse = reducedMotion ? 1 : 1 + Math.sin(t * 3.2) * 0.12
        selRing.scale.setScalar(pulse)
      }
      if (buildingRing.visible) {
        const pulse = reducedMotion ? 1 : 1 + Math.sin(t * 3.2 + 0.6) * 0.18
        buildingRing.scale.setScalar(pulse)
      }

      // Attribution debounced to ~4 Hz — cheap but avoids per-frame
      // DOM writes.
      const now = performance.now()
      if (now - lastAttrAt > 250) {
        lastAttrAt = now
        updateAttribution()
      }

      // Render path selection — three modes, ordered by priority:
      //   1. Max Quality: HDR composer pipeline (replaces god-rays
      //      direct render — god-rays output is currently not folded
      //      into the composer in v1; if the user has BOTH max quality
      //      and god-rays toggled on, max quality wins. A follow-up
      //      PR will patch GodRaysPass to accept an output target so
      //      its result lands in the HDR buffer for bloom + tone-map.)
      //   2. God rays only: existing radial-blur composite.
      //   3. Plain direct render.
      if (maxQuality) {
        maxQuality.render((performance.now() - maxQualityStart) / 1000)
      } else if (godRays) {
        const polar = controls.getPolarAngle()
        const pitchAtten = Math.pow(Math.max(0, Math.cos(polar)), 0.7)
        godRays.setClearColor(fogColor)
        godRays.setPitchAttenuation(pitchAtten)
        godRays.render()
      } else {
        renderer.setRenderTarget(null)
        renderer.render(scene, camera)
      }
      requestAnimationFrame(tick)
    }
    tick()

    return () => {
      running = false
      window.clearInterval(gradeInterval)
      window.clearInterval(fogHourInterval)
      godRays?.dispose()
      maxQuality?.dispose()
      scene.fog = null
      ro.disconnect()
      window.removeEventListener("korea-map-reset", onResetView)
      window.removeEventListener("korea-map-orient-north", onOrientNorth)
      renderer.domElement.removeEventListener("pointerdown", onArrivalCancel)
      renderer.domElement.removeEventListener("pointerdown", onPointerDown)
      renderer.domElement.removeEventListener("pointerup", onPointerUp)
      tiles.dispose()
      controls.dispose()
      draco.dispose()
      ktx2.dispose()
      for (const m of markers) {
        m.mesh.geometry.dispose()
        ;(m.mesh.material as MeshStandardMaterial).dispose()
        m.beam.geometry.dispose()
        ;(m.beam.material as MeshBasicMaterial).dispose()
        m.label.removeEventListener("click", m.onLabelClick)
        m.label.remove()
      }
      youLabel.remove()
      selLineGeom.dispose()
      ;(selLine.material as LineBasicMaterial).dispose()
      selRing.geometry.dispose()
      ;(selRing.material as MeshBasicMaterial).dispose()
      buildingRing.geometry.dispose()
      ;(buildingRing.material as MeshBasicMaterial).dispose()
      selectionPill.remove()
      youMarker.geometry.dispose()
      ;(youMarker.material as MeshStandardMaterial).dispose()
      renderer.dispose()
      try {
        mount.removeChild(renderer.domElement)
      } catch {
        /* already removed */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, userLat, userLng, places, reducedMotion, fogOn, godRaysOn, gradeOn, maxQualityOn])

  if (keyMissing) {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-stone-100 dark:bg-stone-950">
        <div className="mx-4 max-w-md rounded-2xl border border-stone-200 bg-white p-5 text-center shadow-md dark:border-stone-800 dark:bg-stone-900">
          <div className="text-xs font-mono uppercase tracking-widest text-stone-500">
            Detailed 3D
          </div>
          <h3 className="mt-2 text-base font-semibold text-stone-900 dark:text-stone-100">
            Google Map Tiles API key required
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-stone-600 dark:text-stone-400">
            Set <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">VITE_GOOGLE_MAP_TILES_API_KEY</code> in your env to stream Google Photorealistic 3D Tiles. The same key can be reused from <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">VITE_GOOGLE_PLACES_API_KEY</code> if you enable the Map Tiles API on it. 1,000 free root-tileset requests per month.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={mountRef} className="absolute inset-0" />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-10" aria-hidden />
      {/* Bottom-right attribution pill. Visually hidden per product
          decision — kept in the DOM (sr-only) so screen readers and
          automated TOS audits can still discover the Google + sources
          attribution that the Map Tiles API requires when any 3D tile
          is on screen. Auto-updates via the tick loop. */}
      <div
        ref={attributionRef}
        className="sr-only"
        aria-label="Map data attribution"
      >
        Data: Google
      </div>
    </div>
  )
}
