import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  AdaptiveQuality,
  initialDprForTier,
  maxDprForTier,
} from '@/pages/Korea/adaptiveQuality'
import { detectTier } from '@/pages/Korea/deviceTier'
import { detectOrbQuality, type OrbQuality } from '@/lib/breathworkViewport'

// ── Shaders (inline GLSL) ────────────────────────────────────────────

const VERT = '#version 300 es\nprecision highp float;\nin vec2 a_pos;\nvoid main() {\n  gl_Position = vec4(a_pos, 0.0, 1.0);\n}\n'

const QUAD_VERTS = new Float32Array([
  -1, -1,  1, -1,  -1, 1,
  -1,  1,  1, -1,   1, 1,
])

// Fragment shader — Source-engine (HL2) water on a sphere.
//
// The silhouette stays circular. Water lives in the normal: dual scrolling
// procedural normals, Schlick Fresnel, beer-lambert murk, one sun spec,
// and (high tier) cheap caustic bands. No FBM outline wobble.
const FRAG = `#version 300 es
precision highp float;

uniform float u_time;
uniform float u_amplitude;
uniform vec2 u_resolution;
uniform vec3 u_color1;
uniform vec3 u_color2;
uniform float u_quality;
uniform float u_dark;

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

float fbm2(vec2 p) {
  return noise(p) * 0.65 + noise(p * 2.17 + 17.1) * 0.35;
}

vec3 waterNormal(vec2 p, float t, float quality) {
  vec2 uv0 = p * 3.4 + vec2(t * 0.031, t * 0.019);
  vec2 uv1 = p * 5.7 + vec2(-t * 0.017, t * 0.041);
  float eps = 0.035;
  float h0 = noise(uv0);
  float h1 = noise(uv1);
  float h = mix(h0, h1, 0.55);
  float hx = mix(noise(uv0 + vec2(eps, 0.0)), noise(uv1 + vec2(eps, 0.0)), 0.55);
  float hy = mix(noise(uv0 + vec2(0.0, eps)), noise(uv1 + vec2(0.0, eps)), 0.55);
  vec3 n = normalize(vec3(h - hx, h - hy, 0.42));
  if (quality > 1.5) {
    vec2 uv2 = p * 9.1 + vec2(t * 0.055, -t * 0.028);
    float h2 = noise(uv2);
    n.xy += vec2(h2 - noise(uv2 + vec2(eps, 0.0)), h2 - noise(uv2 + vec2(0.0, eps))) * 0.28;
    n = normalize(n);
  }
  return n;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 fromCenter = uv - vec2(0.5);
  float aspect = u_resolution.x / u_resolution.y;
  fromCenter.x *= aspect;
  float dist = length(fromCenter);

  float baseRadius = 0.16 + u_amplitude * 0.22;
  float sdf = dist - baseRadius;
  float edge = smoothstep(0.018, -0.018, sdf);
  float glow = smoothstep(0.10, -0.02, sdf) * (0.18 + u_amplitude * 0.10);

  float effRadius = max(baseRadius, 0.0001);
  float ndist = clamp(dist / effRadius, 0.0, 1.0);
  float sphereZ = sqrt(max(0.0, 1.0 - ndist * ndist));
  vec3 geoNormal = normalize(vec3(fromCenter / effRadius, sphereZ));

  vec3 ripple = waterNormal(fromCenter * 2.4, u_time, u_quality);
  vec3 normal = normalize(vec3(geoNormal.xy + ripple.xy * 0.38, geoNormal.z));

  vec3 lightDir = normalize(vec3(-0.35, 0.55, 0.72));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfVec = normalize(lightDir + viewDir);
  float NdotV = max(dot(normal, viewDir), 0.0);
  float NdotH = max(dot(normal, halfVec), 0.0);
  float NdotL = max(dot(normal, lightDir), 0.0);
  float wrap = max(dot(normal, lightDir) * 0.5 + 0.5, 0.0);

  float F0 = 0.02;
  float fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);

  vec2 refractUV = uv + normal.xy * (0.045 * (1.0 - NdotV));
  float parchment = u_quality > 0.5 ? fbm2(refractUV * 7.0 + 12.0) : noise(refractUV * 6.0);
  vec3 paperLight = mix(vec3(0.96, 0.94, 0.90), vec3(0.91, 0.88, 0.82), parchment);
  vec3 paperDark = mix(vec3(0.13, 0.12, 0.10), vec3(0.09, 0.08, 0.07), parchment);
  vec3 scene = mix(paperLight, paperDark, u_dark);

  float thickness = 2.0 * sphereZ;
  float murk = 1.15 + u_amplitude * 0.25;
  vec3 absorption = exp(-u_color1 * murk * thickness);
  vec3 transmitted = scene * absorption;
  transmitted = mix(transmitted, u_color2 * 0.55, 0.22 * (1.0 - ndist));
  transmitted += u_color2 * pow(wrap, 2.2) * 0.12 * (1.0 - NdotV);

  if (u_quality > 1.5) {
    vec2 cUV = refractUV * 8.0 + u_time * 0.08;
    float caustic = pow(max(0.0, noise(cUV) * noise(cUV * 1.7 - u_time * 0.11)), 3.0);
    transmitted += vec3(caustic) * 0.16 * (1.0 - ndist);
  }

  vec3 R = reflect(-viewDir, normal);
  float sky = clamp(R.y * 0.55 + 0.45, 0.0, 1.0);
  vec3 skyCol = mix(u_color1 * 0.28, mix(u_color2, vec3(0.97, 0.95, 0.90), 0.42), sky);
  skyCol = mix(skyCol, skyCol * 0.35, u_dark);
  vec3 water = mix(transmitted, skyCol, fresnel);

  float specPower = u_quality > 0.5 ? 96.0 : 48.0;
  float specular = pow(NdotH, specPower) * 0.95;
  float specHalo = pow(NdotH, 22.0) * 0.16;
  vec3 specCol = mix(vec3(0.97, 0.95, 0.90), vec3(0.86, 0.82, 0.74), u_dark);
  water += specCol * (specular + specHalo);
  water *= mix(0.78, 1.0, NdotL);

  float alpha = edge * 0.92 + glow * (1.0 - edge);
  alpha *= smoothstep(0.52, 0.40, dist);

  fragColor = vec4(water * alpha, alpha);
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
  dark?: boolean
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
    uQuality: WebGLUniformLocation | null
    uDark: WebGLUniformLocation | null
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
  gl.uniform1f(gl.getUniformLocation(program, 'u_quality'), 1)
  gl.uniform1f(gl.getUniformLocation(program, 'u_dark'), 0)
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
      uQuality: gl.getUniformLocation(program, 'u_quality'),
      uDark: gl.getUniformLocation(program, 'u_dark'),
    },
  }
}

function destroyGL(state: GLState) {
  const { gl, program, vao, vbo } = state
  gl.deleteBuffer(vbo)
  gl.deleteVertexArray(vao)
  gl.deleteProgram(program)
}

function qualityFloat(quality: OrbQuality): number {
  return quality
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useWebGLOrb({
  canvasRef,
  amplitude,
  color1,
  color2,
  isActive,
  reducedMotion,
  dark = false,
}: UseWebGLOrbOptions): boolean {
  const amplitudeRef = useRef(amplitude)
  const color1Ref = useRef(color1)
  const color2Ref = useRef(color2)
  const isActiveRef = useRef(isActive)
  const reducedMotionRef = useRef(reducedMotion)
  const darkRef = useRef(dark)
  const requestRenderRef = useRef<(() => void) | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    amplitudeRef.current = amplitude
    color1Ref.current = color1
    color2Ref.current = color2
    isActiveRef.current = isActive
    reducedMotionRef.current = reducedMotion
    darkRef.current = dark
    requestRenderRef.current?.()
  }, [amplitude, color1, color2, isActive, reducedMotion, dark])

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
    let onVisibility: (() => void) | null = null

    const tearDownGL = () => {
      requestRenderRef.current = null
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      ro?.disconnect()
      ro = null
      if (onVisibility) {
        document.removeEventListener('visibilitychange', onVisibility)
        onVisibility = null
      }
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
        powerPreference: 'high-performance',
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
      const tier = detectTier()
      const quality = detectOrbQuality()
      const deviceDpr = window.devicePixelRatio || 1
      const adaptive = new AdaptiveQuality({
        maxDpr: maxDprForTier(tier, deviceDpr),
        minDpr: 1,
        initialDpr: initialDprForTier(tier, deviceDpr),
      })

      let currentAmplitude = amplitudeRef.current
      let frozenTime = 0
      const startTime = performance.now()
      let lastFrame = startTime
      let currentWidth = 0
      let currentHeight = 0

      const applySize = (cssW: number, cssH: number) => {
        const dpr = adaptive.dpr
        const w = Math.max(1, Math.round(cssW * dpr))
        const h = Math.max(1, Math.round(cssH * dpr))
        if (w !== currentWidth || h !== currentHeight) {
          currentWidth = w
          currentHeight = h
          canvas.width = w
          canvas.height = h
          gl.viewport(0, 0, w, h)
        }
      }

      const draw = (now: number) => {
        const frameMs = now - lastFrame
        lastFrame = now
        if (adaptive.sample(frameMs)) {
          const rect = canvas.getBoundingClientRect()
          applySize(rect.width, rect.height)
        }

        const dt = 1 / 60
        const targetAmplitude = amplitudeRef.current
        currentAmplitude += (targetAmplitude - currentAmplitude) * Math.min(1, dt * 6)

        let time: number
        if (reducedMotionRef.current || !isActiveRef.current || document.hidden) {
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
        gl.uniform1f(uniforms.uQuality, qualityFloat(quality))
        gl.uniform1f(uniforms.uDark, darkRef.current ? 1 : 0)

        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }

      const scheduleRender = () => {
        if (cancelled || rafId !== null) return

        rafId = requestAnimationFrame((now) => {
          rafId = null
          draw(now)

          const keepLooping =
            !cancelled &&
            !reducedMotionRef.current &&
            isActiveRef.current &&
            !document.hidden

          if (keepLooping) {
            scheduleRender()
          }
        })
      }

      requestRenderRef.current = scheduleRender

      const resize = () => {
        const rect = canvas.getBoundingClientRect()
        applySize(rect.width, rect.height)
        scheduleRender()
      }

      onVisibility = () => {
        if (!document.hidden) scheduleRender()
      }

      ro = new ResizeObserver(resize)
      ro.observe(canvas)
      document.addEventListener('visibilitychange', onVisibility)
      resize()
      scheduleRender()
    }

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
