import { memo, useEffect, useRef } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { BreathAura } from './BreathAura'

export const AURA_NODE_COUNT = 11

interface AuraNode {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rotation: number
  rotationSpeed: number
  amplitude: number
}

function createAuraNodes(): AuraNode[] {
  return Array.from({ length: AURA_NODE_COUNT }, (_, id) => {
    const size = Math.floor(Math.random() * 36) + 34
    const speed = Math.random() * 0.65 + 0.35
    const angle = Math.random() * Math.PI * 2
    return {
      id,
      x: Math.random() * Math.max(window.innerWidth - size, 0),
      y: Math.random() * Math.max(window.innerHeight - size, 0),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() * 0.45 + 0.2) * (Math.random() < 0.5 ? 1 : -1),
      amplitude: 0.22 + Math.random() * 0.48,
    }
  })
}

export const BreathAuraField = memo(function BreathAuraField() {
  const reducedMotion = useReducedMotion()
  const nodesRef = useRef<AuraNode[] | null>(null)
  const nodeElemsRef = useRef<(HTMLDivElement | null)[]>([])
  const rafRef = useRef<number>(0)

  if (!reducedMotion && nodesRef.current === null) {
    nodesRef.current = createAuraNodes()
  }

  useEffect(() => {
    if (reducedMotion) return
    const nodes = nodesRef.current ?? []

    const loop = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        node.x += node.vx
        node.y += node.vy
        node.rotation += node.rotationSpeed

        if (node.x <= 0) {
          node.x = 0
          node.vx = Math.abs(node.vx)
        }
        if (node.x >= width - node.size) {
          node.x = width - node.size
          node.vx = -Math.abs(node.vx)
        }
        if (node.y <= 0) {
          node.y = 0
          node.vy = Math.abs(node.vy)
        }
        if (node.y >= height - node.size) {
          node.y = height - node.size
          node.vy = -Math.abs(node.vy)
        }

        const element = nodeElemsRef.current[i]
        if (element) {
          element.style.transform = `translate3d(${node.x}px, ${node.y}px, 0) rotate(${node.rotation}deg)`
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [reducedMotion])

  if (reducedMotion) return null

  return (
    <div
      data-testid="breath-aura-field"
      className="fixed inset-0 pointer-events-none z-[1]"
      aria-hidden="true"
    >
      {(nodesRef.current ?? []).map((node, index) => (
        <div
          key={node.id}
          data-testid="breath-aura-node"
          ref={(element) => {
            nodeElemsRef.current[index] = element
          }}
          className="absolute opacity-45"
          style={{
            width: node.size,
            height: node.size,
            transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
          }}
        >
          <BreathAura size={node.size} amplitude={node.amplitude} />
        </div>
      ))}
    </div>
  )
})
