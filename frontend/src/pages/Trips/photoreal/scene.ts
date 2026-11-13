import {
  BackSide,
  CircleGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MOUSE,
  NoToneMapping,
  PerspectiveCamera,
  PMREMGenerator,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TOUCH,
  Vector3,
  WebGLRenderer,
  type WebGLRenderTarget,
} from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { Line2 } from "three/examples/jsm/lines/Line2.js"
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import type { LngLat } from "../map/geo"
import { AdaptiveQuality, initialDprForTier, maxDprForTier, tileErrorTarget } from "./adaptiveQuality"
import {
  arcPoints,
  boundsCenter,
  cameraPosition,
  chooseBearing,
  DEG,
  easeInOutCubic,
  easeOutQuart,
  fitDistance,
  flightSeconds,
  FOV_DEG,
  headingBetween,
  MAX_DISTANCE,
  MIN_DISTANCE,
  mixPose,
  overviewBearing,
  stopDistance,
  TILT_FLAT,
  TILT_MAX,
  TILT_OVERVIEW,
  TILT_STOP,
  toLocal,
  type Frame,
  type Pose,
  type Vec2,
} from "./camera"
import { detectTier } from "./deviceTier"
import type { Ground, GroundPalette } from "./ground"
import { clockHour, hourIn, sunAt } from "./sun"
import { stackLabel } from "./stops"
import { refreshYouAnchor } from "./terrainAnchor"
import { YouPin, YOU_PIN_HEIGHT } from "./youPin"

// The photoreal 3D view's engine. One instance per open: React creates it
// once and then only calls methods on it, so changing the selection never
// rebuilds the renderer or restarts the tile stream.
//
// It draws only when something moves: a flight, the idle orbit, damping
// after a drag, tiles arriving. At rest there is no animation frame at all.

export interface SceneStop extends LngLat {
  id: string
  label: string
  title: string
  /** "HH:MM", lights the scene for that hour when the stop is selected. */
  time?: string
}

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface SceneOptions {
  /** Receives the canvas. */
  host: HTMLElement
  /** Receives the stop pins (DOM buttons). Sits over the canvas. */
  pinLayer: HTMLElement
  /** An element inside the `.trips` token scope, for reading colours. */
  tokens: HTMLElement
  anchor: LngLat
  apiKey?: string
  reducedMotion: boolean
  timezone: string
  /** The day's ISO date. */
  date: string
  insets: Insets
  /** Open already looking at this stop. */
  initialStopId?: string | null
  onSelect: (id: string) => void
  /** First frame worth showing is on screen. */
  onReady: () => void
  onError: (reason: string) => void
  /** Camera bearing in radians (0 = north up), every frame it changes. */
  onYaw: (bearing: number) => void
  onTilt: (tilted: boolean) => void
  onAttribution: (text: string) => void
  /** The traveller grabbed the camera. */
  onInteract: () => void
  /** While the first view streams in: share of its tiles that have arrived, 0–1. */
  onProgress: (progress: number) => void
  /** After the reveal: whether sharper tiles are still arriving. */
  onRefining: (refining: boolean) => void
}

type Goal = { kind: "all" } | { kind: "stop"; id: string } | null

interface Pin {
  stop: SceneStop
  local: Vec2
  floor: number
  snapped: boolean
  head: Vector3
  button: HTMLButtonElement
  body: HTMLSpanElement
  /** What the badge currently reads: its own number, or a stack's range. */
  shownLabel: string
  ring: Mesh
  disc: Mesh
  veiled: boolean
  sx: number
  sy: number
  depth: number
  shown: boolean
}

interface Flight {
  from: Pose
  to: Pose
  start: number
  seconds: number
  ease: (t: number) => number
  then?: () => void
}

/** Reveal once the first view has mostly streamed in… */
const SETTLED = 0.92
/** …or this long after the first tile appeared… */
const SETTLE_AFTER_CONTENT_MS = 4500
/** …or, with nothing at all, after this. */
const ARRIVAL_DEADLINE_MS = 9000
/** Occlusion only means something up close; from high up every pin "hides" behind a hill. */
const VEIL_RANGE_M = 1400
const ORBIT_RATE = 1.5 * DEG
const ORBIT_SECONDS = 48
const PIN_GAP_PX = 34

function css(el: HTMLElement, name: string, fallback: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback
}

export class PhotorealScene {
  private readonly opts: SceneOptions
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera: PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly quality: AdaptiveQuality
  private readonly hemi = new HemisphereLight(0xffffff, 0x888888, 0.9)
  private readonly sun = new DirectionalLight(0xffffff, 2.2)
  private readonly sky: Mesh
  private readonly skyMat: ShaderMaterial
  private readonly fog = new FogExp2(0xffffff, 0.00004)
  private readonly markers = new Group()
  private readonly ringGeo = new RingGeometry(0.78, 1, 48)
  private readonly discGeo = new CircleGeometry(0.78, 40)
  private readonly ringMat = new MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false, fog: false })
  private readonly discMat = new MeshBasicMaterial({ transparent: true, opacity: 0.2, depthWrite: false, fog: false })
  private stemGeo = new LineSegmentsGeometry()
  private stemCount = -1
  private readonly stemMat = new LineMaterial({ linewidth: 2, transparent: true, opacity: 0.8, fog: false })
  private readonly stems: LineSegments2
  private readonly lineMats: {
    casing: LineMaterial
    main: LineMaterial
    ghost: LineMaterial
    mainHot: LineMaterial
    casingHot: LineMaterial
    mainDim: LineMaterial
    casingDim: LineMaterial
  }
  private readonly routeGroup = new Group()
  private legs: Array<{ geo: LineGeometry; casing: Line2; main: Line2; ghost: Line2 }> = []
  private ground: Ground | null = null
  private palette: GroundPalette
  private pins: Pin[] = []
  private selectedId: string | null = null
  private hotId: string | null = null
  private goal: Goal = null
  private flight: Flight | null = null
  private orbitUntil = 0
  private raf = 0
  private dirty = false
  private last = 0
  private disposed = false
  private ready = false
  private arrival: { pose: Pose; deadline: number; contentAt: number } | null = null
  private lastProgress = -1
  private refining = false
  private refiningSince = 0
  private width = 1
  private height = 1
  private insets: Insets
  private snapQueue: number[] = []
  private snapWanted = true
  private lastSnapFill = 0
  private veilCursor = 0
  private lastVeil = 0
  private routeStale = true
  private lastYaw = NaN
  private lastTilted: boolean | null = null
  private lastAttribution = ""
  private lastAttributionAt = 0
  private fade = 0
  private you: YouPin | null = null
  private youLocal: Vec2 | null = null
  private youLabel: HTMLSpanElement | null = null
  private youFloorAt = 0
  private env: WebGLRenderTarget | null = null
  private hour: number
  private readonly resizeObserver: ResizeObserver
  private readonly tmp = new Vector3()
  private readonly tmp2 = new Vector3()

  constructor(opts: SceneOptions) {
    this.opts = opts
    this.insets = opts.insets
    this.hour = hourIn(opts.timezone)
    this.palette = this.readPalette()

    const tier = detectTier()
    const deviceDpr = window.devicePixelRatio || 1
    this.quality = new AdaptiveQuality({
      maxDpr: maxDprForTier(tier, deviceDpr),
      minDpr: 1,
      initialDpr: initialDprForTier(tier, deviceDpr),
    })
    // The log depth buffer lets rooftops a few metres away and a skyline
    // tens of kilometres off resolve in the same frame.
    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      logarithmicDepthBuffer: true,
      stencil: false,
    })
    this.renderer.setPixelRatio(this.quality.dpr)
    this.renderer.toneMapping = NoToneMapping
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.transmissionResolutionScale = 0.4
    const canvas = this.renderer.domElement
    Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block", touchAction: "none" })
    canvas.setAttribute("aria-hidden", "true")
    opts.host.appendChild(canvas)
    canvas.addEventListener("webglcontextlost", this.onContextLost)

    this.camera = new PerspectiveCamera(FOV_DEG, 1, 4, 220_000)
    this.scene.fog = this.fog
    this.scene.add(this.hemi, this.sun, this.sun.target)

    this.skyMat = new ShaderMaterial({
      uniforms: { uHorizon: { value: new Color() }, uZenith: { value: new Color() } },
      side: BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uHorizon;
        uniform vec3 uZenith;
        varying vec3 vDir;
        void main() {
          float up = clamp(normalize(vDir).y, 0.0, 1.0);
          gl_FragColor = vec4(mix(uHorizon, uZenith, pow(up, 0.55)), 1.0);
          #include <colorspace_fragment>
        }
      `,
    })
    this.sky = new Mesh(new SphereGeometry(1, 32, 16), this.skyMat)
    this.sky.scale.setScalar(90_000)
    this.sky.renderOrder = -10
    this.sky.frustumCulled = false
    this.scene.add(this.sky)

    const line = (linewidth: number, opacity: number, depthTest: boolean) =>
      new LineMaterial({ linewidth, transparent: true, opacity, depthTest, depthWrite: false, fog: false })
    // Widths are screen pixels at every zoom: a hairline route, never a band.
    this.lineMats = {
      casing: line(5, 0.85, true),
      main: line(3, 1, true),
      ghost: line(3, 0.28, false),
      casingHot: line(5.5, 0.95, true),
      mainHot: line(3.5, 1, true),
      casingDim: line(4.5, 0.25, true),
      mainDim: line(2.5, 0.35, true),
    }
    this.stems = new LineSegments2(this.stemGeo, this.stemMat)
    this.stems.frustumCulled = false
    this.stems.renderOrder = 22
    this.stems.visible = false
    this.scene.add(this.routeGroup, this.markers, this.stems)

    const controls = new OrbitControls(this.camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.12
    controls.rotateSpeed = 0.45
    controls.zoomSpeed = 0.9
    controls.panSpeed = 1
    controls.screenSpacePanning = false
    controls.zoomToCursor = true
    controls.minDistance = MIN_DISTANCE
    controls.maxDistance = MAX_DISTANCE / 3
    controls.minPolarAngle = TILT_FLAT
    controls.maxPolarAngle = TILT_MAX
    // Map-like: drag pans, right-drag (or Shift / Ctrl + drag) turns and tilts.
    controls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }
    controls.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_ROTATE }
    controls.addEventListener("start", this.onGrab)
    controls.addEventListener("change", this.invalidate)
    this.controls = controls

    this.applyPalette()
    this.applySun()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(opts.host)
    this.resize()
    document.addEventListener("visibilitychange", this.onVisibility)
  }

  /** Build the scene and what it stands on. Rejects when WebGL or the ground can't start. */
  static async create(opts: SceneOptions, stops: readonly SceneStop[]): Promise<PhotorealScene> {
    const scene = new PhotorealScene(opts)
    try {
      await scene.start(stops)
    } catch (error) {
      scene.dispose()
      throw error
    }
    return scene
  }

  private async start(stops: readonly SceneStop[]) {
    const context = {
      renderer: this.renderer,
      camera: this.camera,
      anchor: this.opts.anchor,
      stops: stops.map((s) => toLocal(this.opts.anchor, s)),
      palette: this.palette,
      sun: this.sun,
      invalidate: this.onGroundChange,
      onFatal: (reason: string) => !this.disposed && this.opts.onError(reason),
    }
    let ground: Ground
    if (this.opts.apiKey) {
      const { createTilesGround } = await import("./tilesGround")
      ground = createTilesGround(context, this.opts.apiKey)
    } else if (import.meta.env.DEV) {
      const { createDevGround } = await import("./devGround")
      ground = createDevGround(context)
    } else {
      throw new Error("no map tiles key")
    }
    if (this.disposed) {
      ground.dispose()
      return
    }
    this.ground = ground
    this.scene.add(ground.group)
    this.applySun()
    this.setStops(stops)

    const first = this.opts.initialStopId && this.pins.some((p) => p.stop.id === this.opts.initialStopId) ? this.opts.initialStopId : null
    this.selectedId = first
    this.goal = first ? { kind: "stop", id: first } : { kind: "all" }
    this.markSelection()
    // Behind the veil the camera already sits where it will end up, so the
    // tiles that stream in are the ones the reveal needs.
    const pose = this.poseFor(this.goal, null)
    this.applyPose(pose)
    this.arrival = { pose, deadline: performance.now() + ARRIVAL_DEADLINE_MS, contentAt: 0 }
    this.invalidate()
  }

  // ── Public API ──────────────────────────────────────────────────────────

  setStops(stops: readonly SceneStop[]) {
    for (const pin of this.pins) {
      pin.button.remove()
      this.markers.remove(pin.ring, pin.disc)
    }
    const previous = new Map(this.pins.map((p) => [p.stop.id, p]))
    this.pins = stops.map((stop) => {
      const local = toLocal(this.opts.anchor, stop)
      const old = previous.get(stop.id)
      const kept = old && Math.hypot(old.local.x - local.x, old.local.z - local.z) < 1 ? old : null
      const button = document.createElement("button")
      button.type = "button"
      button.className = "atlas-pin atlas-pin--stop photoreal-pin"
      button.setAttribute("aria-label", `Stop ${stop.label}: ${stop.title}`)
      button.dataset.stop = stop.id
      const body = document.createElement("span")
      body.className = "atlas-pin__body"
      body.textContent = stop.label
      const name = document.createElement("span")
      name.className = "photoreal-pin__name"
      name.textContent = stop.title
      name.setAttribute("aria-hidden", "true")
      button.append(body, name)
      button.addEventListener("click", () => this.opts.onSelect(stop.id))
      this.opts.pinLayer.appendChild(button)
      const ring = new Mesh(this.ringGeo, this.ringMat)
      const disc = new Mesh(this.discGeo, this.discMat)
      for (const mesh of [ring, disc]) {
        mesh.rotation.x = -Math.PI / 2
        mesh.renderOrder = 20
        mesh.visible = false
      }
      this.markers.add(ring, disc)
      return {
        stop,
        local,
        floor: kept?.floor ?? 0,
        snapped: kept?.snapped ?? false,
        head: new Vector3(),
        button,
        body,
        shownLabel: stop.label,
        ring,
        disc,
        veiled: false,
        sx: 0,
        sy: 0,
        depth: 0,
        shown: false,
      }
    })
    if (this.selectedId && !this.pins.some((p) => p.stop.id === this.selectedId)) this.selectedId = null
    this.snapWanted = true
    this.routeStale = true
    this.markSelection()
    this.invalidate()
  }

  /** Select a stop and fly to it; `null` returns to the whole day. */
  select(id: string | null) {
    if (this.disposed || !this.ground) return
    const pin = id ? this.pins.find((p) => p.stop.id === id) : undefined
    const previous = this.selectedId
    this.selectedId = pin ? pin.stop.id : null
    this.markSelection()
    this.applySun()
    if (this.arrival && !this.ready) {
      // Still arriving: retarget the arrival instead of starting a second flight.
      this.goal = pin ? { kind: "stop", id: pin.stop.id } : { kind: "all" }
      this.arrival.pose = this.poseFor(this.goal, null)
      this.applyPose(this.arrival.pose)
      this.invalidate()
      return
    }
    if (pin && previous === pin.stop.id && this.goal?.kind === "stop" && this.goal.id === pin.stop.id) return
    this.goal = pin ? { kind: "stop", id: pin.stop.id } : { kind: "all" }
    this.flyToGoal()
  }

  /** Frame every stop without changing the selection. */
  fitAll() {
    if (this.disposed || !this.ground) return
    this.goal = { kind: "all" }
    this.flyToGoal()
  }

  setHot(id: string | null) {
    if (this.hotId === id) return
    this.hotId = id
    for (const pin of this.pins) pin.button.classList.toggle("atlas-pin--hot", pin.stop.id === id)
  }

  /** Re-read the theme's colours (call after the light / dark class flips). */
  setTheme() {
    this.palette = this.readPalette()
    this.applyPalette()
    this.ground?.setPalette(this.palette)
    this.applySun()
    this.invalidate()
  }

  orientNorth() {
    const pose = this.currentPose()
    this.goal = null
    this.fly({ ...pose, bearing: 0 }, 0.7, easeInOutCubic)
  }

  /** Top-down ↔ three-quarter. Returns whether the view ends up tilted. */
  toggleTilt(): boolean {
    const pose = this.currentPose()
    const tilted = pose.tilt > 20 * DEG
    this.goal = null
    this.fly({ ...pose, tilt: tilted ? TILT_FLAT : TILT_OVERVIEW }, 0.8, easeInOutCubic)
    return !tilted
  }

  /** Stop any camera move the traveller didn't ask for (the idle orbit). */
  rest() {
    this.orbitUntil = 0
  }

  setInsets(insets: Insets) {
    const same = insets.top === this.insets.top && insets.right === this.insets.right && insets.bottom === this.insets.bottom && insets.left === this.insets.left
    if (same) return
    this.insets = insets
    this.resize()
    if (this.goal && this.ready && !this.flight) this.fly(this.poseFor(this.goal, this.currentPose().bearing), 0.5, easeInOutCubic, true)
  }

  /** Show the traveller at a real position, or hide them with `null`. */
  setUser(coords: LngLat | null) {
    if (this.disposed) return
    if (!coords) {
      this.youLocal = null
      if (this.you) this.you.group.visible = false
      this.youLabel?.remove()
      this.youLabel = null
      this.invalidate()
      return
    }
    if (!this.you) {
      this.you = new YouPin({
        transmission: true,
        reducedMotion: this.opts.reducedMotion,
        accent: new Color(css(this.opts.tokens, "--brand-fill", "#f0582b")),
      })
      this.you.setDim(this.palette.dark)
      this.scene.add(this.you.group)
      // The droplet is glass; give it a sky to reflect.
      const pmrem = new PMREMGenerator(this.renderer)
      const room = new Scene()
      room.background = new Color(this.palette.canvas)
      this.env = pmrem.fromScene(room, 0.04)
      pmrem.dispose()
      this.scene.environment = this.env.texture
    }
    if (!this.youLabel) {
      this.youLabel = document.createElement("span")
      this.youLabel.className = "photoreal-you"
      this.youLabel.textContent = "You"
      this.opts.pinLayer.appendChild(this.youLabel)
    }
    this.youLocal = toLocal(this.opts.anchor, coords)
    this.you.place(this.youLocal.x, this.youLocal.z)
    this.youFloorAt = 0
    this.invalidate()
  }

  /** Fly to the traveller, if they are on the map. */
  showUser() {
    if (!this.youLocal || !this.ground) return
    const pose = this.currentPose()
    this.goal = null
    this.fly(
      { ...pose, x: this.youLocal.x, y: this.you?.surfaceY ?? 0, z: this.youLocal.z, distance: 420, tilt: TILT_STOP },
      flightSeconds(Math.hypot(this.youLocal.x - pose.x, this.youLocal.z - pose.z)),
      easeInOutCubic,
    )
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.raf)
    window.clearTimeout(this.fade)
    document.removeEventListener("visibilitychange", this.onVisibility)
    this.resizeObserver.disconnect()
    this.controls.removeEventListener("start", this.onGrab)
    this.controls.removeEventListener("change", this.invalidate)
    this.controls.dispose()
    for (const pin of this.pins) pin.button.remove()
    this.pins = []
    this.youLabel?.remove()
    this.clearLegs()
    this.ground?.dispose()
    this.you?.dispose()
    this.env?.dispose()
    this.ringGeo.dispose()
    this.discGeo.dispose()
    this.ringMat.dispose()
    this.discMat.dispose()
    this.stemGeo.dispose()
    this.stemMat.dispose()
    Object.values(this.lineMats).forEach((m) => m.dispose())
    this.sky.geometry.dispose()
    this.skyMat.dispose()
    const canvas = this.renderer.domElement
    canvas.removeEventListener("webglcontextlost", this.onContextLost)
    this.renderer.dispose()
    // Hand the GPU context back now; browsers cap how many a tab may hold.
    this.renderer.forceContextLoss()
    canvas.remove()
  }

  // ── Theme, light ────────────────────────────────────────────────────────

  private readPalette(): GroundPalette {
    const el = this.opts.tokens
    return {
      dark: document.documentElement.classList.contains("dark"),
      canvas: css(el, "--trips-canvas", "#f1f0eb"),
      surface: css(el, "--trips-surface", "#faf9f6"),
      sunken: css(el, "--trips-sunken", "#e8e7e1"),
      ink: css(el, "--trips-ink", "#14171a"),
      line: css(el, "--trips-ink-tertiary", "#696e75"),
    }
  }

  private applyPalette() {
    const el = this.opts.tokens
    const p = this.palette
    const accent = new Color(css(el, "--ta-fill", "#f0582b"))
    const raised = new Color(css(el, "--trips-raised", "#ffffff"))
    const canvas = new Color(p.canvas)
    // A quiet sky: the page's own paper at the horizon, a breath of blue
    // (or deeper ink) overhead. The haze fades the far city into it.
    const horizon = p.dark ? canvas.clone().lerp(new Color(p.ink), 0.09) : canvas.clone()
    const zenith = p.dark ? new Color(p.sunken) : canvas.clone().lerp(new Color("#a9c0d6"), 0.62)
    ;(this.skyMat.uniforms.uHorizon!.value as Color).copy(horizon)
    ;(this.skyMat.uniforms.uZenith!.value as Color).copy(zenith)
    this.fog.color.copy(horizon)
    this.renderer.setClearColor(horizon, 1)
    this.ringMat.color.copy(accent)
    this.discMat.color.copy(accent)
    this.stemMat.color.copy(p.dark ? raised.clone().lerp(new Color(p.ink), 0.75) : new Color(p.ink))
    this.lineMats.main.color.copy(accent)
    this.lineMats.mainHot.color.copy(accent)
    this.lineMats.ghost.color.copy(accent)
    this.lineMats.mainDim.color.copy(accent)
    this.lineMats.casing.color.copy(raised)
    this.lineMats.casingHot.color.copy(raised)
    this.lineMats.casingDim.color.copy(raised)
    this.you?.setDim(p.dark)
  }

  private applySun() {
    const selected = this.pins.find((p) => p.stop.id === this.selectedId)
    let sun = sunAt({ hour: clockHour(selected?.stop.time) ?? this.hour, latDeg: this.opts.anchor.lat, date: this.opts.date })
    // Planning at midnight shouldn't mean a day theme lit by the moon: with
    // the light theme and no sun, borrow a mid-morning one.
    if (sun.belowHorizon && !this.palette.dark) sun = sunAt({ hour: 10.5, latDeg: this.opts.anchor.lat, date: this.opts.date })
    // The clock sets where the light comes from; the theme sets its mood.
    const night = this.palette.dark
    const warm = new Color("#fffaf2").lerp(new Color("#ffd9ae"), (1 - sun.height) * 0.45)
    this.sun.color.copy(night ? new Color("#b9c8e6") : warm)
    this.sun.intensity = night ? 1.3 : 2.3
    this.sun.position.set(sun.dir.x * 6000, sun.dir.y * 6000, sun.dir.z * 6000)
    this.hemi.color.set(night ? "#5d6a85" : "#f6f8fc")
    this.hemi.groundColor.set(night ? "#1c2028" : "#d9d5cc")
    this.hemi.intensity = night ? 0.9 : 1.35
    this.ground?.setSun(sun.dir)
    this.invalidate()
  }

  // ── Camera ──────────────────────────────────────────────────────────────

  private frame(): Frame {
    const freeW = Math.max(120, this.width - this.insets.left - this.insets.right)
    const freeH = Math.max(120, this.height - this.insets.top - this.insets.bottom)
    return {
      tanV: Math.tan((FOV_DEG * DEG) / 2),
      aspect: this.width / this.height,
      marginX: Math.max(0.1, (freeW / 2 - 44) / (this.width / 2)),
      marginTop: Math.max(0.1, (freeH / 2 - 64) / (this.height / 2)),
      marginBottom: Math.max(0.1, (freeH / 2 - 28) / (this.height / 2)),
    }
  }

  private poseFor(goal: NonNullable<Goal>, keepBearing: number | null): Pose {
    if (goal.kind === "stop") {
      const index = this.pins.findIndex((p) => p.stop.id === goal.id)
      const pin = this.pins[index]
      if (pin) {
        let nearest: number | null = null
        for (const other of this.pins) {
          if (other === pin) continue
          const d = Math.hypot(other.local.x - pin.local.x, other.local.z - pin.local.z)
          if (d > 20 && (nearest === null || d < nearest)) nearest = d
        }
        const onward = this.pins[index + 1] ?? null
        const before = this.pins[index - 1] ?? null
        const travel = onward ? headingBetween(pin.local, onward.local) : before ? headingBetween(before.local, pin.local) : null
        const bearing = keepBearing === null ? (travel ?? 0) - 24 * DEG : chooseBearing(keepBearing, travel)
        const portrait = this.width < this.height
        return {
          x: pin.local.x,
          y: pin.floor,
          z: pin.local.z,
          distance: stopDistance(nearest) * (portrait ? 1.12 : 1),
          bearing,
          tilt: TILT_STOP,
        }
      }
    }
    const points = this.pins.map((p) => p.local)
    const target = boundsCenter(points)
    const frame = this.frame()
    const portrait = this.width - this.insets.left - this.insets.right < this.height - this.insets.top - this.insets.bottom
    const bearing = overviewBearing(points, portrait)
    const floors = this.pins.filter((p) => p.snapped).map((p) => p.floor)
    return {
      x: target.x,
      y: floors.length ? floors.reduce((sum, y) => sum + y, 0) / floors.length : 0,
      z: target.z,
      distance: fitDistance(points, target, bearing, TILT_OVERVIEW, frame, 520) * 1.03,
      bearing,
      tilt: TILT_OVERVIEW,
    }
  }

  private currentPose(): Pose {
    const t = this.controls.target
    const offset = this.tmp.copy(this.camera.position).sub(t)
    const distance = Math.max(1, offset.length())
    return {
      x: t.x,
      y: t.y,
      z: t.z,
      distance,
      bearing: Math.atan2(offset.x, -offset.z),
      tilt: Math.acos(Math.min(1, Math.max(-1, offset.y / distance))),
    }
  }

  private applyPose(pose: Pose) {
    const at = cameraPosition(pose)
    this.camera.position.set(at.x, at.y, at.z)
    this.controls.target.set(pose.x, pose.y, pose.z)
    this.camera.lookAt(this.controls.target)
  }

  private flyToGoal() {
    if (!this.goal) return
    const from = this.currentPose()
    const to = this.poseFor(this.goal, from.bearing)
    const stop = this.goal.kind === "stop"
    this.fly(to, flightSeconds(Math.hypot(to.x - from.x, to.z - from.z)), easeInOutCubic, false, () => {
      if (stop && !this.opts.reducedMotion) this.orbitUntil = performance.now() + ORBIT_SECONDS * 1000
    })
  }

  private fly(to: Pose, seconds: number, ease: (t: number) => number, keepOrbit = false, then?: () => void) {
    if (!keepOrbit) this.orbitUntil = 0
    if (this.opts.reducedMotion) {
      // No travel: a jump cut, softened by dipping the canvas.
      this.flight = null
      const canvas = this.renderer.domElement
      canvas.style.transition = "opacity 140ms ease"
      canvas.style.opacity = "0.25"
      window.clearTimeout(this.fade)
      this.fade = window.setTimeout(() => {
        if (this.disposed) return
        this.applyPose(to)
        canvas.style.opacity = "1"
        this.invalidate()
      }, 140)
      return
    }
    this.flight = { from: this.currentPose(), to, start: performance.now(), seconds, ease, then }
    this.invalidate()
  }

  private readonly onGrab = () => {
    this.flight = null
    this.orbitUntil = 0
    this.goal = null
    if (this.arrival) this.finishArrival(false)
    this.opts.onInteract()
  }

  private finishArrival(fly: boolean) {
    const arrival = this.arrival
    if (!arrival) return
    this.arrival = null
    if (!this.ready) {
      this.ready = true
      this.opts.onReady()
    }
    if (fly && this.opts.reducedMotion) this.applyPose(arrival.pose)
    else if (fly) {
      const stop = this.goal?.kind === "stop"
      // A short settle from a little higher and off-axis: enough to arrive, not enough to need other tiles.
      this.applyPose({ ...arrival.pose, distance: arrival.pose.distance * 1.4, tilt: Math.max(TILT_FLAT, arrival.pose.tilt - 14 * DEG), bearing: arrival.pose.bearing - 16 * DEG })
      this.fly(arrival.pose, 2.4, easeOutQuart, false, () => {
        if (stop) this.orbitUntil = performance.now() + ORBIT_SECONDS * 1000
      })
    }
  }

  // ── Stops: pins, stems, rings, route ────────────────────────────────────

  private markSelection() {
    for (const pin of this.pins) {
      const on = pin.stop.id === this.selectedId
      pin.button.classList.toggle("atlas-pin--active", on)
      if (on) pin.button.setAttribute("aria-current", "true")
      else pin.button.removeAttribute("aria-current")
    }
    const at = this.pins.findIndex((p) => p.stop.id === this.selectedId)
    this.legs.forEach((leg, i) => {
      // Leg i runs from stop i to stop i + 1.
      const hot = at >= 0 && (i === at || i === at - 1)
      // With a stop selected, its own legs lead and the rest of the day recedes.
      const dim = at >= 0 && !hot
      leg.main.material = hot ? this.lineMats.mainHot : dim ? this.lineMats.mainDim : this.lineMats.main
      leg.casing.material = hot ? this.lineMats.casingHot : dim ? this.lineMats.casingDim : this.lineMats.casing
      leg.ghost.visible = leg.main.visible && !dim
      leg.main.renderOrder = hot ? 16 : 14
      leg.casing.renderOrder = hot ? 15 : 13
    })
    this.invalidate()
  }

  private clearLegs() {
    for (const leg of this.legs) {
      this.routeGroup.remove(leg.casing, leg.main, leg.ghost)
      leg.geo.dispose()
    }
    this.legs = []
  }

  private buildRoute() {
    this.routeStale = false
    this.clearLegs()
    const seen = new Set<string>()
    for (let i = 0; i + 1 < this.pins.length; i++) {
      const a = this.pins[i]!
      const b = this.pins[i + 1]!
      const geo = new LineGeometry()
      const key = [a.stop.id, b.stop.id].sort().join("|")
      const length = Math.hypot(b.local.x - a.local.x, b.local.z - a.local.z)
      // Same pair twice (out and back) or two stops on one spot: nothing to draw.
      const skip = seen.has(key) || length < 4
      seen.add(key)
      geo.setPositions(arcPoints({ x: a.local.x, y: a.floor + 3, z: a.local.z }, { x: b.local.x, y: b.floor + 3, z: b.local.z }, 40))
      const casing = new Line2(geo, this.lineMats.casing)
      const main = new Line2(geo, this.lineMats.main)
      const ghost = new Line2(geo, this.lineMats.ghost)
      ghost.renderOrder = 12
      for (const mesh of [casing, main, ghost]) {
        mesh.frustumCulled = false
        mesh.visible = !skip
      }
      this.routeGroup.add(ghost, casing, main)
      this.legs.push({ geo, casing, main, ghost })
    }
    this.markSelection()
  }

  private snapOne(index: number) {
    const pin = this.pins[index]
    const ground = this.ground
    if (!pin || !ground) return
    const hit = refreshYouAnchor((x, z) => ground.floorAt(x, z), pin.snapped ? pin.floor : null, pin.local.x, pin.local.z)
    if (!hit) return
    if (!pin.snapped || Math.abs(hit.point.y - pin.floor) > 0.4) {
      pin.floor = hit.point.y
      pin.snapped = true
      this.routeStale = true
      // The ground turned out higher or lower than assumed: keep whatever
      // the camera is aimed at (or flying to) sitting on it.
      const goal = this.goal
      if (goal && (goal.kind === "all" || goal.id === pin.stop.id)) {
        const y = this.poseFor(goal, 0).y
        if (this.arrival) this.arrival.pose.y = y
        else if (this.flight) this.flight.to.y = y
        else {
          this.camera.position.y += y - this.controls.target.y
          this.controls.target.y = y
        }
      }
    }
  }

  private layoutMarkers() {
    const cam = this.camera.position
    const count = this.pins.length
    if (count !== this.stemCount) {
      // Line geometry can't be resized in place; swap it when the stop count changes.
      this.stemGeo.dispose()
      this.stemGeo = new LineSegmentsGeometry()
      if (count) this.stemGeo.setPositions(new Float32Array(count * 6))
      this.stems.geometry = this.stemGeo
      this.stemCount = count
    }
    this.stems.visible = count > 0
    const start = this.stemGeo.getAttribute("instanceStart") as { data: { array: Float32Array; needsUpdate: boolean } } | undefined
    const positions = start?.data.array
    let at = 0
    for (const pin of this.pins) {
      const distance = Math.hypot(cam.x - pin.local.x, cam.y - pin.floor, cam.z - pin.local.z)
      const lift = Math.min(150, Math.max(5, distance * 0.05))
      pin.head.set(pin.local.x, pin.floor + lift, pin.local.z)
      const radius = Math.min(60, Math.max(2.4, distance * 0.012)) * (pin.stop.id === this.selectedId ? 1.5 : 1)
      for (const mesh of [pin.ring, pin.disc]) {
        mesh.position.set(pin.local.x, pin.floor + 0.7, pin.local.z)
        mesh.scale.setScalar(radius)
        mesh.visible = true
      }
      if (positions) {
        positions[at++] = pin.local.x
        positions[at++] = pin.floor + 0.7
        positions[at++] = pin.local.z
        positions[at++] = pin.local.x
        positions[at++] = pin.floor + lift
        positions[at++] = pin.local.z
      }
    }
    if (start) start.data.needsUpdate = true
  }

  private projectPins() {
    const w = this.width
    const h = this.height
    for (const pin of this.pins) {
      const v = this.tmp.copy(pin.head).project(this.camera)
      pin.shown = v.z > -1 && v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.2
      pin.sx = ((v.x + 1) / 2) * w
      pin.sy = ((1 - v.y) / 2) * h
      pin.depth = v.z
    }
    // Declutter without ever dropping a stop: pins that overlap on screen
    // merge into one badge carrying their numbers ("4–6"), led by the
    // earliest of them. The selected stop always stands alone.
    const order = this.pins
      .filter((p) => p.shown)
      .sort((a, b) => Number(b.stop.id === this.selectedId) - Number(a.stop.id === this.selectedId))
    const stacks = new Map<Pin, Pin[]>()
    for (const pin of order) {
      const selected = pin.stop.id === this.selectedId
      let leader: Pin | undefined
      if (!selected) {
        for (const k of stacks.keys()) {
          if (k.stop.id !== this.selectedId && Math.hypot(k.sx - pin.sx, k.sy - pin.sy) < PIN_GAP_PX) {
            leader = k
            break
          }
        }
      }
      if (leader) stacks.get(leader)!.push(pin)
      else stacks.set(pin, [pin])
    }
    let z = stacks.size
    const leaders = new Set(stacks.keys())
    for (const [pin, members] of stacks) {
      const selected = pin.stop.id === this.selectedId
      const label = members.length > 1 ? stackLabel(members.map((m) => Number(m.stop.label))) : pin.stop.label
      if (pin.shownLabel !== label) {
        pin.shownLabel = label
        pin.body.textContent = label
        pin.button.classList.toggle("photoreal-pin--stack", members.length > 1)
        pin.button.setAttribute(
          "aria-label",
          members.length > 1 ? `Stops ${label}: ${members.map((m) => m.stop.title).join(", ")}` : `Stop ${pin.stop.label}: ${pin.stop.title}`,
        )
      }
      pin.button.classList.toggle("photoreal-pin--veiled", !selected && members.every((m) => m.veiled))
      pin.button.style.zIndex = String(selected ? 999 : z--)
    }
    for (const pin of this.pins) {
      const on = pin.shown && leaders.has(pin)
      pin.button.style.visibility = on ? "visible" : "hidden"
      if (on) pin.button.style.transform = `translate3d(${pin.sx.toFixed(1)}px, ${pin.sy.toFixed(1)}px, 0) translate(-50%, -100%)`
    }
    if (this.youLabel && this.you) {
      const visible = this.you.group.visible
      const v = this.tmp.set(this.you.group.position.x, this.you.surfaceY + YOU_PIN_HEIGHT + 4, this.you.group.position.z).project(this.camera)
      const on = visible && v.z > -1 && v.z < 1
      this.youLabel.style.visibility = on ? "visible" : "hidden"
      if (on) this.youLabel.style.transform = `translate3d(${(((v.x + 1) / 2) * w).toFixed(1)}px, ${(((1 - v.y) / 2) * h).toFixed(1)}px, 0) translate(-50%, -100%)`
    }
  }

  private checkVeil(pin: Pin) {
    if (!this.ground || !pin.shown) return
    const near = this.camera.position.distanceTo(pin.head) < VEIL_RANGE_M
    pin.veiled = near && this.ground.blocked(this.camera.position, this.tmp2.copy(pin.head))
  }

  // ── Frame loop ──────────────────────────────────────────────────────────

  private readonly invalidate = () => {
    this.dirty = true
    if (!this.raf && !this.disposed && document.visibilityState !== "hidden") this.raf = requestAnimationFrame(this.tick)
  }

  private readonly onGroundChange = () => {
    this.snapWanted = true
    this.invalidate()
  }

  private readonly onVisibility = () => {
    if (document.visibilityState === "visible") this.invalidate()
  }

  private readonly onContextLost = (event: Event) => {
    event.preventDefault()
    if (!this.disposed) this.opts.onError("WebGL context lost")
  }

  private resize() {
    if (this.disposed) return
    const w = Math.max(1, this.opts.host.clientWidth)
    const h = Math.max(1, this.opts.host.clientHeight)
    this.width = w
    this.height = h
    this.renderer.setPixelRatio(this.quality.dpr)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    // Chrome covers part of the view: move the optical centre to the middle of what is left.
    const dx = (this.insets.left - this.insets.right) / 2
    const dy = (this.insets.top - this.insets.bottom) / 2
    if (dx || dy) this.camera.setViewOffset(w, h, -dx, -dy, w, h)
    else this.camera.clearViewOffset()
    this.camera.updateProjectionMatrix()
    const lines = [this.stemMat, ...Object.values(this.lineMats)]
    for (const m of lines) m.resolution.set(w, h)
    this.ground?.resize()
    this.invalidate()
  }

  private readonly tick = (now: number) => {
    this.raf = 0
    if (this.disposed || document.visibilityState === "hidden") return
    const ground = this.ground
    const dt = Math.min(100, Math.max(0, now - (this.last || now)))
    const consecutive = now - this.last < 100
    this.last = now
    this.dirty = false
    let active = false

    if (this.arrival && ground) {
      active = true
      const arrival = this.arrival
      const progress = ground.progress()
      if (ground.hasContent() && !arrival.contentAt) arrival.contentAt = now
      if (Math.abs(progress - this.lastProgress) > 0.01) {
        this.lastProgress = progress
        this.opts.onProgress(progress)
      }
      const settled = ground.hasContent() && (progress >= SETTLED || now - arrival.contentAt > SETTLE_AFTER_CONTENT_MS)
      if (settled || now > arrival.deadline) this.finishArrival(true)
    }
    if (this.flight) {
      const f = this.flight
      const t = Math.min(1, (now - f.start) / (f.seconds * 1000))
      this.applyPose(mixPose(f.from, f.to, f.ease(t), t))
      if (t >= 1) {
        this.flight = null
        f.then?.()
      }
      active = true
    } else if (this.orbitUntil > now && this.ready) {
      const pose = this.currentPose()
      // Ease out of the orbit over its last seconds rather than stopping dead.
      const fadeOut = Math.min(1, (this.orbitUntil - now) / 4000)
      this.applyPose({ ...pose, bearing: pose.bearing + ORBIT_RATE * (dt / 1000) * fadeOut })
      active = true
    } else if (this.controls.update()) {
      active = true
    }
    this.camera.updateMatrixWorld()

    if (ground) {
      const pose = this.currentPose()
      if (consecutive && active && this.quality.sample(dt)) this.resize()
      ground.setErrorTarget(tileErrorTarget(this.quality.lod, false, pose.distance))
      ground.update()
      if (ground.busy()) active = true
      this.fog.density = Math.min(0.00011, Math.max(0.000012, 0.085 / Math.max(300, pose.distance)))

      // Stand the stops on the ground: one per frame, again whenever new ground arrives.
      if (this.snapQueue.length === 0 && this.snapWanted && ground.hasContent() && now - this.lastSnapFill > 350) {
        this.snapWanted = false
        this.lastSnapFill = now
        this.snapQueue = this.pins.map((_, i) => i)
      }
      if (this.snapQueue.length) {
        this.snapOne(this.snapQueue.shift()!)
        active = true
      }
      if (this.routeStale && this.snapQueue.length === 0) this.buildRoute()

      if (this.you && this.youLocal && ground.hasContent() && now - this.youFloorAt > 600) {
        this.youFloorAt = now
        const here = this.youLocal
        const hit = refreshYouAnchor((x, z) => ground.floorAt(x, z), this.you.hasAnchor ? this.you.surfaceY : null, here.x, here.z)
        if (hit) this.you.setTarget(hit, this.opts.reducedMotion)
      }
      this.you?.tick(dt, now / 1000, this.opts.reducedMotion)

      this.layoutMarkers()
      if (this.pins.length && now - this.lastVeil > 70) {
        this.lastVeil = now
        this.veilCursor = (this.veilCursor + 1) % this.pins.length
        this.checkVeil(this.pins[this.veilCursor]!)
      }
    }

    this.sky.position.copy(this.camera.position)
    this.renderer.render(this.scene, this.camera)

    const settled = !active && !this.dirty
    // Coming to rest: one full occlusion pass so no pin is left half-decided.
    if (settled && ground) for (const pin of this.pins) this.checkVeil(pin)
    this.projectPins()

    const pose = this.currentPose()
    if (Math.abs(pose.bearing - this.lastYaw) > 0.002 || Number.isNaN(this.lastYaw)) {
      this.lastYaw = pose.bearing
      this.opts.onYaw(pose.bearing)
    }
    const tilted = pose.tilt > 20 * DEG
    if (tilted !== this.lastTilted) {
      this.lastTilted = tilted
      this.opts.onTilt(tilted)
    }
    if (ground && (now - this.lastAttributionAt > 500 || settled)) {
      this.lastAttributionAt = now
      const text = ground.attribution()
      if (text !== this.lastAttribution) {
        this.lastAttribution = text
        this.opts.onAttribution(text)
      }
    }

    if (ground && this.ready) {
      // Debounced so the chip doesn't flicker as single tiles come and go.
      const busy = ground.busy()
      if (busy !== this.refining && (busy ? now - this.refiningSince > 600 : true)) {
        this.refining = busy
        this.opts.onRefining(busy)
      }
      if (!busy) this.refiningSince = now
    }

    if ((active || this.dirty) && !this.raf) this.raf = requestAnimationFrame(this.tick)
  }
}
