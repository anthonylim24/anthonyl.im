import { memo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useReducedMotion } from '../platform/useReducedMotion'

const STAR_COUNT = 42

interface Star {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  phase: number
  color: string
}

function resolveColors(element: Element): [string, string] {
  const styles = getComputedStyle(element)
  const accent = styles.getPropertyValue('--bw-accent').trim() || '#22624A'
  const light = styles.getPropertyValue('--bw-accent-light').trim() || '#3E8266'
  return [accent, light]
}

function createStars(width: number, height: number, colors: [string, string]): Star[] {
  return Array.from({ length: STAR_COUNT }, (_, index) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.1,
    vy: (Math.random() - 0.5) * 0.07,
    size: index % 7 === 0 ? 1.5 : 0.55 + Math.random() * 0.85,
    phase: Math.random() * Math.PI * 2,
    color: colors[index % 2],
  }))
}

interface BreathStarfieldProps {
  inline?: boolean
}

export const BreathStarfield = memo(function BreathStarfield({ inline = false }: BreathStarfieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (reducedMotion) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const colors = resolveColors(canvas)
    let stars = createStars(1, 1, colors)
    let raf = 0
    let cancelled = false
    let last = performance.now()

    const measure = () => {
      if (inline) {
        return {
          width: Math.max(1, canvas.clientWidth),
          height: Math.max(1, canvas.clientHeight),
        }
      }
      return { width: window.innerWidth, height: window.innerHeight }
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const { width: cssW, height: cssH } = measure()
      const width = Math.max(1, Math.round(cssW * dpr))
      const height = Math.max(1, Math.round(cssH * dpr))
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
          star.phase += dt * 1.35
          if (star.x < 0) star.x = width
          if (star.x > width) star.x = 0
          if (star.y < 0) star.y = height
          if (star.y > height) star.y = 0
        }
        const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(star.phase))
        ctx.globalAlpha = 0.14 + pulse * 0.26
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
  }, [inline, reducedMotion])

  if (reducedMotion) return null
  if (!inline && typeof document === 'undefined') return null

  const node = (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid={inline ? 'breath-starfield-inline' : 'breath-starfield'}
      className={inline ? 'pointer-events-none absolute inset-0 h-full w-full' : 'bf-starfield'}
    />
  )

  if (inline) return node
  return createPortal(node, document.body)
})
