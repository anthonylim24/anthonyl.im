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

// Visual constants
const RADIUS_BY_PRIORITY: Record<RankedPlace["priority"], number> = {
  scheduled: 9,
  core: 17,
  supplemental: 26,
}

const BUBBLE_RADIUS_BY_PRIORITY: Record<RankedPlace["priority"], number> = {
  scheduled: 2.4,
  core: 1.9,
  supplemental: 1.6,
}

interface BubbleNode {
  place: RankedPlace
  mesh: THREE.Mesh
  group: THREE.Group
  line: THREE.Line
  basePos: THREE.Vector3
  bobOffset: number
  label: HTMLDivElement
}

export function MapModeScene({ places, onSelect, selectedId, reducedMotion, onWebglError }: MapModeSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onWebglErrorRef = useRef(onWebglError)
  onWebglErrorRef.current = onWebglError

  useEffect(() => {
    const mount = mountRef.current
    const overlay = overlayRef.current
    if (!mount || !overlay) return

    // Renderer — wrap in try/catch so a missing WebGL context (corp policy,
    // headless, private mode) escalates to a list-mode fallback rather than
    // crashing the whole route.
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch (err) {
      console.warn("[map-mode] WebGL unavailable:", err)
      onWebglErrorRef.current?.()
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    const sizeFromMount = () => ({ w: mount.clientWidth, h: mount.clientHeight })
    let { w, h } = sizeFromMount()
    renderer.setSize(w, h, false)
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.touchAction = "none"

    // Scene + camera
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 200)
    camera.position.set(0, 28, 36)
    camera.lookAt(0, 0, 0)

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.7)
    scene.add(ambient)
    const key = new THREE.DirectionalLight(0xfff4e6, 0.9)
    key.position.set(20, 30, 20)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xa3c5ff, 0.6)
    rim.position.set(-15, 10, -15)
    scene.add(rim)

    // Center "user" node
    const centerGroup = new THREE.Group()
    const centerGeom = new THREE.SphereGeometry(1.2, 32, 32)
    const centerMat = new THREE.MeshStandardMaterial({
      color: 0xff4d6d,
      emissive: 0xff4d6d,
      emissiveIntensity: 0.55,
      metalness: 0.1,
      roughness: 0.3,
    })
    const centerMesh = new THREE.Mesh(centerGeom, centerMat)
    centerGroup.add(centerMesh)
    // Pulsing glow ring around the center
    const ringGeom = new THREE.RingGeometry(1.8, 2.0, 64)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff4d6d,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    })
    const ring = new THREE.Mesh(ringGeom, ringMat)
    ring.rotation.x = -Math.PI / 2
    centerGroup.add(ring)
    scene.add(centerGroup)

    // Soft ground disk to give the scene some grounding
    const groundGeom = new THREE.CircleGeometry(40, 64)
    const groundMat = new THREE.MeshBasicMaterial({ color: 0xffd9c2, transparent: true, opacity: 0.05 })
    const ground = new THREE.Mesh(groundGeom, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -1
    scene.add(ground)

    // Bubble nodes
    const nodes: BubbleNode[] = []

    // Stable sub-grouping by priority so each ring gets evenly distributed angles
    const groupedByPriority: Record<string, RankedPlace[]> = {
      scheduled: [],
      core: [],
      supplemental: [],
    }
    for (const p of places) groupedByPriority[p.priority].push(p)

    for (const priority of ["scheduled", "core", "supplemental"] as const) {
      const groupPlaces = groupedByPriority[priority]
      const ringRadius = RADIUS_BY_PRIORITY[priority]
      const angleOffset = priority === "scheduled" ? 0 : priority === "core" ? Math.PI / 8 : Math.PI / 12

      groupPlaces.forEach((place, i) => {
        const angle = angleOffset + (i / Math.max(1, groupPlaces.length)) * Math.PI * 2
        const bx = Math.cos(angle) * ringRadius
        const bz = Math.sin(angle) * ringRadius
        // Add some y-elevation jitter to make it feel 3D
        const by = priority === "scheduled" ? 1.5 : priority === "core" ? 2.5 : 3.5

        const bubbleRadius = BUBBLE_RADIUS_BY_PRIORITY[priority]
        const geom = new THREE.SphereGeometry(bubbleRadius, 28, 28)
        const color = new THREE.Color(place.color)
        const mat = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: priority === "scheduled" ? 0.5 : priority === "core" ? 0.35 : 0.2,
          metalness: 0.1,
          roughness: 0.25,
          transparent: true,
          opacity: 0.92,
        })
        const mesh = new THREE.Mesh(geom, mat)
        mesh.position.set(bx, by, bz)
        mesh.userData.placeId = place.id

        const group = new THREE.Group()
        group.add(mesh)
        scene.add(group)

        // Connecting line from center to bubble
        const lineGeom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0.4, 0),
          new THREE.Vector3(bx, by, bz),
        ])
        const lineMat = new THREE.LineBasicMaterial({
          color: priority === "scheduled" ? 0xff4d6d : priority === "core" ? 0xfb923c : 0xa3a3a3,
          transparent: true,
          opacity: priority === "scheduled" ? 0.7 : priority === "core" ? 0.5 : 0.25,
        })
        const line = new THREE.Line(lineGeom, lineMat)
        scene.add(line)

        // HTML label
        const label = document.createElement("div")
        label.dataset.placeId = place.id
        label.className =
          "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 select-none text-center"
        label.innerHTML = `
          <div class="text-2xl drop-shadow-md leading-none">${place.icon}</div>
          <div class="mt-0.5 inline-block max-w-[10rem] rounded-full bg-white/85 px-1.5 py-0.5 text-[10px] font-medium text-stone-900 shadow-sm backdrop-blur-sm dark:bg-stone-900/85 dark:text-stone-100">
            ${place.name.length > 18 ? place.name.slice(0, 17) + "…" : place.name}
          </div>
        `
        overlay.appendChild(label)

        nodes.push({
          place,
          mesh,
          group,
          line,
          basePos: new THREE.Vector3(bx, by, bz),
          bobOffset: Math.random() * Math.PI * 2,
          label,
        })
      })
    }

    // Center user label
    const centerLabel = document.createElement("div")
    centerLabel.className =
      "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 select-none text-center"
    centerLabel.innerHTML = `
      <div class="text-3xl drop-shadow-md leading-none">📍</div>
      <div class="mt-0.5 inline-block rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-md">You</div>
    `
    overlay.appendChild(centerLabel)

    // Raycaster
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let hovered: BubbleNode | null = null

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
        hovered.mesh.scale.setScalar(1)
        hovered.label.style.transform += "" // no-op
      }
      if (node && hovered !== node) {
        node.mesh.scale.setScalar(1.18)
      }
      hovered = node
      renderer.domElement.style.cursor = node ? "pointer" : "default"
    }

    function onPointerDown(e: PointerEvent) {
      setPointerFromEvent(e.clientX, e.clientY)
      const node = pickAtPointer()
      if (node) {
        onSelectRef.current(node.place)
      }
    }

    renderer.domElement.addEventListener("pointermove", onPointerMove)
    renderer.domElement.addEventListener("pointerdown", onPointerDown)

    // Touch + scroll: orbit camera with single finger drag (yaw only — keep
    // mobile-friendly). Pinch to zoom (modest range).
    let dragging = false
    let dragLastX = 0
    let yaw = 0
    let radius = Math.sqrt(36 * 36 + 28 * 28)
    let pitch = Math.atan2(28, 36)

    function applyCamera() {
      const cosPitch = Math.cos(pitch)
      camera.position.set(
        Math.sin(yaw) * radius * cosPitch,
        Math.sin(pitch) * radius,
        Math.cos(yaw) * radius * cosPitch,
      )
      camera.lookAt(0, 0, 0)
    }
    applyCamera()

    const onPointerDownDrag = (e: PointerEvent) => {
      const target = pickAtPointer()
      if (target) return // tapping a bubble — don't start drag
      dragging = true
      dragLastX = e.clientX
    }
    const onPointerMoveDrag = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - dragLastX
      dragLastX = e.clientX
      yaw -= dx * 0.005
      applyCamera()
    }
    const onPointerUpDrag = () => {
      dragging = false
    }
    renderer.domElement.addEventListener("pointerdown", onPointerDownDrag)
    renderer.domElement.addEventListener("pointermove", onPointerMoveDrag)
    renderer.domElement.addEventListener("pointerup", onPointerUpDrag)
    renderer.domElement.addEventListener("pointerleave", onPointerUpDrag)

    // Wheel zoom (desktop)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      radius = Math.max(20, Math.min(70, radius + e.deltaY * 0.05))
      applyCamera()
    }
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false })

    // Touch pinch zoom
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
          radius = Math.max(20, Math.min(70, radius * scale))
          applyCamera()
        }
        pinchDist = d
      }
    }
    renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: true })
    renderer.domElement.addEventListener("touchmove", onTouchMove, { passive: true })

    // Animate
    const clock = new THREE.Clock()
    let running = true

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

      // Center pulse
      const pulse = 1 + Math.sin(t * 2.4) * 0.06
      centerMesh.scale.setScalar(reducedMotion ? 1 : pulse)
      ring.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(t * 1.8) * 0.12)
      ringMat.opacity = reducedMotion ? 0.4 : 0.35 + Math.sin(t * 1.8) * 0.1

      // Auto-rotate scene very slowly when not actively dragging
      if (!dragging && !reducedMotion) {
        yaw += 0.0008
        applyCamera()
      }

      // Bubbles bob
      for (const node of nodes) {
        const bob = reducedMotion ? 0 : Math.sin(t * 1.3 + node.bobOffset) * 0.35
        node.mesh.position.y = node.basePos.y + bob
        const sel = selectedRef.current === node.place.id
        if (sel) {
          node.mesh.scale.setScalar(1.25)
        }
        // Update line endpoint
        const positions = node.line.geometry.attributes.position as THREE.BufferAttribute
        positions.setXYZ(1, node.mesh.position.x, node.mesh.position.y, node.mesh.position.z)
        positions.needsUpdate = true

        // Update label DOM position
        const worldPos = node.mesh.position.clone()
        worldPos.y += BUBBLE_RADIUS_BY_PRIORITY[node.place.priority] + 0.8
        const { x, y, visible } = projectToScreen(worldPos)
        node.label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
        node.label.style.opacity = visible ? "1" : "0"
      }

      // Center label projection
      const cLabelPos = new THREE.Vector3(0, 2.2, 0)
      const cs = projectToScreen(cLabelPos)
      centerLabel.style.transform = `translate(${cs.x}px, ${cs.y}px) translate(-50%, -50%)`

      renderer.render(scene, camera)
      requestAnimationFrame(tick)
    }

    const selectedRef = { current: selectedId ?? null }
    tick()

    // Resize observer
    const ro = new ResizeObserver(() => {
      const s = sizeFromMount()
      w = s.w
      h = s.h
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    ro.observe(mount)

    // Listen for external selectedId changes via a custom event
    const onSelectedChange = (e: Event) => {
      const detail = (e as CustomEvent<string | null>).detail
      selectedRef.current = detail
    }
    mount.addEventListener("korea-map-selected", onSelectedChange)

    return () => {
      running = false
      ro.disconnect()
      renderer.domElement.removeEventListener("pointermove", onPointerMove)
      renderer.domElement.removeEventListener("pointerdown", onPointerDown)
      renderer.domElement.removeEventListener("pointerdown", onPointerDownDrag)
      renderer.domElement.removeEventListener("pointermove", onPointerMoveDrag)
      renderer.domElement.removeEventListener("pointerup", onPointerUpDrag)
      renderer.domElement.removeEventListener("pointerleave", onPointerUpDrag)
      renderer.domElement.removeEventListener("wheel", onWheel)
      renderer.domElement.removeEventListener("touchstart", onTouchStart)
      renderer.domElement.removeEventListener("touchmove", onTouchMove)
      mount.removeEventListener("korea-map-selected", onSelectedChange)
      // Clean up Three.js resources
      for (const node of nodes) {
        node.mesh.geometry.dispose()
        ;(node.mesh.material as THREE.Material).dispose()
        node.line.geometry.dispose()
        ;(node.line.material as THREE.Material).dispose()
        node.label.remove()
      }
      centerLabel.remove()
      centerGeom.dispose()
      centerMat.dispose()
      ringGeom.dispose()
      ringMat.dispose()
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

  // When selectedId prop changes, dispatch to the inner ref
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    mount.dispatchEvent(new CustomEvent("korea-map-selected", { detail: selectedId ?? null }))
  }, [selectedId])

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={mountRef} className="absolute inset-0" />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0" aria-hidden />
    </div>
  )
}
