import { useEffect, useRef } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { ACCENT_WARM, ACCENT_WARM_LIGHT, INK, SURFACE } from '@/lib/palette'

const HEX_COLOR = /^#[\da-f]{6}$/i

const COLOR_SOURCES = [
  { token: '--bw-accent-light', fallback: ACCENT_WARM_LIGHT },
  { token: '--bw-accent', fallback: ACCENT_WARM },
  { token: '--bw-surface', fallback: SURFACE },
  { token: '--bw-text', fallback: INK },
] as const

interface Mote {
  angle: number
  speed: number
  radius: number
  size: number
  depth: number
  twinkle: number
  color: string
}

function resolveColors(element: Element): string[] {
  const styles = getComputedStyle(element)
  return COLOR_SOURCES.map(({ token, fallback }) => {
    const value = styles.getPropertyValue(token).trim()
    return HEX_COLOR.test(value) ? value : fallback
  })
}

function createMotes(colors: string[]): Mote[] {
  return Array.from({ length: 36 }, (_, index) => ({
    angle: (index / 36) * Math.PI * 2 + Math.random() * 0.4,
    speed: 0.18 + Math.random() * 0.42,
    radius: 0.28 + Math.random() * 0.34,
    size: 0.7 + Math.random() * 1.8,
    depth: 0.35 + Math.random() * 0.65,
    twinkle: Math.random() * Math.PI * 2,
    color: colors[index % colors.length],
  }))
}

interface OrbParticleFieldProps {
  amplitude: number
  isActive: boolean
}

export function OrbParticleField({ amplitude, isActive }: OrbParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const amplitudeRef = useRef(amplitude)
  const isActiveRef = useRef(isActive)
  const requestRenderRef = useRef<(() => void) | null>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    amplitudeRef.current = amplitude
    isActiveRef.current = isActive
    requestRenderRef.current?.()
  }, [amplitude, isActive])

  useEffect(() => {
    if (reducedMotion) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const colors = resolveColors(canvas)
    const motes = createMotes(colors)
    let raf = 0
    let cancelled = false
    let last = performance.now()

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
    }

    const draw = (now: number) => {
      raf = 0
      if (cancelled) return
      resize()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const width = canvas.width
      const height = canvas.height
      const cx = width * 0.5
      const cy = height * 0.5
      const amp = amplitudeRef.current
      const orbit = Math.min(width, height) * (0.22 + amp * 0.16)
      const moving = isActiveRef.current && !document.hidden

      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'

      for (const mote of motes) {
        if (moving) {
          mote.angle += mote.speed * dt
          mote.twinkle += dt * 2.2
        }
        const x = cx + Math.cos(mote.angle) * orbit * mote.radius * (1.15 + amp * 0.2)
        const y = cy + Math.sin(mote.angle) * orbit * mote.radius * 0.72
        const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(mote.twinkle))
        const radius = mote.size * (0.7 + amp * 0.6) * Math.min(window.devicePixelRatio || 1, 2)
        ctx.globalAlpha = 0.18 + mote.depth * 0.42 * pulse
        ctx.fillStyle = mote.color
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'

      if (moving) {
        schedule()
      }
    }

    const schedule = () => {
      if (cancelled || raf !== 0) return
      raf = requestAnimationFrame(draw)
    }

    requestRenderRef.current = schedule

    const onVisibility = () => {
      if (!document.hidden) schedule()
    }

    document.addEventListener('visibilitychange', onVisibility)
    schedule()

    return () => {
      cancelled = true
      requestRenderRef.current = null
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [reducedMotion])

  if (reducedMotion) return null

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="orb-particle-field"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  )
}
