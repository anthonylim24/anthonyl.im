import { useEffect, useRef, useState, type RefObject } from 'react'

// ── Shaders (inline GLSL) ────────────────────────────────────────────

const VERT = '#version 300 es\nprecision highp float;\nin vec2 a_pos;\nvoid main() {\n  gl_Position = vec4(a_pos, 0.0, 1.0);\n}\n'

const QUAD_VERTS = new Float32Array([
  -1, -1,  1, -1,  -1, 1,
  -1,  1,  1, -1,   1, 1,
])

// Fragment shader — renders the breathing orb as a soft glass body.
//
// On top of the original SDF + FBM displacement, this shader adds a simulated
// physical lighting model so the orb reads as a translucent glass volume:
//   • A faked hemisphere normal turns the 2D disc into an approximate 3D shape
//   • High-frequency noise bumps perturb that normal for glass surface texture
//   • Blinn–Phong specular gives a clean upper-left highlight
//   • A Fresnel term brightens the rim where light grazes (defining of glass)
//   • The interior color noise is sampled with a normal-offset UV to fake
//     refraction of whatever's "inside" the orb
//   • Wavelength-dependent rim shift produces a subtle chromatic dispersion
//   • Caustic-like swirls inside hint at light bending through the volume
const FRAG = `#version 300 es
precision highp float;

uniform float u_time;
uniform float u_amplitude;
uniform vec2 u_resolution;
uniform vec3 u_color1;
uniform vec3 u_color2;

out vec4 fragColor;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  vec2 shift = vec2(100.0);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 center = vec2(0.5);
  vec2 fromCenter = uv - center;
  float aspect = u_resolution.x / u_resolution.y;
  fromCenter.x *= aspect;
  float dist = length(fromCenter);
  float baseRadius = 0.16 + u_amplitude * 0.22;

  // Organic outer displacement (preserved — keeps the breathing wobble).
  float displace = fbm(fromCenter * 3.5 + u_time * 0.15) * 0.08 * (0.3 + u_amplitude * 0.7);
  float sdf = dist - baseRadius - displace;
  float edge = smoothstep(0.025, -0.025, sdf);
  float glow = smoothstep(0.15, -0.05, sdf) * (0.25 + u_amplitude * 0.15);

  // ── Surface normal: project the 2D disc onto a hemisphere ──
  float effRadius = max(baseRadius + displace, 0.0001);
  float ndist = clamp(dist / effRadius, 0.0, 1.0);
  float sphereZ = sqrt(max(0.0, 1.0 - ndist * ndist));
  vec3 normal = vec3(fromCenter / effRadius, sphereZ);

  // Micro-bumps — sample noise at offset points to derive a 2D bump gradient.
  // This perturbs the sphere normal so the surface reads as imperfect glass.
  vec2 bumpCoord = fromCenter * 12.0 + u_time * 0.10;
  float bx = noise(bumpCoord + vec2(0.5, 0.0)) - noise(bumpCoord);
  float by = noise(bumpCoord + vec2(0.0, 0.5)) - noise(bumpCoord);
  normal.xy += vec2(bx, by) * 0.22;
  normal = normalize(normal);

  // ── Lighting ──
  vec3 lightDir = normalize(vec3(-0.45, 0.55, 0.7));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfVec = normalize(lightDir + viewDir);
  float NdotV = max(dot(normal, viewDir), 0.0);
  float NdotH = max(dot(normal, halfVec), 0.0);

  // Tight Blinn–Phong hotspot + softer halo for that "wet glass" sheen.
  float specular = pow(NdotH, 90.0) * 0.95;
  float specHalo = pow(NdotH, 22.0) * 0.18;
  // Fresnel — characteristic edge brightening of any glass body.
  float fresnel = pow(1.0 - NdotV, 3.2);

  // ── Interior color with simulated refraction ──
  // Offset the noise lookup by the surface normal — fakes refractive
  // distortion of the volume "behind" the surface point.
  vec2 refractUV = fromCenter - normal.xy * 0.07 * (1.0 - ndist * 0.4);
  float colorNoise = fbm(refractUV * 2.0 + u_time * 0.08 + 50.0);
  vec3 col = mix(u_color1, u_color2, colorNoise);

  // Caustic-like inner swirls — suggests light bending through the volume.
  float caustic = fbm(refractUV * 6.5 - u_time * 0.11) * (1.0 - ndist * 0.7);
  col += vec3(caustic) * 0.15;

  // Subtle chromatic shift at the rim — wavelength-dependent dispersion.
  col.r += fresnel * 0.04;
  col.b += fresnel * 0.06 * (1.0 - ndist);

  // ── Composite ──
  float rim = smoothstep(baseRadius * 0.3, baseRadius, dist) * edge;
  col += rim * 0.10;

  vec3 highlight = mix(vec3(1.0), mix(u_color1, u_color2, 0.5) + 0.2, 0.3);
  col = mix(col, highlight, specular);
  col += highlight * specHalo;
  col += fresnel * 0.35 * mix(u_color2, vec3(1.0), 0.4);

  float alpha = edge * 0.88 + glow * (1.0 - edge);
  float edgeFade = smoothstep(0.5, 0.42, dist);
  alpha *= edgeFade;

  fragColor = vec4(col * alpha, alpha);
}
`

// ── Types ────────────────────────────────────────────────────────────

interface UseWebGLOrbOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>
  amplitude: number
  color1: [number, number, number]
  color2: [number, number, number]
  isActive: boolean
  reducedMotion: boolean
}

interface GLState {
  gl: WebGL2RenderingContext
  program: WebGLProgram
  vao: WebGLVertexArrayObject
  vbo: WebGLBuffer
  uniforms: {
    uTime: WebGLUniformLocation | null
    uAmplitude: WebGLUniformLocation | null
    uResolution: WebGLUniformLocation | null
    uColor1: WebGLUniformLocation | null
    uColor2: WebGLUniformLocation | null
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createGLState(gl: WebGL2RenderingContext): GLState | null {
  // Drain any prior errors
  while (gl.getError() !== gl.NO_ERROR) { /* drain */ }

  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT)
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG)
  if (!vert || !frag) return null

  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vert)
  gl.attachShader(program, frag)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    return null
  }

  gl.detachShader(program, vert)
  gl.detachShader(program, frag)
  gl.deleteShader(vert)
  gl.deleteShader(frag)

  const vao = gl.createVertexArray()
  const vbo = gl.createBuffer()
  if (!vao || !vbo) return null

  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTS, gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(program, 'a_pos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)

  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

  // Validate with a test draw — catches Metal pipeline compilation failures
  gl.useProgram(program)
  gl.bindVertexArray(vao)
  gl.viewport(0, 0, 1, 1)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.uniform1f(gl.getUniformLocation(program, 'u_time'), 0)
  gl.uniform1f(gl.getUniformLocation(program, 'u_amplitude'), 0.5)
  gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), 1, 1)
  gl.uniform3f(gl.getUniformLocation(program, 'u_color1'), 0.5, 0.5, 0.5)
  gl.uniform3f(gl.getUniformLocation(program, 'u_color2'), 0.5, 0.5, 0.5)
  gl.drawArrays(gl.TRIANGLES, 0, 6)
  gl.bindVertexArray(null)

  const err = gl.getError()
  if (err !== gl.NO_ERROR) {
    gl.deleteBuffer(vbo)
    gl.deleteVertexArray(vao)
    gl.deleteProgram(program)
    return null
  }

  return {
    gl,
    program,
    vao,
    vbo,
    uniforms: {
      uTime: gl.getUniformLocation(program, 'u_time'),
      uAmplitude: gl.getUniformLocation(program, 'u_amplitude'),
      uResolution: gl.getUniformLocation(program, 'u_resolution'),
      uColor1: gl.getUniformLocation(program, 'u_color1'),
      uColor2: gl.getUniformLocation(program, 'u_color2'),
    },
  }
}

function destroyGL(state: GLState) {
  const { gl, program, vao, vbo } = state
  gl.deleteBuffer(vbo)
  gl.deleteVertexArray(vao)
  gl.deleteProgram(program)
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useWebGLOrb({
  canvasRef,
  amplitude,
  color1,
  color2,
  isActive,
  reducedMotion,
}: UseWebGLOrbOptions): boolean {
  const amplitudeRef = useRef(amplitude)
  const color1Ref = useRef(color1)
  const color2Ref = useRef(color2)
  const isActiveRef = useRef(isActive)
  const reducedMotionRef = useRef(reducedMotion)
  const requestRenderRef = useRef<(() => void) | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    amplitudeRef.current = amplitude
    color1Ref.current = color1
    color2Ref.current = color2
    isActiveRef.current = isActive
    reducedMotionRef.current = reducedMotion
    requestRenderRef.current?.()
  }, [amplitude, color1, color2, isActive, reducedMotion])

  useEffect(() => {
    if (reducedMotion) {
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    let rafId: number | null = null
    let ro: ResizeObserver | null = null
    let state: GLState | null = null
    let cancelled = false

    const tearDownGL = () => {
      requestRenderRef.current = null
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      ro?.disconnect()
      ro = null
      if (state) {
        destroyGL(state)
        state = null
      }
    }

    const handleContextLost = (event: Event) => {
      event.preventDefault()
      cancelled = true
      tearDownGL()
      setFailed(true)
    }

    canvas.addEventListener('webglcontextlost', handleContextLost)

    const start = () => {
      if (cancelled) return

      const gl = canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        // iOS Safari clears the WebGL back-buffer between frames without
        // this flag, which makes the canvas read as fully transparent when
        // LiquidGlass's render loop samples it via drawImage from its own
        // RAF. The library's scene canvas is pre-filled white, so a
        // transparent orb left the refraction sampling all-white on iPhone.
        preserveDrawingBuffer: true,
      })
      if (!gl || gl.isContextLost()) {
        setFailed(true)
        return
      }

      state = createGLState(gl)
      if (!state) {
        setFailed(true)
        return
      }

      const { program, vao, uniforms } = state

      // ── Render scheduling ──
      let currentAmplitude = amplitudeRef.current
      let frozenTime = 0
      const startTime = performance.now()

      const draw = (now: number) => {
        const dt = 1 / 60
        const targetAmplitude = amplitudeRef.current
        currentAmplitude += (targetAmplitude - currentAmplitude) * Math.min(1, dt * 6)

        let time: number
        if (reducedMotionRef.current || !isActiveRef.current) {
          time = frozenTime
        } else {
          time = (now - startTime) / 1000
          frozenTime = time
        }

        gl.useProgram(program)
        gl.bindVertexArray(vao)

        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)

        gl.uniform1f(uniforms.uTime, time)
        gl.uniform1f(uniforms.uAmplitude, currentAmplitude)
        gl.uniform2f(uniforms.uResolution, currentWidth, currentHeight)
        gl.uniform3fv(uniforms.uColor1, color1Ref.current)
        gl.uniform3fv(uniforms.uColor2, color2Ref.current)

        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }

      const scheduleRender = () => {
        if (cancelled || rafId !== null) return

        rafId = requestAnimationFrame((now) => {
          rafId = null
          draw(now)

          if (!cancelled && !reducedMotionRef.current && isActiveRef.current) {
            scheduleRender()
          }
        })
      }

      requestRenderRef.current = scheduleRender

      // ── Resize handling ──
      let currentWidth = 0
      let currentHeight = 0

      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio, 2)
        const rect = canvas.getBoundingClientRect()
        const w = Math.round(rect.width * dpr)
        const h = Math.round(rect.height * dpr)
        if (w !== currentWidth || h !== currentHeight) {
          currentWidth = w
          currentHeight = h
          canvas.width = w
          canvas.height = h
          gl.viewport(0, 0, w, h)
          scheduleRender()
        }
      }

      ro = new ResizeObserver(resize)
      ro.observe(canvas)
      resize()

      scheduleRender()
    }

    // Defer initialization to avoid competing with page-load GPU work.
    // Metal shader compilation on macOS can fail transiently during heavy load.
    const timerId = setTimeout(start, 50)

    return () => {
      cancelled = true
      clearTimeout(timerId)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      tearDownGL()
    }
  }, [canvasRef, reducedMotion])

  return failed
}
