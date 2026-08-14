import { memo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { ACCENT_WARM, ACCENT_WARM_LIGHT } from '@/lib/palette'

const HEX_COLOR = /^#[\da-f]{6}$/i
const STAR_COUNT = 48

interface Star {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  phase: number
  color: string
}

function resolveAccent(element: Element): [string, string] {
  const styles = getComputedStyle(element)
  const accent = styles.getPropertyValue('--bw-accent').trim()
  const light = styles.getPropertyValue('--bw-accent-light').trim()
  return [
    HEX_COLOR.test(accent) ? accent : ACCENT_WARM,
    HEX_COLOR.test(light) ? light : ACCENT_WARM_LIGHT,
  ]
}

function createStars(width: number, height: number, colors: [string, string]): Star[] {
  return Array.from({ length: STAR_COUNT }, (_, index) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.12,
    vy: (Math.random() - 0.5) * 0.08,
    size: index % 7 === 0 ? 1.6 : 0.6 + Math.random() * 0.9,
    phase: Math.random() * Math.PI * 2,
    color: colors[index % 2],
  }))
}

export const BreathStarfield = memo(function BreathStarfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (reducedMotion) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const colors = resolveAccent(canvas)
    let stars = createStars(1, 1, colors)
    let raf = 0
    let cancelled = false
    let last = performance.now()

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(window.innerWidth * dpr))
      const height = Math.max(1, Math.round(window.innerHeight * dpr))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        stars = createStars(width, height, colors)
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
      const moving = !document.hidden

      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'

      for (const star of stars) {
        if (moving) {
          star.x += star.vx
          star.y += star.vy
          star.phase += dt * 1.4
          if (star.x < 0) star.x = width
          if (star.x > width) star.x = 0
          if (star.y < 0) star.y = height
          if (star.y > height) star.y = 0
        }
        const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(star.phase))
        ctx.globalAlpha = 0.16 + pulse * 0.28
        ctx.fillStyle = star.color
        ctx.beginPath()
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2)
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

    const onVisibility = () => {
      if (!document.hidden) schedule()
    }

    document.addEventListener('visibilitychange', onVisibility)
    schedule()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [reducedMotion])

  if (reducedMotion) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="breath-starfield"
      className="breath-starfield"
    />,
    document.body,
  )
})
