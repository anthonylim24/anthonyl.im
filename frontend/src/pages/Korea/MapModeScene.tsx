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
  core: 1.8,
  supplemental: 1.45,
}

const Y_BY_PRIORITY: Record<RankedPlace["priority"], number> = {
  scheduled: 1.5,
  core: 2.6,
  supplemental: 3.6,
}

// Camera distance adapts to the viewport so the supplemental ring fits without
// clipping on narrow phones, while staying cinematic on wide displays.
function cameraTargetRadiusFor(width: number): number {
  if (width < 360) return 50
  if (width < 480) return 46
  if (width < 768) return 41
  if (width < 1024) return 36
  if (width < 1440) return 33
  return 30
}

interface BubbleNode {
  place: RankedPlace
  mesh: THREE.Mesh
  glow: THREE.Mesh
  line: THREE.Line
  basePos: THREE.Vector3
  bobOffset: number
  bobAmplitude: number
  label: HTMLDivElement
  entryDelay: number
  bornAt: number
}

// Easing for the intro animation
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
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
    const sizeFromMount = () => ({ w: mount.clientWidth, h: Math.max(1, mount.clientHeight) })
    let { w, h } = sizeFromMount()
    renderer.setSize(w, h, false)
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.touchAction = "none"
    renderer.domElement.style.display = "block"

    // ── Scene + Camera ─────────────────────────────────────────────
    const scene = new THREE.Scene()
    // A narrower FOV gives more cinematic depth
    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 400)

    // Camera state — orbit parameters around the user (origin).
    // Target the user node directly so YOU sits dead center of the viewport.
    const cameraTarget = new THREE.Vector3(0, 1.4, 0)
    const camYaw = { current: -Math.PI / 6 }
    const camPitch = { current: 0.58 } // ~33° down — gentle perspective
    const camRadius = { current: 70 } // start far, animate in
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
    const ambient = new THREE.AmbientLight(0xffffff, 0.45)
    scene.add(ambient)
    const hemi = new THREE.HemisphereLight(0xfff0d6, 0x1a0e2a, 0.55)
    scene.add(hemi)
    const key = new THREE.DirectionalLight(0xfff4e6, 1.0)
    key.position.set(20, 30, 14)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xa3c5ff, 0.55)
    rim.position.set(-18, 12, -16)
    scene.add(rim)

    // ── Starfield background ──────────────────────────────────────
    const starCount = reducedMotion ? 300 : 900
    const starGeom = new THREE.BufferGeometry()
    const starPositions = new Float32Array(starCount * 3)
    const starSizes = new Float32Array(starCount)
    for (let i = 0; i < starCount; i++) {
      // Distribute on a far sphere shell
      const r = 90 + Math.random() * 60
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      starPositions[i * 3 + 1] = r * Math.abs(Math.cos(phi)) * 0.6 + 8 // bias up
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
      starSizes[i] = 0.5 + Math.random() * 1.6
    }
    starGeom.setAttribute("position", new THREE.BufferAttribute(starPositions, 3))
    starGeom.setAttribute("size", new THREE.BufferAttribute(starSizes, 1))
    const starMat = new THREE.PointsMaterial({
      color: 0xfff5e0,
      size: 0.7,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
      depthWrite: false,
    })
    const stars = new THREE.Points(starGeom, starMat)
    scene.add(stars)

    // ── Ground plane (soft glow disk) ─────────────────────────────
    const groundGeom = new THREE.CircleGeometry(60, 64)
    const groundMat = new THREE.MeshBasicMaterial({ color: 0xffd9c2, transparent: true, opacity: 0.04, depthWrite: false })
    const ground = new THREE.Mesh(groundGeom, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.6
    scene.add(ground)

    // ── Ground rings (concentric, one per priority) ───────────────
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

    // ── Center "you" node ─────────────────────────────────────────
    const youGroup = new THREE.Group()
    const youCore = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 36, 36),
      new THREE.MeshStandardMaterial({
        color: 0xff4d6d,
        emissive: 0xff4d6d,
        emissiveIntensity: 0.7,
        metalness: 0.1,
        roughness: 0.25,
      }),
    )
    youGroup.add(youCore)
    // Glow shell
    const youGlow = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.22, depthWrite: false }),
    )
    youGroup.add(youGlow)
    // Pulsing ring on ground
    const youRing = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 2.7, 96),
      new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
    )
    youRing.rotation.x = -Math.PI / 2
    youRing.position.y = -0.55
    youGroup.add(youRing)
    // Second slower-pulsing ring
    const youRing2 = new THREE.Mesh(
      new THREE.RingGeometry(3.6, 3.85, 96),
      new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    )
    youRing2.rotation.x = -Math.PI / 2
    youRing2.position.y = -0.55
    youGroup.add(youRing2)
    youGroup.position.y = 0.4
    scene.add(youGroup)

    // ── Bubble nodes ──────────────────────────────────────────────
    const nodes: BubbleNode[] = []
    const groupedByPriority: Record<string, RankedPlace[]> = { scheduled: [], core: [], supplemental: [] }
    for (const p of places) groupedByPriority[p.priority].push(p)

    let entryIdx = 0
    for (const priority of ["scheduled", "core", "supplemental"] as const) {
      const groupPlaces = groupedByPriority[priority]
      const ringRadius = RADIUS_BY_PRIORITY[priority]
      // Phase the rings so bubbles don't line up radially
      const phase =
        priority === "scheduled" ? Math.PI / 6 : priority === "core" ? Math.PI / 9 : Math.PI / 12

      groupPlaces.forEach((place, i) => {
        const angle = phase + (i / Math.max(1, groupPlaces.length)) * Math.PI * 2
        const bx = Math.cos(angle) * ringRadius
        const bz = Math.sin(angle) * ringRadius
        const by = Y_BY_PRIORITY[priority]
        const bubbleRadius = BUBBLE_RADIUS_BY_PRIORITY[priority]

        const color = new THREE.Color(place.color)
        const mat = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity:
            priority === "scheduled" ? 0.55 : priority === "core" ? 0.4 : 0.25,
          metalness: 0.18,
          roughness: 0.22,
          transparent: true,
          opacity: 0.95,
        })
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(bubbleRadius, 28, 28), mat)
        mesh.position.set(bx, by, bz)
        mesh.userData.placeId = place.id
        mesh.userData.priority = priority
        mesh.scale.setScalar(0.001) // start invisible, animate in
        scene.add(mesh)

        // Soft outer glow shell
        const glowMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.15,
          depthWrite: false,
        })
        const glow = new THREE.Mesh(new THREE.SphereGeometry(bubbleRadius * 1.55, 24, 24), glowMat)
        glow.position.copy(mesh.position)
        glow.scale.setScalar(0.001)
        scene.add(glow)

        // Connecting line from user to bubble
        const lineGeom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0.6, 0),
          new THREE.Vector3(bx, by, bz),
        ])
        const lineMat = new THREE.LineBasicMaterial({
          color: priority === "scheduled" ? 0xff4d6d : priority === "core" ? 0xfb923c : 0x888888,
          transparent: true,
          opacity:
            priority === "scheduled" ? 0.55 : priority === "core" ? 0.35 : 0.18,
        })
        const line = new THREE.Line(lineGeom, lineMat)
        scene.add(line)

        // HTML label overlay
        const label = document.createElement("div")
        label.dataset.placeId = place.id
        label.className =
          "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 select-none text-center opacity-0 transition-opacity duration-500"
        label.innerHTML = `
          <div class="text-2xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] leading-none">${place.icon}</div>
          <div class="mt-0.5 inline-block max-w-[10rem] truncate rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-stone-900 shadow-md backdrop-blur-md ring-1 ring-stone-200 dark:bg-stone-900/90 dark:text-stone-100 dark:ring-stone-700">
            ${escapeHtml(place.name).length > 22 ? escapeHtml(place.name).slice(0, 21) + "…" : escapeHtml(place.name)}
          </div>
        `
        overlay.appendChild(label)

        nodes.push({
          place,
          mesh,
          glow,
          line,
          basePos: new THREE.Vector3(bx, by, bz),
          bobOffset: Math.random() * Math.PI * 2,
          bobAmplitude: priority === "scheduled" ? 0.45 : 0.3,
          label,
          entryDelay: entryIdx * 0.06,
          bornAt: 0,
        })
        entryIdx++
      })
    }

    // Center user label
    const youLabel = document.createElement("div")
    youLabel.className = "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 select-none text-center"
    youLabel.innerHTML = `
      <div class="text-3xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)] leading-none">📍</div>
      <div class="mt-0.5 inline-block rounded-full bg-rose-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white shadow-lg ring-1 ring-rose-300/60">You</div>
    `
    overlay.appendChild(youLabel)

    // ── Raycaster + input handling ────────────────────────────────
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
        nodes.map((n) => n.mesh),
        false,
      )
      if (!hits.length) return null
      const placeId = hits[0].object.userData.placeId as string | undefined
      return nodes.find((n) => n.place.id === placeId) ?? null
    }

    function onPointerMove(e: PointerEvent) {
      setPointerFromEvent(e.clientX, e.clientY)
      const node = pickAtPointer()
      if (hovered && hovered !== node) {
        hovered = null
      }
      if (node) hovered = node
      renderer.domElement.style.cursor = node ? "pointer" : dragging ? "grabbing" : "grab"

      if (dragging) {
        const dx = e.clientX - dragLastX
        const dy = e.clientY - dragLastY
        dragLastX = e.clientX
        dragLastY = e.clientY
        camYaw.current -= dx * 0.005
        camPitch.current = Math.max(0.12, Math.min(1.2, camPitch.current + dy * 0.004))
        applyCamera()
      }
    }

    function onPointerDown(e: PointerEvent) {
      setPointerFromEvent(e.clientX, e.clientY)
      pointerDownAt = performance.now()
      pointerDownPos = { x: e.clientX, y: e.clientY }
      const node = pickAtPointer()
      if (!node) {
        // Start drag
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
      if (wasDragging && movedFar) return // it was a real drag
      if (dt > 600) return // long press, ignore
      const node = pickAtPointer()
      if (node) {
        // Haptic
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

    // Wheel zoom
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      camRadiusTarget.current = Math.max(20, Math.min(85, camRadiusTarget.current + e.deltaY * 0.06))
    }
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false })

    // Listen for an external "reset view" event from the overlay controls.
    const onResetView = () => {
      camRadiusTarget.current = cameraTargetRadiusFor(mount.clientWidth)
      camYaw.current = -Math.PI / 6
      camPitch.current = 0.58
    }
    mount.addEventListener("korea-map-reset", onResetView)

    // Pinch zoom (two-finger)
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
          camRadiusTarget.current = Math.max(22, Math.min(75, camRadiusTarget.current * scale))
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

      // Camera intro: ease radius from initial to target over 1.5s
      if (sceneT < 1.5 && !reducedMotion) {
        const k = easeOutCubic(sceneT / 1.5)
        camRadius.current = 60 + (camRadiusTarget.current - 60) * k
      } else {
        // Smoothly settle toward target
        camRadius.current += (camRadiusTarget.current - camRadius.current) * 0.08
      }

      // Auto-rotate slowly when not dragging
      if (!dragging && !reducedMotion) {
        camYaw.current += 0.0006
      }
      applyCamera()

      // Stars: tiny twinkle by scaling material opacity
      starMat.opacity = 0.75 + Math.sin(t * 0.7) * 0.08

      // You-node pulse
      const pulse = 1 + Math.sin(t * 2.4) * 0.06
      youCore.scale.setScalar(reducedMotion ? 1 : pulse)
      youGlow.scale.setScalar(reducedMotion ? 1.0 : 1 + Math.sin(t * 1.6) * 0.12)
      ;(youRing.material as THREE.MeshBasicMaterial).opacity = reducedMotion ? 0.55 : 0.45 + Math.sin(t * 1.8) * 0.15
      youRing.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(t * 1.4) * 0.08)
      ;(youRing2.material as THREE.MeshBasicMaterial).opacity = reducedMotion ? 0.3 : 0.2 + Math.sin(t * 1.1 + 1) * 0.12
      youRing2.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(t * 0.9 + 1) * 0.1)

      // Ground rings subtle pulse
      ringMeshes.forEach((ring, i) => {
        const mat = ring.material as THREE.MeshBasicMaterial
        const baseOpacity = ringDefs[i].opacity
        mat.opacity = reducedMotion ? baseOpacity : baseOpacity + Math.sin(t * 0.8 + i) * 0.05
      })

      // Bubbles: entry stagger + bob + selection halo
      for (const node of nodes) {
        // Entry animation
        if (node.bornAt === 0 && sceneT >= node.entryDelay) {
          node.bornAt = sceneT
        }
        if (node.bornAt > 0) {
          const sinceBirth = sceneT - node.bornAt
          const k = Math.min(1, sinceBirth / 0.7)
          const scale = reducedMotion ? 1 : easeOutBack(k)
          node.mesh.scale.setScalar(scale)
          node.glow.scale.setScalar(scale * 0.9)
          if (k >= 0.4) node.label.style.opacity = "1"
        } else {
          node.mesh.scale.setScalar(0.001)
          node.glow.scale.setScalar(0.001)
        }

        // Bob
        const bob = reducedMotion ? 0 : Math.sin(t * 1.3 + node.bobOffset) * node.bobAmplitude
        node.mesh.position.y = node.basePos.y + bob
        node.glow.position.copy(node.mesh.position)

        // Selection emphasis
        const isSelected = selectedIdRef.current === node.place.id
        if (isSelected) {
          const sel = 1 + Math.sin(t * 4) * 0.08
          node.mesh.scale.setScalar(Math.max(node.mesh.scale.x, 1.25 * sel))
          node.glow.scale.setScalar(1.5 * sel)
          ;(node.glow.material as THREE.MeshBasicMaterial).opacity = 0.35
        } else if (hovered && hovered.place.id === node.place.id) {
          // Hover
          ;(node.glow.material as THREE.MeshBasicMaterial).opacity = 0.25
        } else {
          ;(node.glow.material as THREE.MeshBasicMaterial).opacity = 0.13
        }

        // Update line endpoint
        const positions = node.line.geometry.attributes.position as THREE.BufferAttribute
        positions.setXYZ(1, node.mesh.position.x, node.mesh.position.y, node.mesh.position.z)
        positions.needsUpdate = true

        // Update label DOM position
        const worldPos = node.mesh.position.clone()
        worldPos.y += BUBBLE_RADIUS_BY_PRIORITY[node.place.priority] + 0.9
        const { x, y, visible } = projectToScreen(worldPos)
        node.label.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`
        node.label.style.visibility = visible ? "visible" : "hidden"
      }

      // You-label projection
      const cs = projectToScreen(new THREE.Vector3(0, 2.5, 0))
      youLabel.style.transform = `translate3d(${cs.x.toFixed(1)}px, ${cs.y.toFixed(1)}px, 0) translate(-50%, -50%)`

      renderer.render(scene, camera)
      requestAnimationFrame(tick)
    }
    tick()

    // ── Resize observer ────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const s = sizeFromMount()
      w = s.w
      h = s.h
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      // Re-target camera radius for the new viewport so all bubbles stay in frame.
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
      // Dispose
      for (const node of nodes) {
        node.mesh.geometry.dispose()
        ;(node.mesh.material as THREE.Material).dispose()
        node.glow.geometry.dispose()
        ;(node.glow.material as THREE.Material).dispose()
        node.line.geometry.dispose()
        ;(node.line.material as THREE.Material).dispose()
        node.label.remove()
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
