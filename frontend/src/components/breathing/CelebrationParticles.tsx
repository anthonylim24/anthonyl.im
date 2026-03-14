import { useEffect, useRef } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  opacity: number
  decay: number
  color: string
}

const COLORS = [
  'rgba(129, 140, 248, 0.8)', // indigo-400
  'rgba(232, 190, 114, 0.8)', // warm gold
  'rgba(165, 180, 252, 0.6)', // indigo-300
  'rgba(240, 208, 142, 0.6)', // lighter gold
  'rgba(99, 102, 241, 0.7)',  // indigo-500
]

function createParticle(cx: number, cy: number): Particle {
  const angle = Math.random() * Math.PI * 2
  const speed = 0.3 + Math.random() * 1.5
  return {
    x: cx,
    y: cy,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - 0.3, // slight upward bias
    radius: 1.5 + Math.random() * 3,
    opacity: 0.6 + Math.random() * 0.4,
    decay: 0.004 + Math.random() * 0.008,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }
}

interface CelebrationParticlesProps {
  /** Number of particles to emit */
  count?: number
}

export function CelebrationParticles({ count = 40 }: CelebrationParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (reducedMotion) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const cx = rect.width / 2
    const cy = rect.height / 2

    const particles: Particle[] = []
    for (let i = 0; i < count; i++) {
      particles.push(createParticle(cx, cy))
    }

    let raf: number

    function animate() {
      ctx!.clearRect(0, 0, rect.width, rect.height)

      let alive = false
      for (const p of particles) {
        if (p.opacity <= 0) continue
        alive = true

        p.x += p.vx
        p.y += p.vy
        p.vy += 0.01 // gentle gravity
        p.opacity -= p.decay

        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx!.fillStyle = p.color.replace(/[\d.]+\)$/, `${Math.max(0, p.opacity)})`)
        ctx!.fill()
      }

      if (alive) {
        raf = requestAnimationFrame(animate)
      }
    }

    raf = requestAnimationFrame(animate)

    return () => cancelAnimationFrame(raf)
  }, [count, reducedMotion])

  if (reducedMotion) return null

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-0"
      style={{ width: '100%', height: '100%' }}
      aria-hidden="true"
    />
  )
}
