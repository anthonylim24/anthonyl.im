import type { DirectionalLight, Object3D, PerspectiveCamera, Vector3, WebGLRenderer } from "three"
import type { TerrainHit } from "./terrainAnchor"

// What the scene stands on. Production streams Google Photorealistic 3D
// Tiles (`tilesGround.ts`); a dev build without a key gets a procedural
// model city (`devGround.ts`). The scene only ever talks to this.

export interface GroundPalette {
  dark: boolean
  /** Page canvas: horizon, haze. */
  canvas: string
  surface: string
  sunken: string
  ink: string
  line: string
}

export interface GroundContext {
  renderer: WebGLRenderer
  camera: PerspectiveCamera
  anchor: { lat: number; lng: number }
  /** Stop positions in scene metres; the dev city keeps clear of them. */
  stops: ReadonlyArray<{ x: number; z: number }>
  palette: GroundPalette
  /** The scene's key light; the dev city casts shadows from it. */
  sun: DirectionalLight
  /** Something changed (a tile arrived); draw another frame. */
  invalidate: () => void
  /** The ground cannot be shown at all (root tileset refused, bad key). */
  onFatal: (reason: string) => void
}

export interface Ground {
  readonly group: Object3D
  /** Called once per drawn frame, after the camera has moved. */
  update(): void
  /** True while content is still streaming in. */
  busy(): boolean
  /** True once there is something to look at. */
  hasContent(): boolean
  /** Floor (or roof) under a spot, probed from the sky. */
  floorAt(x: number, z: number): TerrainHit | null
  /** Is the straight line between two points blocked? */
  blocked(from: Vector3, to: Vector3): boolean
  resize(): void
  setErrorTarget(target: number): void
  setPalette(palette: GroundPalette): void
  setSun(dir: { x: number; y: number; z: number }): void
  /** Text the provider's terms require on screen; "" when none. */
  attribution(): string
  dispose(): void
}
