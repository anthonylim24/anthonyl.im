import { useEffect, useRef } from 'react'
import { KirbyCharacter } from './KirbyCharacter'

export const KIRBY_COUNT = 11

interface KirbyInstance {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  size: number
}

function createKirbys(): KirbyInstance[] {
  return Array.from({ length: KIRBY_COUNT }, (_, id) => {
    const size = Math.floor(Math.random() * 41) + 30
    return {
      id,
      x: Math.random() * Math.max(window.innerWidth - size, 0),
      y: Math.random() * Math.max(window.innerHeight - size, 0),
      vx: (Math.random() * 2 + 1) * (Math.random() < 0.5 ? 1 : -1),
      vy: (Math.random() * 2 + 1) * (Math.random() < 0.5 ? 1 : -1),
      size,
    }
  })
}

export function KirbyEasterEgg() {
  const kirbysRef = useRef<KirbyInstance[]>(createKirbys())
  const kirbyElemsRef = useRef<(HTMLDivElement | null)[]>([])
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const loop = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      for (let i = 0; i < kirbysRef.current.length; i++) {
        const k = kirbysRef.current[i]
        k.x += k.vx
        k.y += k.vy
        // Bounce off edges
        if (k.x <= 0) { k.x = 0; k.vx = Math.abs(k.vx) }
        if (k.x >= w - k.size) { k.x = w - k.size; k.vx = -Math.abs(k.vx) }
        if (k.y <= 0) { k.y = 0; k.vy = Math.abs(k.vy) }
        if (k.y >= h - k.size) { k.y = h - k.size; k.vy = -Math.abs(k.vy) }
        const el = kirbyElemsRef.current[i]
        if (el) {
          el.style.transform = `translate(${k.x}px, ${k.y}px)`
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div
      data-testid="kirby-easter-egg"
      className="fixed inset-0 pointer-events-none z-[1]"
    >
      {kirbysRef.current.map((k, i) => (
        <div
          key={k.id}
          data-testid="kirby-instance"
          ref={(el) => { kirbyElemsRef.current[i] = el }}
          className="absolute"
          style={{
            width: k.size,
            height: k.size,
            transform: `translate(${k.x}px, ${k.y}px)`,
            opacity: 0.85,
          }}
        >
          <KirbyCharacter size={k.size} />
        </div>
      ))}
    </div>
  )
}
