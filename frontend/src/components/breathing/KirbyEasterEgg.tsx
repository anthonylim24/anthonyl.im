import { memo, useEffect, useRef } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
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

function getViewportSize() {
  if (typeof window === 'undefined') {
    return { width: 1024, height: 768 }
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

function createKirbys(): KirbyInstance[] {
  const viewport = getViewportSize()

  return Array.from({ length: KIRBY_COUNT }, (_, id) => {
    const size = Math.floor(Math.random() * 41) + 30
    const speed = Math.random() * 2.5 + 1
    const angle = Math.random() * Math.PI * 2

    return {
      id,
      x: Math.random() * Math.max(viewport.width - size, 0),
      y: Math.random() * Math.max(viewport.height - size, 0),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() * 3 + 1) * (Math.random() < 0.5 ? 1 : -1),
      puff: Math.random() * 0.6,
    }
  })
}

export const KirbyEasterEgg = memo(function KirbyEasterEgg() {
  const reducedMotion = useReducedMotion()
  const kirbysRef = useRef<KirbyInstance[] | null>(null)
  const kirbyElemsRef = useRef<(HTMLDivElement | null)[]>([])
  const rafRef = useRef<number>(0)

  if (!kirbysRef.current && !reducedMotion) {
    kirbysRef.current = createKirbys()
  }

  useEffect(() => {
    if (reducedMotion || !kirbysRef.current) return

    const loop = () => {
      const viewport = getViewportSize()

      for (let i = 0; i < kirbysRef.current!.length; i++) {
        const kirby = kirbysRef.current![i]
        kirby.x += kirby.vx
        kirby.y += kirby.vy
        kirby.rotation += kirby.rotationSpeed

        if (kirby.x <= 0) {
          kirby.x = 0
          kirby.vx = Math.abs(kirby.vx)
          kirby.rotationSpeed = Math.abs(kirby.rotationSpeed)
        }
        if (kirby.x >= viewport.width - kirby.size) {
          kirby.x = viewport.width - kirby.size
          kirby.vx = -Math.abs(kirby.vx)
          kirby.rotationSpeed = -Math.abs(kirby.rotationSpeed)
        }
        if (kirby.y <= 0) {
          kirby.y = 0
          kirby.vy = Math.abs(kirby.vy)
        }
        if (kirby.y >= viewport.height - kirby.size) {
          kirby.y = viewport.height - kirby.size
          kirby.vy = -Math.abs(kirby.vy)
        }

        const element = kirbyElemsRef.current[i]
        if (element) {
          element.style.transform = `translate3d(${kirby.x}px, ${kirby.y}px, 0) rotate(${kirby.rotation}deg)`
        }
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [reducedMotion])

  if (reducedMotion || !kirbysRef.current) return null

  return (
    <div
      aria-hidden="true"
      data-testid="kirby-easter-egg"
      className="fixed inset-0 pointer-events-none z-[1]"
    >
      {kirbysRef.current.map((kirby, index) => (
        <div
          key={kirby.id}
          data-testid="kirby-instance"
          ref={(element) => {
            kirbyElemsRef.current[index] = element
          }}
          className="absolute"
          style={{
            width: kirby.size,
            height: kirby.size,
            transform: `translate3d(${kirby.x}px, ${kirby.y}px, 0)`,
            willChange: 'transform',
          }}
        >
          <div
            className="absolute rounded-full"
            style={{
              inset: `-${Math.round(kirby.size * 0.2)}px`,
              background: 'radial-gradient(circle, rgba(255,150,170,0.3) 0%, transparent 70%)',
            }}
          />
          <KirbyCharacter size={kirby.size} puffAmount={kirby.puff} />
        </div>
      ))}
    </div>
  )
})
