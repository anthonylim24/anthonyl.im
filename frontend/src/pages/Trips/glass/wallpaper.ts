// The wallpaper under the glass: soft fields of the trip's colours, painted
// once by a small WebGL2 shader (no three.js; this chunk stays tiny) and kept
// as a still image. The context is released straight after, so the page never
// holds a second GL context beside MapLibre's. A new still is painted only
// when the size class, the theme or the accent changes.

import type { Linear, WallPalette } from "./palette"

export interface WallSpec {
  /** Pixels to paint: the viewport at a fraction of its size (it is soft). */
  width: number
  height: number
  palette: WallPalette
  /** Varies the warp so the same accent always gets the same field. */
  seed: number
}

const VERTEX = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`

// Fields are Gaussian pools at fixed places, their edges warped by value
// noise so they read as poured colour, not circles. Everything is blended in
// linear light (the palette is linear and in its luminance band, so every
// blend stays in the band too), then encoded to sRGB with a little dither so
// an 8-bit still does not band when it is stretched.
const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uSize;
uniform vec3 uBase;
uniform vec3 uField[4];
uniform vec3 uPlace[4];
uniform float uSeed;
out vec4 color;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return v;
}
vec3 encode(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  uv.y = 1.0 - uv.y;
  float aspect = uSize.x / uSize.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec2 warp = vec2(fbm(p * 1.7 + uSeed), fbm(p * 1.7 + uSeed + 7.3)) - 0.5;
  vec2 q = p + warp * 0.42;
  vec3 c = uBase;
  for (int i = 0; i < 4; i++) {
    vec2 at = vec2(uPlace[i].x * aspect, uPlace[i].y);
    vec2 d = q - at;
    float w = exp(-dot(d, d) / (uPlace[i].z * uPlace[i].z));
    c = mix(c, uField[i], clamp(w, 0.0, 1.0) * 0.92);
  }
  vec3 s = encode(c) + (hash(gl_FragCoord.xy + uSeed) - 0.5) * (1.5 / 255.0);
  color = vec4(s, 1.0);
}`

/** Where each field pools (x, y in the viewport, 0..1) and how wide it spreads. */
const PLACES = [
  [0.1, 0.06, 0.55],
  [0.62, -0.02, 0.5],
  [0.98, 0.5, 0.55],
  [0.22, 0.95, 0.6],
] as const

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error("no shader")
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader")
  return shader
}

const flat = (list: readonly (Linear | readonly number[])[]) => new Float32Array(list.flatMap((v) => [...v]))

/**
 * Paints the wallpaper and returns it as an object URL (the caller revokes
 * it), or null where WebGL2 is missing; the CSS gradient then stays.
 */
export async function paintWallpaper(spec: WallSpec): Promise<string | null> {
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(spec.width, spec.height) : document.createElement("canvas")
  canvas.width = spec.width
  canvas.height = spec.height
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  }) as WebGL2RenderingContext | null
  if (!gl) return null
  try {
    const program = gl.createProgram()
    if (!program) return null
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link")
    gl.useProgram(program)
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const at = gl.getAttribLocation(program, "p")
    gl.enableVertexAttribArray(at)
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0)
    gl.uniform2f(gl.getUniformLocation(program, "uSize"), spec.width, spec.height)
    gl.uniform3fv(gl.getUniformLocation(program, "uBase"), flat([spec.palette.base]))
    gl.uniform3fv(gl.getUniformLocation(program, "uField"), flat(spec.palette.fields.slice(0, 4)))
    gl.uniform3fv(gl.getUniformLocation(program, "uPlace"), flat(PLACES))
    gl.uniform1f(gl.getUniformLocation(program, "uSeed"), spec.seed)
    gl.viewport(0, 0, spec.width, spec.height)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    const blob =
      canvas instanceof HTMLCanvasElement
        ? await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.92))
        : await canvas.convertToBlob({ type: "image/webp", quality: 0.92 })
    return blob ? URL.createObjectURL(blob) : null
  } finally {
    gl.getExtension("WEBGL_lose_context")?.loseContext()
  }
}
