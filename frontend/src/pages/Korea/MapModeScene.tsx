import { useEffect, useRef } from "react"
import * as THREE from "three"
import type { RankedPlace } from "./mapModeTypes"

interface MapModeSceneProps {
  places: RankedPlace[]
  onSelect: (place: RankedPlace) => void
  selectedId?: string | null
  reducedMotion?: boolean
  onWebglError?: () => void
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

// Visual constants — tuned for a cinematic, centered hero view.
const RADIUS_BY_PRIORITY: Record<RankedPlace["priority"], number> = {
  scheduled: 8,
  core: 14.5,
  supplemental: 21.5,
}

const BUBBLE_RADIUS_BY_PRIORITY: Record<RankedPlace["priority"], number> = {
  scheduled: 2.4,
  core: 1.85,
  supplemental: 1.55,
}

// Bubbles all live on the same Y plane. Combined with the top-down isometric
// camera, this gives a "places around you" map where YOU is unambiguously
// the geometric center and the camera orbits around that center.
const Y_BY_PRIORITY: Record<RankedPlace["priority"], number> = {
  scheduled: 1.6,
  core: 1.6,
  supplemental: 1.6,
}

// Camera distance per viewport. Wider default than before so the supplemental
// ring breathes and YOU clearly anchors the composition.
function cameraTargetRadiusFor(width: number): number {
  if (width < 360) return 62
  if (width < 480) return 56
  if (width < 768) return 49
  if (width < 1024) return 44
  if (width < 1440) return 39
  return 36
}

interface BubbleNode {
  place: RankedPlace
  outer: THREE.Mesh
  innerBillboard: THREE.Mesh
  rim: THREE.Mesh
  line: THREE.Line
  basePos: THREE.Vector3
  bobOffset: number
  bobAmplitude: number
  label: HTMLDivElement
  entryDelay: number
  bornAt: number
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
function makePlaceholderTexture(color: string, icon: string): THREE.CanvasTexture {
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
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// Try to fetch a real photo for the place via the Wikipedia REST API (CORS-safe)
// and replace the placeholder texture asynchronously.
async function lookupPlacePhoto(query: string): Promise<string | null> {
  try {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`)
    if (!r.ok) return null
    const j = (await r.json()) as { thumbnail?: { source?: string }; originalimage?: { source?: string } }
    return j.thumbnail?.source ?? j.originalimage?.source ?? null
  } catch {
    return null
  }
}

export function MapModeScene({ places, onSelect, selectedId, reducedMotion, onWebglError }: MapModeSceneProps) {
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
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" })
    } catch (err) {
      console.warn("[map-mode] WebGL unavailable:", err)
      onWebglErrorRef.current?.()
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    const sizeFromMount = () => ({ w: mount.clientWidth, h: Math.max(1, mount.clientHeight) })
    let { w, h } = sizeFromMount()
    renderer.setSize(w, h, false)
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.touchAction = "none"
    renderer.domElement.style.display = "block"

    // ── Scene + Camera ─────────────────────────────────────────────
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 400)

    // CAMERA: target world origin (where YOU lives, via the CSS overlay) so
    // the camera ORBITS around the visual center of the screen. The default
    // is a top-down isometric pitch so bubbles distribute as concentric
    // rings around YOU rather than bunching above. The orbit is user-driven
    // only — no auto-rotate — so the scene stays put unless dragged.
    const cameraTarget = new THREE.Vector3(0, 0, 0)
    const camYaw = { current: -Math.PI / 6 }
    const camPitch = { current: 0.78 } // ~45° down — top-down isometric, YOU centered
    const camRadius = { current: 90 }
    const camRadiusTarget = { current: cameraTargetRadiusFor(w) }

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

    // ── Lights ─────────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0xffffff, 0.55)
    scene.add(ambient)
    const hemi = new THREE.HemisphereLight(0xfff0d6, 0x1a0e2a, 0.45)
    scene.add(hemi)
    const key = new THREE.DirectionalLight(0xfff4e6, 1.1)
    key.position.set(20, 30, 14)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xa3c5ff, 0.65)
    rim.position.set(-18, 12, -16)
    scene.add(rim)

    // ── Starfield background ──────────────────────────────────────
    const starCount = reducedMotion ? 280 : 800
    const starGeom = new THREE.BufferGeometry()
    const starPositions = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      const r = 90 + Math.random() * 60
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      starPositions[i * 3 + 1] = r * Math.abs(Math.cos(phi)) * 0.6 + 8
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }
    starGeom.setAttribute("position", new THREE.BufferAttribute(starPositions, 3))
    const starMat = new THREE.PointsMaterial({
      color: 0xfff5e0,
      size: 0.7,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
      depthWrite: false,
    })
    const stars = new THREE.Points(starGeom, starMat)
    scene.add(stars)

    // ── Ground plane + priority rings ─────────────────────────────
    const groundGeom = new THREE.CircleGeometry(60, 64)
    const groundMat = new THREE.MeshBasicMaterial({ color: 0xffd9c2, transparent: true, opacity: 0.04, depthWrite: false })
    const ground = new THREE.Mesh(groundGeom, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.6
    scene.add(ground)

    const ringMeshes: THREE.Mesh[] = []
    const ringDefs: { radius: number; color: number; opacity: number }[] = [
      { radius: RADIUS_BY_PRIORITY.scheduled, color: 0xff4d6d, opacity: 0.4 },
      { radius: RADIUS_BY_PRIORITY.core, color: 0xfb923c, opacity: 0.28 },
      { radius: RADIUS_BY_PRIORITY.supplemental, color: 0xa3a3a3, opacity: 0.18 },
    ]
    for (const def of ringDefs) {
      const g = new THREE.RingGeometry(def.radius - 0.18, def.radius + 0.18, 96)
      const m = new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: def.opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const ring = new THREE.Mesh(g, m)
      ring.rotation.x = -Math.PI / 2
      ring.position.y = -0.55
      scene.add(ring)
      ringMeshes.push(ring)
    }

    // ── Center YOU node ───────────────────────────────────────────
    const youGroup = new THREE.Group()
    const youCore = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 36, 36),
      new THREE.MeshStandardMaterial({
        color: 0xff4d6d,
        emissive: 0xff4d6d,
        emissiveIntensity: 0.7,
        metalness: 0.15,
        roughness: 0.25,
      }),
    )
    youGroup.add(youCore)
    const youGlow = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.22, depthWrite: false }),
    )
    youGroup.add(youGlow)
    const youRing = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 2.7, 96),
      new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
    )
    youRing.rotation.x = -Math.PI / 2
    youRing.position.y = -0.55
    youGroup.add(youRing)
    const youRing2 = new THREE.Mesh(
      new THREE.RingGeometry(3.6, 3.85, 96),
      new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    )
    youRing2.rotation.x = -Math.PI / 2
    youRing2.position.y = -0.55
    youGroup.add(youRing2)
    youGroup.position.set(0, 0, 0) // at world origin so it projects to screen center
    scene.add(youGroup)

    // Texture loader (shared)
    const textureLoader = new THREE.TextureLoader()
    textureLoader.setCrossOrigin("anonymous")

    // ── Bubble nodes (glass orbs with refracted image plane inside) ─
    const nodes: BubbleNode[] = []
    const groupedByPriority: Record<string, RankedPlace[]> = { scheduled: [], core: [], supplemental: [] }
    for (const p of places) groupedByPriority[p.priority].push(p)

    let entryIdx = 0
    for (const priority of ["scheduled", "core", "supplemental"] as const) {
      const groupPlaces = groupedByPriority[priority]
      const ringRadius = RADIUS_BY_PRIORITY[priority]
      const phase =
        priority === "scheduled" ? Math.PI / 6 : priority === "core" ? Math.PI / 9 : Math.PI / 12

      groupPlaces.forEach((place, i) => {
        const angle = phase + (i / Math.max(1, groupPlaces.length)) * Math.PI * 2
        const bx = Math.cos(angle) * ringRadius
        const bz = Math.sin(angle) * ringRadius
        const by = Y_BY_PRIORITY[priority]
        const bubbleRadius = BUBBLE_RADIUS_BY_PRIORITY[priority]

        const color = new THREE.Color(place.color)

        // ── Inner image billboard plane (rendered first so it's behind glass) ──
        const placeholderTex = makePlaceholderTexture(place.color, place.icon)
        const innerBillboard = new THREE.Mesh(
          new THREE.CircleGeometry(bubbleRadius * 0.78, 32),
          new THREE.MeshBasicMaterial({
            map: placeholderTex,
            transparent: true,
            depthWrite: false,
          }),
        )
        innerBillboard.position.set(bx, by, bz)
        innerBillboard.userData.placeholderTex = placeholderTex
        scene.add(innerBillboard)

        // Try to load a real photo asynchronously; replace placeholder when it arrives
        lookupPlacePhoto(place.name)
          .then((url) => (url ? url : lookupPlacePhoto(place.name.split("(")[0].trim())))
          .then((url) => {
            if (!url) return
            textureLoader.load(
              url,
              (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace
                ;(innerBillboard.material as THREE.MeshBasicMaterial).map = tex
                ;(innerBillboard.material as THREE.MeshBasicMaterial).needsUpdate = true
              },
              undefined,
              () => {
                /* keep placeholder */
              },
            )
          })

        // ── Outer glass orb ───────────────────────────────────────
        const outerMat = new THREE.MeshPhysicalMaterial({
          color,
          transmission: 0.7,
          thickness: 0.6,
          roughness: 0.32, // frosted
          metalness: 0.0,
          ior: 1.32,
          clearcoat: 1.0,
          clearcoatRoughness: 0.18,
          iridescence: priority === "scheduled" ? 0.35 : 0.18,
          iridescenceIOR: 1.3,
          attenuationColor: color,
          attenuationDistance: 1.5,
          transparent: true,
          opacity: 0.92,
          emissive: color,
          emissiveIntensity: priority === "scheduled" ? 0.18 : 0.1,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
        const outer = new THREE.Mesh(new THREE.SphereGeometry(bubbleRadius, 48, 48), outerMat)
        outer.position.set(bx, by, bz)
        outer.userData.placeId = place.id
        outer.userData.priority = priority
        outer.scale.setScalar(0.001)
        scene.add(outer)

        // ── Fresnel rim — a backside shell with emissive that lights up on edges
        const rimMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.28,
          side: THREE.BackSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
        const rim = new THREE.Mesh(new THREE.SphereGeometry(bubbleRadius * 1.12, 32, 32), rimMat)
        rim.position.set(bx, by, bz)
        rim.scale.setScalar(0.001)
        scene.add(rim)

        // ── Connecting line ────────────────────────────────────────
        const lineGeom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0.6, 0),
          new THREE.Vector3(bx, by, bz),
        ])
        const lineMat = new THREE.LineBasicMaterial({
          color: priority === "scheduled" ? 0xff4d6d : priority === "core" ? 0xfb923c : 0x888888,
          transparent: true,
          opacity: priority === "scheduled" ? 0.55 : priority === "core" ? 0.35 : 0.18,
        })
        const line = new THREE.Line(lineGeom, lineMat)
        scene.add(line)

        // ── HTML label overlay (flicker-free) ─────────────────────
        const distance = place.distanceLabel ?? ""
        const label = document.createElement("div")
        label.dataset.placeId = place.id
        // Start far off-screen so we never see un-projected labels.
        label.style.transform = "translate3d(-9999px, -9999px, 0)"
        label.style.visibility = "hidden"
        label.className = "pointer-events-none absolute left-0 top-0 select-none text-center"
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
        overlay.appendChild(label)

        nodes.push({
          place,
          outer,
          innerBillboard,
          rim,
          line,
          basePos: new THREE.Vector3(bx, by, bz),
          bobOffset: Math.random() * Math.PI * 2,
          bobAmplitude: priority === "scheduled" ? 0.4 : 0.28,
          label,
          entryDelay: entryIdx * 0.06,
          bornAt: 0,
        })
        entryIdx++
      })
    }

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

    // ── Raycaster + input ─────────────────────────────────────────
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
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

    function pickAtPointer(): BubbleNode | null {
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(
        nodes.map((n) => n.outer),
        false,
      )
      if (!hits.length) return null
      const placeId = hits[0].object.userData.placeId as string | undefined
      return nodes.find((n) => n.place.id === placeId) ?? null
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
      if (node) {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate(15)
          } catch {
            /* no-op */
          }
        }
        onSelectRef.current(node.place)
      }
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
      camPitch.current = 0.78
    }
    mount.addEventListener("korea-map-reset", onResetView)

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
    const clock = new THREE.Clock()
    let running = true
    const sceneStart = performance.now()

    function projectToScreen(v: THREE.Vector3): { x: number; y: number; visible: boolean } {
      const p = v.clone().project(camera)
      const rect = renderer.domElement.getBoundingClientRect()
      return {
        x: ((p.x + 1) / 2) * rect.width,
        y: ((-p.y + 1) / 2) * rect.height,
        visible: p.z > -1 && p.z < 1,
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

      // No auto-rotate — the scene stays still so YOU stays centered. The
      // camera orbits around YOU only when the user drags.
      applyCamera()

      starMat.opacity = 0.7 + Math.sin(t * 0.7) * 0.08

      // YOU pin animation
      const pulse = 1 + Math.sin(t * 2.4) * 0.06
      youCore.scale.setScalar(reducedMotion ? 1 : pulse)
      youGlow.scale.setScalar(reducedMotion ? 1.0 : 1 + Math.sin(t * 1.6) * 0.12)
      ;(youRing.material as THREE.MeshBasicMaterial).opacity = reducedMotion ? 0.55 : 0.45 + Math.sin(t * 1.8) * 0.15
      youRing.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(t * 1.4) * 0.08)
      ;(youRing2.material as THREE.MeshBasicMaterial).opacity = reducedMotion ? 0.3 : 0.2 + Math.sin(t * 1.1 + 1) * 0.12
      youRing2.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(t * 0.9 + 1) * 0.1)

      ringMeshes.forEach((ring, i) => {
        const mat = ring.material as THREE.MeshBasicMaterial
        const base = ringDefs[i].opacity
        mat.opacity = reducedMotion ? base : base + Math.sin(t * 0.8 + i) * 0.05
      })

      for (const node of nodes) {
        if (node.bornAt === 0 && sceneT >= node.entryDelay) node.bornAt = sceneT

        if (node.bornAt > 0) {
          const sinceBirth = sceneT - node.bornAt
          const k = Math.min(1, sinceBirth / 0.7)
          const baseScale = reducedMotion ? 1 : easeOutBack(k)

          node.outer.scale.setScalar(baseScale)
          node.innerBillboard.scale.setScalar(baseScale * 0.95)
          node.rim.scale.setScalar(baseScale * 1.0)
        }

        const bob = reducedMotion ? 0 : Math.sin(t * 1.3 + node.bobOffset) * node.bobAmplitude
        const cy = node.basePos.y + bob
        node.outer.position.y = cy
        node.innerBillboard.position.y = cy
        node.rim.position.y = cy

        // Billboard always faces camera
        node.innerBillboard.lookAt(camera.position)

        // Selection emphasis (only effect outer + rim — leave billboard scale alone)
        const isSelected = selectedIdRef.current === node.place.id
        const rimMat = node.rim.material as THREE.MeshBasicMaterial
        if (isSelected) {
          const sel = 1 + Math.sin(t * 4) * 0.08
          node.outer.scale.setScalar(Math.max(node.outer.scale.x, 1.2 * sel))
          node.rim.scale.setScalar(1.35 * sel)
          rimMat.opacity = 0.55
        } else if (hovered && hovered.place.id === node.place.id) {
          rimMat.opacity = 0.4
        } else {
          rimMat.opacity = 0.22
        }

        // Update line endpoint
        const positions = node.line.geometry.attributes.position as THREE.BufferAttribute
        positions.setXYZ(1, node.outer.position.x, node.outer.position.y, node.outer.position.z)
        positions.needsUpdate = true

        // Update label
        const worldPos = node.outer.position.clone()
        worldPos.y += BUBBLE_RADIUS_BY_PRIORITY[node.place.priority] + 1.0
        const { x, y, visible } = projectToScreen(worldPos)
        if (visible) {
          node.label.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`
          node.label.style.visibility = node.bornAt > 0 ? "visible" : "hidden"
        } else {
          node.label.style.visibility = "hidden"
        }
      }

      // YOU label is anchored to viewport center via static CSS — nothing to
      // project per-frame. Camera moves; YOU stays put visually.

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
    })
    ro.observe(mount)

    return () => {
      running = false
      ro.disconnect()
      mount.removeEventListener("korea-map-reset", onResetView)
      renderer.domElement.removeEventListener("pointermove", onPointerMove)
      renderer.domElement.removeEventListener("pointerdown", onPointerDown)
      renderer.domElement.removeEventListener("pointerup", onPointerUp)
      renderer.domElement.removeEventListener("wheel", onWheel)
      renderer.domElement.removeEventListener("touchstart", onTouchStart)
      renderer.domElement.removeEventListener("touchmove", onTouchMove)
      for (const node of nodes) {
        node.outer.geometry.dispose()
        ;(node.outer.material as THREE.Material).dispose()
        node.innerBillboard.geometry.dispose()
        const im = node.innerBillboard.material as THREE.MeshBasicMaterial
        if (im.map) im.map.dispose()
        im.dispose()
        node.rim.geometry.dispose()
        ;(node.rim.material as THREE.Material).dispose()
        node.line.geometry.dispose()
        ;(node.line.material as THREE.Material).dispose()
        node.label.remove()
        const placeholder = node.innerBillboard.userData.placeholderTex as THREE.CanvasTexture | undefined
        placeholder?.dispose()
      }
      youLabel.remove()
      youCore.geometry.dispose()
      ;(youCore.material as THREE.Material).dispose()
      youGlow.geometry.dispose()
      ;(youGlow.material as THREE.Material).dispose()
      youRing.geometry.dispose()
      ;(youRing.material as THREE.Material).dispose()
      youRing2.geometry.dispose()
      ;(youRing2.material as THREE.Material).dispose()
      ringMeshes.forEach((r) => {
        r.geometry.dispose()
        ;(r.material as THREE.Material).dispose()
      })
      starGeom.dispose()
      starMat.dispose()
      groundGeom.dispose()
      groundMat.dispose()
      renderer.dispose()
      try {
        mount.removeChild(renderer.domElement)
      } catch {
        /* already removed */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, reducedMotion])

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
