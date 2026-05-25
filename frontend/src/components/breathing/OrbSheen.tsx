import { useEffect, useRef } from 'react'

/**
 * Additive specular sheen layered over the LiquidGlass refraction.
 *
 * The translucent glass body already shows leaves refracted through it; on
 * its own that reads flat. This component overlays a noise-deformed sphere
 * shaded with a bright Blinn–Phong hotspot, a soft halo, and a rim light —
 * the same composition you'd see from a raymarched sphere SDF with a fbm
 * displacement, but computed analytically in screen space against the disc.
 *
 * Composited via `mix-blend-mode: screen` so dark regions vanish and only
 * the highlights and rim brighten the underlying glass.
 *
 * Must be a DOM sibling rendered AFTER the LiquidGlass glass element so the
 * library's scene walker (which stops at the current glass) never sees this
 * canvas. Otherwise the highlight would get refracted into oblivion instead
 * of sitting cleanly on top of the orb.
 */
interface OrbSheenProps {
  amplitude: number
  isActive: boolean
  className?: string
}

const VERT = `#version 300 es
precision highp float;
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1])

// The SDF + noise parameters intentionally mirror the ShaderOrb body
// (radius = 0.16 + amp * 0.22, fbm displacement amplitude 0.08) so the
// highlight tracks the *actual* visible orb edge as it breathes. Diverging
// from those numbers makes the specular drift off the orb body.
const FRAG = `#version 300 es
precision highp float;

uniform float u_time;
uniform float u_amplitude;
uniform vec2 u_resolution;

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
  vec2 fromCenter = uv - vec2(0.5);
  float aspect = u_resolution.x / u_resolution.y;
  fromCenter.x *= aspect;

  float dist = length(fromCenter);
  float baseRadius = 0.16 + u_amplitude * 0.22;
  float displace = fbm(fromCenter * 3.5 + u_time * 0.15) * 0.08 * (0.3 + u_amplitude * 0.7);
  float effRadius = max(baseRadius + displace, 0.0001);
  float sdf = dist - effRadius;

  // Outside the body: a thin rim glow extends a short distance past the
  // silhouette. Anywhere further out is fully transparent so the layer
  // doesn't tint the dark canvas around the orb.
  if (sdf > 0.0) {
    float rim = smoothstep(0.018, 0.0, sdf);
    rim = pow(rim, 1.6) * 0.45;
    fragColor = vec4(vec3(1.0, 0.96, 0.88) * rim, rim);
    return;
  }

  // Hemisphere projection: treat the disc as the front-facing surface of a
  // unit sphere of radius effRadius. ndist∈[0,1] is the normalised radial
  // coord; sphereZ is the surface height.
  float ndist = clamp(dist / effRadius, 0.0, 1.0);
  float sphereZ = sqrt(max(0.0, 1.0 - ndist * ndist));
  vec3 normal = vec3(fromCenter / effRadius, sphereZ);

  // Micro-bumps perturb the normal so the highlight shimmers like wet
  // glass under a moving light instead of sliding as a static gradient.
  vec2 bumpCoord = fromCenter * 14.0 + u_time * 0.18;
  float bx = noise(bumpCoord + vec2(0.5, 0.0)) - noise(bumpCoord);
  float by = noise(bumpCoord + vec2(0.0, 0.5)) - noise(bumpCoord);
  normal.xy += vec2(bx, by) * 0.28;
  normal = normalize(normal);

  vec3 lightDir = normalize(vec3(-0.48, 0.58, 0.7));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfVec = normalize(lightDir + viewDir);
  float NdotH = max(dot(normal, halfVec), 0.0);
  float NdotV = max(dot(normal, viewDir), 0.0);

  // Three-band specular: a tight hotspot, a softer halo around it, and a
  // very wide diffuse-ish lobe to fake subsurface brightness on the lit
  // hemisphere without lighting the dark side.
  float specHot = pow(NdotH, 110.0) * 1.1;
  float specHalo = pow(NdotH, 28.0) * 0.22;
  float diffuse = pow(max(dot(normal, lightDir), 0.0), 1.5) * 0.06;

  // Fresnel rim brightening — the defining cue for a glass sphere.
  float fresnel = pow(1.0 - NdotV, 3.4) * 0.45;

  // Soft body-edge falloff so the layer fades out at the silhouette
  // rather than ending in a hard ring.
  float bodyMask = smoothstep(0.0, -0.04, sdf);

  vec3 warmHi = vec3(1.0, 0.97, 0.90);
  vec3 coolRim = vec3(0.92, 0.96, 1.0);
  vec3 col =
      warmHi * specHot
    + warmHi * specHalo
    + warmHi * diffuse
    + coolRim * fresnel;

  float alpha = clamp(specHot + specHalo + diffuse + fresnel, 0.0, 0.95) * bodyMask;
  fragColor = vec4(col * bodyMask, alpha);
}
`

export function OrbSheen({ amplitude, isActive, className }: OrbSheenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const amplitudeRef = useRef(amplitude)
  const isActiveRef = useRef(isActive)

  // Latest-value ref pattern — the RAF loop reads these without re-binding
  // on every prop change. Updating during render is intentional.
  /* eslint-disable react-hooks/refs */
  amplitudeRef.current = amplitude
  isActiveRef.current = isActive
  /* eslint-enable react-hooks/refs */

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
    })
    if (!gl) return

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)
      if (!sh) return null
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh)
        return null
      }
      return sh
    }

    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return

    const program = gl.createProgram()
    if (!program) return
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program)
      return
    }
    gl.deleteShader(vs)
    gl.deleteShader(fs)

    const vbo = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(program, 'a_pos')
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uTime = gl.getUniformLocation(program, 'u_time')
    const uAmp = gl.getUniformLocation(program, 'u_amplitude')
    const uRes = gl.getUniformLocation(program, 'u_resolution')

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    const start = performance.now()
    let raf = 0
    let cancelled = false

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    const render = () => {
      if (cancelled) return
      resize()
      const t = (performance.now() - start) / 1000
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(program)
      gl.bindVertexArray(vao)
      gl.uniform1f(uTime, t)
      gl.uniform1f(uAmp, amplitudeRef.current)
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      raf = requestAnimationFrame(render)
    }
    render()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      gl.deleteProgram(program)
      gl.deleteBuffer(vbo)
      gl.deleteVertexArray(vao)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        mixBlendMode: 'screen',
      }}
    />
  )
}
