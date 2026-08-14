import { useEffect, useRef, useState, type RefObject } from 'react'

const VERT = `#version 300 es
precision highp float;
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const QUAD_VERTS = new Float32Array([
  -1, -1, 1, -1, -1, 1,
  -1, 1, 1, -1, 1, 1,
])

// x.ai/voice glass marble. Breath scale lives on the CSS wrapper;
// this shader keeps a stable circular silhouette and animates the interior.
export const GLASS_ORB_FRAG = `#version 300 es
precision highp float;

uniform float u_time;
uniform float u_amplitude;
uniform vec2 u_resolution;
uniform vec3 u_color1;
uniform vec3 u_color2;
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
  float c = hash(i + vec2(1.0, 1.0));
  float d = hash(i + vec2(0.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm2(vec2 p) {
  return noise(p) * 0.62 + noise(p * 2.17 + 17.1) * 0.38;
}

vec3 nebulaColor(vec2 p, float t, vec3 c1, vec3 c2) {
  float ang = atan(p.y, p.x);
  float r = length(p);
  vec2 swirl = vec2(ang * 0.46 + t * 0.08, r * 2.2 - t * 0.05);
  float n = fbm2(swirl * 2.15 + 4.0);
  float n2 = noise(swirl * 5.0 - t * 0.04);
  vec3 gas = mix(c1, c2, n);
  gas = mix(gas, c2 * 1.18, n2 * 0.32);
  float core = pow(max(0.0, 1.0 - r), 3.2);
  gas += vec3(0.92, 0.96, 0.90) * core * 0.38;
  gas *= 0.26 + n * 0.95;
  return gas;
}

float dustMotes(vec2 p, float t, float radius) {
  float acc = 0.0;
  for (int i = 0; i < 20; i++) {
    float id = float(i);
    float h1 = hash(vec2(id, 3.17));
    float h2 = hash(vec2(id, 8.91));
    float h3 = hash(vec2(id, 13.4));
    float speed = mix(0.10, 0.46, h1) * (0.82 + u_amplitude * 0.4);
    float ang = t * speed + id * 1.6180339887;
    float rad = mix(0.38, 1.55, h2) * radius;
    vec2 pos = vec2(cos(ang), sin(ang) * 0.66 + (h3 - 0.5) * 0.2) * rad;
    float d = length(p - pos);
    float size = mix(0.0026, 0.009, h1) * (0.72 + u_amplitude * 0.5);
    float twinkle = 0.55 + 0.45 * sin(t * mix(1.05, 2.3, h3) + id);
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

  float baseRadius = 0.36;
  float sdf = dist - baseRadius;
  float edge = smoothstep(0.016, -0.016, sdf);
  float glow = smoothstep(0.13, -0.01, sdf) * (0.2 + u_amplitude * 0.12);

  float effRadius = max(baseRadius, 0.0001);
  float ndist = clamp(dist / effRadius, 0.0, 1.0);
  float sphereZ = sqrt(max(0.0, 1.0 - ndist * ndist));
  vec3 geoNormal = normalize(vec3(fromCenter / effRadius, sphereZ));

  vec2 nUv = fromCenter * 2.4 + vec2(u_time * 0.016, u_time * 0.011);
  float eps = 0.04;
  float h = noise(nUv);
  vec3 ripple = normalize(vec3(
    h - noise(nUv + vec2(eps, 0.0)),
    h - noise(nUv + vec2(0.0, eps)),
    0.64
  ));
  vec3 normal = normalize(vec3(geoNormal.xy + ripple.xy * 0.2, geoNormal.z));

  vec3 lightDir = normalize(vec3(-0.4, 0.56, 0.72));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfVec = normalize(lightDir + viewDir);
  float NdotV = max(dot(normal, viewDir), 0.0);
  float NdotH = max(dot(normal, halfVec), 0.0);
  float NdotL = max(dot(normal, lightDir), 0.0);

  float fresnel = 0.055 + 0.945 * pow(1.0 - NdotV, 4.1);
  vec2 interior = fromCenter / effRadius;
  vec2 refractOff = normal.xy * (0.055 * (1.0 - NdotV));
  vec3 nebula = nebulaColor(interior + refractOff, u_time, u_color1, u_color2);
  vec3 nebR = nebulaColor(interior + refractOff + vec2(0.011, 0.0), u_time, u_color1, u_color2);
  vec3 nebB = nebulaColor(interior + refractOff - vec2(0.009, 0.004), u_time, u_color1, u_color2);
  nebula = vec3(nebR.r, nebula.g, nebB.b);

  float grain = fbm2(uv * 6.2 + 9.0);
  vec3 paperLight = mix(vec3(0.94, 0.93, 0.90), vec3(0.88, 0.87, 0.82), grain);
  vec3 paperDark = mix(vec3(0.07, 0.09, 0.08), vec3(0.03, 0.04, 0.035), grain);
  vec3 scene = mix(paperLight, paperDark, u_dark);

  float thickness = 2.0 * sphereZ;
  vec3 spaceCore = mix(vec3(0.05, 0.07, 0.06), vec3(0.02, 0.03, 0.028), u_dark);
  vec3 transmitted = mix(spaceCore, nebula, 0.84);
  transmitted = mix(scene * 0.32, transmitted, 0.8 + 0.14 * sphereZ);
  transmitted *= exp(-u_color1 * (0.32 + u_amplitude * 0.1) * thickness);

  vec3 film = vec3(
    0.48 + 0.46 * sin(fresnel * 6.28318 + 0.2),
    0.56 + 0.38 * sin(fresnel * 6.28318 + 2.1),
    0.52 + 0.4 * sin(fresnel * 6.28318 + 4.15)
  );
  vec3 rim = mix(mix(u_color2, vec3(0.94, 0.96, 0.93), 0.42), film, 0.5);
  vec3 glass = mix(transmitted, rim, fresnel * 0.9);
  float specular = pow(NdotH, 118.0) * 1.2;
  float specHalo = pow(NdotH, 24.0) * 0.18;
  vec3 specCol = mix(vec3(0.97, 0.98, 0.94), vec3(0.82, 0.9, 0.86), u_dark);
  glass += specCol * (specular + specHalo);
  glass *= mix(0.84, 1.0, NdotL);

  float motes = dustMotes(fromCenter, u_time, effRadius);
  vec3 moteCol = mix(u_color2, specCol, 0.5);
  glass += moteCol * motes * (0.52 + edge * 0.7);
  float outerDust = dustMotes(fromCenter, u_time * 0.82 + 4.0, effRadius * 1.32);
  float halo = glow * (1.0 - edge);
  vec3 glowCol = mix(u_color1, u_color2, 0.42) * (0.5 + u_amplitude * 0.32);
  vec3 color = glass * edge + glowCol * halo + moteCol * outerDust * halo * 1.35;

  float alpha = edge * 0.97 + halo * 0.82 + outerDust * 0.2;
  alpha *= smoothstep(0.54, 0.36, dist);
  fragColor = vec4(color * alpha, alpha);
}
`

interface UseGlassOrbOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>
  amplitude: number
  color1: [number, number, number]
  color2: [number, number, number]
  reducedMotion: boolean
  dark: boolean
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
    uDark: WebGLUniformLocation | null
  }
}

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
  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT)
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, GLASS_ORB_FRAG)
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
      uDark: gl.getUniformLocation(program, 'u_dark'),
    },
  }
}

function destroyGL(state: GLState) {
  state.gl.deleteBuffer(state.vbo)
  state.gl.deleteVertexArray(state.vao)
  state.gl.deleteProgram(state.program)
}

export function useGlassOrb({
  canvasRef,
  amplitude,
  color1,
  color2,
  reducedMotion,
  dark,
}: UseGlassOrbOptions): boolean {
  const amplitudeRef = useRef(amplitude)
  const color1Ref = useRef(color1)
  const color2Ref = useRef(color2)
  const darkRef = useRef(dark)
  const requestRenderRef = useRef<(() => void) | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    amplitudeRef.current = amplitude
    color1Ref.current = color1
    color2Ref.current = color2
    darkRef.current = dark
    requestRenderRef.current?.()
  }, [amplitude, color1, color2, dark])

  useEffect(() => {
    if (reducedMotion) return

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
      if (onVisibility) {
        document.removeEventListener('visibilitychange', onVisibility)
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
      const startTime = performance.now()
      let frozenTime = 0
      let currentAmplitude = amplitudeRef.current
      let currentWidth = 0
      let currentHeight = 0

      const applySize = (cssW: number, cssH: number) => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const w = Math.max(1, Math.round(cssW * dpr))
        const h = Math.max(1, Math.round(cssH * dpr))
        if (w === currentWidth && h === currentHeight) return
        currentWidth = w
        currentHeight = h
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }

      const draw = (now: number) => {
        currentAmplitude += (amplitudeRef.current - currentAmplitude) * 0.12
        const time = document.hidden ? frozenTime : (now - startTime) / 1000
        if (!document.hidden) frozenTime = time

        gl.useProgram(program)
        gl.bindVertexArray(vao)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.uniform1f(uniforms.uTime, time)
        gl.uniform1f(uniforms.uAmplitude, currentAmplitude)
        gl.uniform2f(uniforms.uResolution, currentWidth, currentHeight)
        gl.uniform3fv(uniforms.uColor1, color1Ref.current)
        gl.uniform3fv(uniforms.uColor2, color2Ref.current)
        gl.uniform1f(uniforms.uDark, darkRef.current ? 1 : 0)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }

      const scheduleRender = () => {
        if (cancelled || rafId !== null) return
        rafId = requestAnimationFrame((now) => {
          rafId = null
          draw(now)
          if (!cancelled && !document.hidden) scheduleRender()
        })
      }

      requestRenderRef.current = scheduleRender
      onVisibility = () => {
        if (!document.hidden) scheduleRender()
      }
      ro = new ResizeObserver(() => {
        const rect = canvas.getBoundingClientRect()
        applySize(rect.width, rect.height)
        scheduleRender()
      })
      ro.observe(canvas)
      document.addEventListener('visibilitychange', onVisibility)
      const rect = canvas.getBoundingClientRect()
      applySize(rect.width, rect.height)
      scheduleRender()
    }

    const timerId = window.setTimeout(start, 40)
    return () => {
      cancelled = true
      window.clearTimeout(timerId)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      tearDownGL()
    }
  }, [canvasRef, reducedMotion])

  return failed
}
