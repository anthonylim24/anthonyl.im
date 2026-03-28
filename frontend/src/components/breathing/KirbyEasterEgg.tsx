import { memo, useEffect, useRef } from 'react'
import { KirbyCharacter } from './KirbyCharacter'

export const KIRBY_COUNT = 11

interface KirbyInstance {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rotation: number
  rotationSpeed: number
  puff: number
}

function createKirbys(): KirbyInstance[] {
  return Array.from({ length: KIRBY_COUNT }, (_, id) => {
    const size = Math.floor(Math.random() * 41) + 30
    const speed = Math.random() * 2.5 + 1
    const angle = Math.random() * Math.PI * 2
    return {
      id,
      x: Math.random() * Math.max(window.innerWidth - size, 0),
      y: Math.random() * Math.max(window.innerHeight - size, 0),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() * 3 + 1) * (Math.random() < 0.5 ? 1 : -1),
      // Static random puff per Kirby — avoids per-frame computation for a prop
      // that only takes effect at React render time anyway
      puff: Math.random() * 0.6,
    }
  })
}

export const KirbyEasterEgg = memo(function KirbyEasterEgg() {
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
        k.rotation += k.rotationSpeed

        // Bounce off edges with a little spin kick
        if (k.x <= 0) { k.x = 0; k.vx = Math.abs(k.vx); k.rotationSpeed = Math.abs(k.rotationSpeed) }
        if (k.x >= w - k.size) { k.x = w - k.size; k.vx = -Math.abs(k.vx); k.rotationSpeed = -Math.abs(k.rotationSpeed) }
        if (k.y <= 0) { k.y = 0; k.vy = Math.abs(k.vy) }
        if (k.y >= h - k.size) { k.y = h - k.size; k.vy = -Math.abs(k.vy) }

        const el = kirbyElemsRef.current[i]
        if (el) {
          // translate3d promotes to GPU layer; only transform + opacity are composited
          el.style.transform = `translate3d(${k.x}px, ${k.y}px, 0) rotate(${k.rotation}deg)`
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
            transform: `translate3d(${k.x}px, ${k.y}px, 0)`,
            willChange: 'transform',
          }}
        >
          {/* Static pink glow — cheaper than drop-shadow filter which forces
              CPU rasterization on every frame when transform changes */}
          <div
            className="absolute rounded-full"
            style={{
              inset: `-${Math.round(k.size * 0.2)}px`,
              background: 'radial-gradient(circle, rgba(255,150,170,0.3) 0%, transparent 70%)',
            }}
          />
          <KirbyCharacter size={k.size} puffAmount={k.puff} />
        </div>
      ))}
    </div>
  )
})
