import { useEffect, useRef, useState, type RefObject } from 'react'

// ── Shaders (inline GLSL) ────────────────────────────────────────────

const VERT = '#version 300 es\nprecision highp float;\nin vec2 a_pos;\nvoid main() {\n  gl_Position = vec4(a_pos, 0.0, 1.0);\n}\n'

const QUAD_VERTS = new Float32Array([
  -1, -1,  1, -1,  -1, 1,
  -1,  1,  1, -1,   1, 1,
])

const FRAG = [
  '#version 300 es',
  'precision highp float;',
  '',
  'uniform float u_time;',
  'uniform float u_amplitude;',
  'uniform vec2 u_resolution;',
  'uniform vec3 u_color1;',
  'uniform vec3 u_color2;',
  '',
  'out vec4 fragColor;',
  '',
  'float hash(vec2 p) {',
  '  vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
  '  p3 += dot(p3, p3.yzx + 33.33);',
  '  return fract((p3.x + p3.y) * p3.z);',
  '}',
  '',
  'float noise(vec2 p) {',
  '  vec2 i = floor(p);',
  '  vec2 f = fract(p);',
  '  f = f * f * (3.0 - 2.0 * f);',
  '  float a = hash(i);',
  '  float b = hash(i + vec2(1.0, 0.0));',
  '  float c = hash(i + vec2(0.0, 1.0));',
  '  float d = hash(i + vec2(1.0, 1.0));',
  '  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);',
  '}',
  '',
  'float fbm(vec2 p) {',
  '  float v = 0.0;',
  '  float a = 0.5;',
  '  vec2 shift = vec2(100.0);',
  '  for (int i = 0; i < 4; i++) {',
  '    v += a * noise(p);',
  '    p = p * 2.0 + shift;',
  '    a *= 0.5;',
  '  }',
  '  return v;',
  '}',
  '',
  'void main() {',
  '  vec2 uv = gl_FragCoord.xy / u_resolution;',
  '  vec2 center = vec2(0.5);',
  '  vec2 fromCenter = uv - center;',
  '  float aspect = u_resolution.x / u_resolution.y;',
  '  fromCenter.x *= aspect;',
  '  float dist = length(fromCenter);',
  '  float baseRadius = 0.28 + (1.0 - u_amplitude) * 0.08;',
  '  float displace = fbm(fromCenter * 3.5 + u_time * 0.15) * 0.06 * (0.3 + u_amplitude * 0.7);',
  '  float sdf = dist - baseRadius - displace;',
  '  float edge = smoothstep(0.02, -0.02, sdf);',
  '  float glow = smoothstep(0.12, -0.04, sdf) * 0.35;',
  '  float colorNoise = fbm(fromCenter * 2.0 + u_time * 0.08 + 50.0);',
  '  vec3 col = mix(u_color1, u_color2, colorNoise);',
  '  float rim = smoothstep(baseRadius * 0.3, baseRadius, dist) * edge;',
  '  col += rim * 0.15;',
  '  float alpha = edge * 0.85 + glow * (1.0 - edge);',
  '  fragColor = vec4(col * alpha, alpha);',
  '}',
].join('\n')

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
  isActive: _isActive,
  reducedMotion,
}: UseWebGLOrbOptions): boolean {
  const amplitudeRef = useRef(amplitude)
  const color1Ref = useRef(color1)
  const color2Ref = useRef(color2)
  const reducedMotionRef = useRef(reducedMotion)
  const [failed, setFailed] = useState(false)

  amplitudeRef.current = amplitude
  color1Ref.current = color1
  color2Ref.current = color2
  // isActive reserved for future pause/resume of RAF loop
  reducedMotionRef.current = reducedMotion

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let rafId: number
    let ro: ResizeObserver
    let state: GLState | null = null
    let cancelled = false

    const start = () => {
      if (cancelled) return

      const gl = canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
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
        }
      }

      ro = new ResizeObserver(resize)
      ro.observe(canvas)
      resize()

      // ── Animation loop ──
      let currentAmplitude = amplitudeRef.current
      let frozenTime = 0
      const startTime = performance.now()

      const render = (now: number) => {
        rafId = requestAnimationFrame(render)

        const dt = 1 / 60
        const targetAmplitude = amplitudeRef.current
        currentAmplitude += (targetAmplitude - currentAmplitude) * Math.min(1, dt * 4)

        let time: number
        if (reducedMotionRef.current) {
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

      rafId = requestAnimationFrame(render)
    }

    // Defer initialization to avoid competing with page-load GPU work.
    // Metal shader compilation on macOS can fail transiently during heavy load.
    const timerId = setTimeout(start, 50)

    return () => {
      cancelled = true
      clearTimeout(timerId)
      cancelAnimationFrame(rafId)
      ro?.disconnect()
      if (state) {
        destroyGL(state)
        state = null
      }
    }
  }, [canvasRef])

  return failed
}
