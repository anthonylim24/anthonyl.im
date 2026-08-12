// Glassy YOU pin + HL2-style water puddle for Map Mode.
//
// The pin is a water-IOR MeshPhysicalMaterial (transmission, clearcoat,
// chromatic dispersion) so the photogrammetry actually refracts through
// the bulb. The puddle under it is the same stack with dual-scroll
// sine-wave normals injected via onBeforeCompile — Source's water was
// two bump layers scrolling in opposite directions, fresnel-blended
// against a refraction RT. three.js transmission *is* that refraction
// RT (already 1/4-res via renderer.transmissionResolutionScale).

import {
  AdditiveBlending,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  LatheGeometry,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NoColorSpace,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three"
import { damp, type TerrainHit } from "./terrainAnchor"
import type { MapLighting } from "./mapSun"

const ACCENT = 0xf43f5e
const PIN_PROFILE_HEIGHT = 4.12
export const YOU_PIN_SCALE = 5.2
export const YOU_PIN_HEIGHT = PIN_PROFILE_HEIGHT * YOU_PIN_SCALE
export const YOU_PUDDLE_RADIUS = 20
const SURFACE_LIFT = 0.45
const DROP_HEIGHT = 36
const Y_LAMBDA = 5.8
const Y_LAMBDA_REDUCED = 22
const PUDDLE_LIFT = 0.2

const WATER_WAVES_GLSL = /* glsl */ `
{
  vec2 p = vYouWorldPos.xz;
  float t = uTime;
  vec2 uv1 = p * 0.11 + vec2(t * 0.31, t * 0.17);
  vec2 uv2 = p * 0.27 + vec2(-t * 0.23, t * 0.29);
  vec2 uv3 = p * 0.63 + vec2(t * 0.47, -t * 0.21);
  float s1 = sin(uv1.x * 6.2831853) * cos(uv1.y * 6.2831853);
  float c1 = cos(uv1.x * 6.2831853) * sin(uv1.y * 6.2831853);
  float s2 = sin(uv2.x * 6.2831853 + 1.3) * cos(uv2.y * 6.2831853);
  float c2 = cos(uv2.x * 6.2831853 + 1.3) * sin(uv2.y * 6.2831853);
  float s3 = sin(uv3.x * 6.2831853 + 2.1) * cos(uv3.y * 6.2831853);
  float c3 = cos(uv3.x * 6.2831853 + 2.1) * sin(uv3.y * 6.2831853);
  vec3 wN = normalize(vec3(
    -(s1 * 0.52 + s2 * 0.32 + s3 * 0.14) * uWaveAmp,
    1.0,
    -(c1 * 0.52 + c2 * 0.32 + c3 * 0.14) * uWaveAmp
  ));
  vec3 vN = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
  normal = normalize(mix(normal, vN, clamp(uWaveAmp, 0.0, 1.0)));
}
`

function createPinGeometry(): LatheGeometry {
  const pts = [
    new Vector2(0.0, 0.0),
    new Vector2(0.16, 0.06),
    new Vector2(0.22, 0.45),
    new Vector2(0.32, 1.15),
    new Vector2(0.48, 1.85),
    new Vector2(0.78, 2.28),
    new Vector2(1.08, 2.62),
    new Vector2(1.18, 3.08),
    new Vector2(1.06, 3.52),
    new Vector2(0.76, 3.86),
    new Vector2(0.34, 4.06),
    new Vector2(0.0, PIN_PROFILE_HEIGHT),
  ]
  return new LatheGeometry(pts, 64)
}

function createPuddleAlpha(): CanvasTexture {
  const size = 64
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) return new CanvasTexture(canvas)
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.12,
    size / 2,
    size / 2,
    size / 2,
  )
  g.addColorStop(0, "rgba(255,255,255,1)")
  g.addColorStop(0.45, "rgba(255,255,255,0.92)")
  g.addColorStop(0.72, "rgba(255,255,255,0.4)")
  g.addColorStop(1, "rgba(255,255,255,0)")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = NoColorSpace
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.needsUpdate = true
  return tex
}

function injectWaterWaves(
  material: MeshPhysicalMaterial,
  time: { value: number },
  amp: number,
) {
  material.customProgramCacheKey = () => "you-pin-water-v1"
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time
    shader.uniforms.uWaveAmp = { value: amp }
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vYouWorldPos;")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvYouWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vYouWorldPos;\nuniform float uTime;\nuniform float uWaveAmp;",
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>\n${WATER_WAVES_GLSL}`,
      )
  }
}

function createFresnelMat(color: Color): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: color } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uColor;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float f = pow(1.0 - abs(dot(N, V)), 2.6);
        gl_FragColor = vec4(uColor * f, f * 0.9);
      }
    `,
  })
}

export class YouPin {
  readonly group = new Group()
  hasAnchor = false
  private readonly pinGeo: LatheGeometry
  private readonly puddleGeo: CircleGeometry
  private readonly haloGeo: RingGeometry
  private readonly coreGeo: SphereGeometry
  private readonly pinMat: MeshPhysicalMaterial
  private readonly puddleMat: MeshPhysicalMaterial
  private readonly haloMat: MeshBasicMaterial
  private readonly coreMat: MeshBasicMaterial
  private readonly rimMat: ShaderMaterial
  private readonly alphaMap: CanvasTexture
  private readonly pin: Mesh
  private readonly puddle: Mesh
  private readonly halo: Mesh
  private readonly rim: Mesh
  private readonly waterTime = { value: 0 }
  private readonly targetN = new Vector3(0, 1, 0)
  private readonly targetQuat = new Quaternion()
  private readonly tmpN = new Vector3()
  private readonly up = new Vector3(0, 1, 0)
  private targetY = 0
  private pinY = 0
  private haloBaseOpacity = 0.42

  constructor(opts: { transmission: boolean; reducedMotion: boolean }) {
    this.group.name = "you-pin"
    this.group.visible = false

    this.pinGeo = createPinGeometry()
    this.puddleGeo = new CircleGeometry(1, 64)
    this.puddleGeo.rotateX(-Math.PI / 2)
    this.haloGeo = new RingGeometry(0.72, 1.05, 64)
    this.haloGeo.rotateX(-Math.PI / 2)
    this.coreGeo = new SphereGeometry(1, 24, 18)
    this.alphaMap = createPuddleAlpha()

    this.pinMat = new MeshPhysicalMaterial({
      color: 0xfff2f4,
      roughness: 0.045,
      metalness: 0.02,
      ior: 1.333,
      thickness: 3.4,
      attenuationColor: new Color(ACCENT),
      attenuationDistance: 3.6,
      transmission: opts.transmission ? 0.96 : 0,
      transparent: true,
      opacity: opts.transmission ? 1 : 0.88,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      iridescence: 0.22,
      iridescenceIOR: 1.31,
      iridescenceThicknessRange: [120, 380],
      envMapIntensity: 1.55,
      specularIntensity: 1,
      specularColor: new Color(0xfff7f8),
      emissive: new Color(ACCENT),
      emissiveIntensity: 0.06,
      fog: false,
      dispersion: 1.35,
    })

    this.puddleMat = new MeshPhysicalMaterial({
      color: 0xffd6de,
      roughness: 0.07,
      metalness: 0,
      ior: 1.333,
      thickness: 0.4,
      attenuationColor: new Color(ACCENT),
      attenuationDistance: 1.6,
      transmission: opts.transmission ? 1 : 0,
      transparent: true,
      opacity: opts.transmission ? 1 : 0.72,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.7,
      specularIntensity: 1,
      specularColor: new Color(0xf8fbff),
      alphaMap: this.alphaMap,
      depthWrite: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      fog: false,
    })
    injectWaterWaves(this.puddleMat, this.waterTime, opts.reducedMotion ? 0.12 : 0.62)

    this.haloMat = new MeshBasicMaterial({
      color: ACCENT,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      fog: false,
      side: DoubleSide,
    })
    this.coreMat = new MeshBasicMaterial({
      color: 0xfff5f7,
      transparent: true,
      opacity: 0.4,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
    this.rimMat = createFresnelMat(new Color(1.0, 0.58, 0.68))

    this.puddle = new Mesh(this.puddleGeo, this.puddleMat)
    this.puddle.scale.setScalar(YOU_PUDDLE_RADIUS)
    this.puddle.renderOrder = 6
    this.halo = new Mesh(this.haloGeo, this.haloMat)
    this.halo.scale.setScalar(YOU_PUDDLE_RADIUS)
    this.halo.renderOrder = 7
    this.pin = new Mesh(this.pinGeo, this.pinMat)
    this.pin.scale.setScalar(YOU_PIN_SCALE)
    this.pin.renderOrder = 8
    this.rim = new Mesh(this.pinGeo, this.rimMat)
    this.rim.scale.setScalar(YOU_PIN_SCALE * 1.04)
    this.rim.renderOrder = 9
    const core = new Mesh(this.coreGeo, this.coreMat)
    core.position.set(0, 3.08, 0)
    core.scale.setScalar(0.28)
    this.pin.add(core)

    this.group.add(this.puddle, this.halo, this.pin, this.rim)
  }

  get surfaceY(): number {
    return this.group.position.y
  }

  get labelY(): number {
    return this.group.position.y + this.pinY + YOU_PIN_HEIGHT + 1.4
  }

  setTarget(hit: TerrainHit, reducedMotion: boolean) {
    const y = hit.point.y + SURFACE_LIFT
    this.targetY = y
    this.targetN.set(hit.normal.x, hit.normal.y, hit.normal.z)
    if (this.targetN.lengthSq() < 1e-6) this.targetN.set(0, 1, 0)
    else this.targetN.normalize()
    if (this.targetN.y > 0.997) this.targetQuat.identity()
    else this.targetQuat.setFromUnitVectors(this.up, this.targetN)
    if (!this.hasAnchor) {
      this.hasAnchor = true
      this.group.visible = true
      this.group.position.y = y
      this.pinY = reducedMotion ? 0 : DROP_HEIGHT
      this.pin.position.y = this.pinY
      this.rim.position.y = this.pinY
    }
  }

  setLighting(L: MapLighting) {
    this.pinMat.emissiveIntensity = L.belowHorizon ? 0.2 : 0.06
    this.haloBaseOpacity = L.belowHorizon ? 0.62 : 0.4
    this.puddleMat.envMapIntensity = L.belowHorizon ? 1.15 : 1.7
  }

  tick(dtMs: number, timeSec: number, reducedMotion: boolean) {
    this.waterTime.value = reducedMotion ? 0 : timeSec
    if (!this.hasAnchor) return
    const dtSec = Math.min(dtMs / 1000, 0.08)
    const lambda = reducedMotion ? Y_LAMBDA_REDUCED : Y_LAMBDA
    this.group.position.y = damp(this.group.position.y, this.targetY, lambda, dtSec)
    this.pinY = damp(this.pinY, 0, lambda, dtSec)
    this.pin.position.y = this.pinY
    this.rim.position.y = this.pinY
    this.puddle.quaternion.slerp(this.targetQuat, 1 - Math.exp(-8 * dtSec))
    this.halo.quaternion.copy(this.puddle.quaternion)
    this.tmpN.copy(this.targetN).multiplyScalar(PUDDLE_LIFT)
    this.puddle.position.copy(this.tmpN)
    this.halo.position.copy(this.tmpN)
    const pulse = reducedMotion ? 1 : 1 + Math.sin(timeSec * 2.15) * 0.07
    this.halo.scale.setScalar(YOU_PUDDLE_RADIUS * pulse)
    this.haloMat.opacity =
      this.haloBaseOpacity * (reducedMotion ? 1 : 0.82 + Math.sin(timeSec * 2.15) * 0.18)
  }

  dispose() {
    this.pinGeo.dispose()
    this.puddleGeo.dispose()
    this.haloGeo.dispose()
    this.coreGeo.dispose()
    this.pinMat.dispose()
    this.puddleMat.dispose()
    this.haloMat.dispose()
    this.coreMat.dispose()
    this.rimMat.dispose()
    this.alphaMap.dispose()
  }
}
