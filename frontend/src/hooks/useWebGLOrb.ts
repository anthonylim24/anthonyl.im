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

// Fragment shader — x.ai/voice glass marble: space nebula inside refractive
// glass, iridescent Fresnel, chromatic rim, and orbiting dust motes.
// Silhouette and breath scale stay circular: radius = 0.16 + amp * 0.22.
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

vec3 glassNormal(vec2 p, float t, float quality) {
  vec2 uv0 = p * 2.6 + vec2(t * 0.018, t * 0.012);
  vec2 uv1 = p * 4.8 + vec2(-t * 0.011, t * 0.024);
  float eps = 0.04;
  float h = mix(noise(uv0), noise(uv1), 0.5);
  float hx = mix(noise(uv0 + vec2(eps, 0.0)), noise(uv1 + vec2(eps, 0.0)), 0.5);
  float hy = mix(noise(uv0 + vec2(0.0, eps)), noise(uv1 + vec2(0.0, eps)), 0.5);
  vec3 n = normalize(vec3(h - hx, h - hy, 0.62));
  if (quality > 1.5) {
    vec2 uv2 = p * 8.4 + vec2(t * 0.032, -t * 0.019);
    float h2 = noise(uv2);
    n.xy += vec2(h2 - noise(uv2 + vec2(eps, 0.0)), h2 - noise(uv2 + vec2(0.0, eps))) * 0.16;
    n = normalize(n);
  }
  return n;
}

vec3 nebulaColor(vec2 p, float t, vec3 c1, vec3 c2) {
  float ang = atan(p.y, p.x);
  float r = length(p);
  vec2 swirl = vec2(ang * 0.42 + t * 0.07, r * 2.35 - t * 0.055);
  float n = fbm2(swirl * 2.2 + 4.0);
  float n2 = noise(swirl * 5.1 - t * 0.04);
  vec3 gas = mix(c1, c2, n);
  gas = mix(gas, c2 * 1.15, n2 * 0.35);
  float core = pow(max(0.0, 1.0 - r), 3.4);
  gas += vec3(1.0, 0.93, 0.78) * core * 0.42;
  gas *= 0.28 + n * 0.92;
  return gas;
}

float dustMotes(vec2 p, float t, float radius, float quality) {
  float acc = 0.0;
  for (int i = 0; i < 24; i++) {
    float id = float(i);
    if (quality < 0.5 && id > 7.0) {
      continue;
    }
    if (quality < 1.5 && id > 15.0) {
      continue;
    }
    float h1 = hash(vec2(id, 3.17));
    float h2 = hash(vec2(id, 8.91));
    float h3 = hash(vec2(id, 13.4));
    float speed = mix(0.11, 0.48, h1) * (0.85 + u_amplitude * 0.35);
    float ang = t * speed + id * 1.6180339887;
    float rad = mix(0.42, 1.62, h2) * radius;
    vec2 pos = vec2(cos(ang), sin(ang) * 0.68 + (h3 - 0.5) * 0.22) * rad;
    float d = length(p - pos);
    float size = mix(0.0028, 0.0095, h1) * (0.75 + u_amplitude * 0.55);
    float twinkle = 0.55 + 0.45 * sin(t * mix(1.1, 2.4, h3) + id);
    acc += smoothstep(size, 0.0, d) * twinkle;
  }
  return acc;
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
  float glow = smoothstep(0.14, -0.01, sdf) * (0.22 + u_amplitude * 0.14);

  float effRadius = max(baseRadius, 0.0001);
  float ndist = clamp(dist / effRadius, 0.0, 1.0);
  float sphereZ = sqrt(max(0.0, 1.0 - ndist * ndist));
  vec3 geoNormal = normalize(vec3(fromCenter / effRadius, sphereZ));

  vec3 ripple = glassNormal(fromCenter * 2.1, u_time, u_quality);
  vec3 normal = normalize(vec3(geoNormal.xy + ripple.xy * 0.22, geoNormal.z));

  vec3 lightDir = normalize(vec3(-0.42, 0.58, 0.70));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfVec = normalize(lightDir + viewDir);
  float NdotV = max(dot(normal, viewDir), 0.0);
  float NdotH = max(dot(normal, halfVec), 0.0);
  float NdotL = max(dot(normal, lightDir), 0.0);

  float F0 = 0.06;
  float fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, 4.2);

  vec2 interior = fromCenter / effRadius;
  vec2 refractOff = normal.xy * (0.06 * (1.0 - NdotV));
  vec3 nebula = nebulaColor(interior + refractOff, u_time, u_color1, u_color2);
  if (u_quality > 1.5) {
    vec3 nebR = nebulaColor(interior + refractOff + vec2(0.012, 0.0), u_time, u_color1, u_color2);
    vec3 nebB = nebulaColor(interior + refractOff - vec2(0.010, 0.004), u_time, u_color1, u_color2);
    nebula = vec3(nebR.r, nebula.g, nebB.b);
  }

  vec2 sceneUV = uv + normal.xy * (0.04 * (1.0 - NdotV));
  float grain = u_quality > 0.5 ? fbm2(sceneUV * 6.4 + 9.0) : noise(sceneUV * 5.5);
  vec3 paperLight = mix(vec3(0.96, 0.94, 0.90), vec3(0.90, 0.87, 0.81), grain);
  vec3 paperDark = mix(vec3(0.10, 0.09, 0.08), vec3(0.05, 0.045, 0.04), grain);
  vec3 scene = mix(paperLight, paperDark, u_dark);

  float thickness = 2.0 * sphereZ;
  vec3 spaceCore = mix(vec3(0.07, 0.06, 0.08), vec3(0.03, 0.025, 0.04), u_dark);
  vec3 transmitted = mix(spaceCore, nebula, 0.82);
  transmitted = mix(scene * 0.35, transmitted, 0.78 + 0.16 * sphereZ);
  transmitted *= exp(-u_color1 * (0.35 + u_amplitude * 0.12) * thickness);

  vec3 film = vec3(
    0.52 + 0.48 * sin(fresnel * 6.28318 + 0.15),
    0.50 + 0.42 * sin(fresnel * 6.28318 + 2.15),
    0.58 + 0.40 * sin(fresnel * 6.28318 + 4.20)
  );
  vec3 rim = mix(mix(u_color2, vec3(0.97, 0.95, 0.90), 0.45), film, 0.55);
  rim = mix(rim, rim * 0.55, u_dark * 0.35);
  vec3 glass = mix(transmitted, rim, fresnel * 0.92);

  float specPower = u_quality > 0.5 ? 120.0 : 64.0;
  float specular = pow(NdotH, specPower) * 1.15;
  float specHalo = pow(NdotH, 26.0) * 0.20;
  vec3 specCol = mix(vec3(0.99, 0.97, 0.92), vec3(0.90, 0.86, 0.78), u_dark);
  glass += specCol * (specular + specHalo);
  glass *= mix(0.82, 1.0, NdotL);

  float motes = dustMotes(fromCenter, u_time, effRadius, u_quality);
  vec3 moteCol = mix(u_color2, specCol, 0.55);
  glass += moteCol * motes * (0.55 + edge * 0.7);
  float outerDust = dustMotes(fromCenter, u_time * 0.85 + 4.0, effRadius * 1.35, u_quality);
  float halo = glow * (1.0 - edge);
  vec3 glowCol = mix(u_color1, u_color2, 0.4) * (0.55 + u_amplitude * 0.35);
  vec3 color = glass * edge + glowCol * halo + moteCol * outerDust * halo * 1.4;

  float alpha = edge * 0.96 + halo * 0.85 + outerDust * 0.22;
  alpha *= smoothstep(0.56, 0.38, dist);

  fragColor = vec4(color * alpha, alpha);
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
