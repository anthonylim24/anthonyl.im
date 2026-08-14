import { useEffect, useRef, type RefObject } from 'react'
import { useReducedMotion } from '../platform/useReducedMotion'

interface Mote {
  angle: number
  speed: number
  radius: number
  size: number
  depth: number
  twinkle: number
  color: string
}

function createMotes(colors: [string, string]): Mote[] {
  return Array.from({ length: 32 }, (_, index) => ({
    angle: (index / 32) * Math.PI * 2 + Math.random() * 0.35,
    speed: 0.16 + Math.random() * 0.4,
    radius: 0.3 + Math.random() * 0.32,
    size: 0.65 + Math.random() * 1.7,
    depth: 0.35 + Math.random() * 0.65,
    twinkle: Math.random() * Math.PI * 2,
    color: colors[index % 2],
  }))
}

interface OrbParticleFieldProps {
  colors: [string, string]
  amplitudeRef: RefObject<number>
}

export function OrbParticleField({ colors, amplitudeRef }: OrbParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const requestRenderRef = useRef<(() => void) | null>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (reducedMotion) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

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
      const orbit = Math.min(width, height) * (0.24 + amp * 0.12)
      const moving = !document.hidden

      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'
      for (const mote of motes) {
        if (moving) {
          mote.angle += mote.speed * dt
          mote.twinkle += dt * 2.1
        }
        const x = cx + Math.cos(mote.angle) * orbit * mote.radius * (1.12 + amp * 0.15)
        const y = cy + Math.sin(mote.angle) * orbit * mote.radius * 0.7
        const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(mote.twinkle))
        const radius = mote.size * (0.7 + amp * 0.45) * Math.min(window.devicePixelRatio || 1, 2)
        ctx.globalAlpha = 0.16 + mote.depth * 0.4 * pulse
        ctx.fillStyle = mote.color
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      if (moving) schedule()
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
  }, [colors[0], colors[1], reducedMotion])

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
