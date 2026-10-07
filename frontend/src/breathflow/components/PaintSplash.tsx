import { useMemo } from 'react'
import { motion } from 'motion/react'
import { sx, stylex } from '@/styles/merge'
import type { Pigment } from '../pigments'

const styles = stylex.create({
  root: {
    position: 'absolute',
    left: '50%',
    top: '-3rem',
    width: 'min(100vw, 56rem)',
    height: '24rem',
    transform: 'translateX(-50%)',
    pointerEvents: 'none',
    overflow: 'visible',
  },
})

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** An irregular splat outline: a wobbly circle with a few thrown fingers. */
function splatPath(rand: () => number, r: number, points = 18, spikes = 4): string {
  const pts: [number, number][] = []
  const spikeAt = new Set(Array.from({ length: spikes }, () => Math.floor(rand() * points)))
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2
    const k = spikeAt.has(i) ? 1.35 + rand() * 0.45 : 0.82 + rand() * 0.3
    pts.push([Math.cos(a) * r * k, Math.sin(a) * r * k])
  }
  const mid = (p: [number, number], q: [number, number]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
  const start = mid(pts[points - 1], pts[0])
  let d = `M${start[0].toFixed(1)} ${start[1].toFixed(1)}`
  for (let i = 0; i < points; i++) {
    const p = pts[i]
    const m = mid(p, pts[(i + 1) % points])
    d += ` Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`
  }
  return `${d}Z`
}

interface PaintSplashProps {
  pigment: Pigment
  /** Personal best or new badge: a bigger throw. */
  big: boolean
  reducedMotion: boolean
}

/**
 * Session-complete celebration: a loaded brush flicked at the paper. A
 * central splat blooms with a springy overshoot, droplets fly out and land,
 * and a few satellite splats spread as they soak in. Under reduced motion the
 * finished painting appears without the throw.
 */
export function PaintSplash({ pigment, big, reducedMotion }: PaintSplashProps) {
  const art = useMemo(() => {
    const rand = mulberry32(big ? 7 : 3)
    const drops = Array.from({ length: big ? 30 : 18 }, (_, i) => {
      const a = rand() * Math.PI * 2
      const dist = 90 + rand() * (big ? 260 : 190)
      return {
        id: i,
        x: Math.cos(a) * dist,
        y: Math.sin(a) * dist * 0.62,
        r: 2.5 + rand() * (i % 5 === 0 ? 9 : 4.5),
        glaze: rand() > 0.55,
        delay: 0.08 + rand() * 0.18,
      }
    })
    const satellites = Array.from({ length: big ? 6 : 4 }, (_, i) => {
      const a = rand() * Math.PI * 2
      const dist = 110 + rand() * 150
      return {
        id: i,
        x: Math.cos(a) * dist,
        y: Math.sin(a) * dist * 0.55,
        d: splatPath(rand, 16 + rand() * 18, 12, 2),
        glaze: i % 2 === 0,
        delay: 0.25 + rand() * 0.3,
      }
    })
    return { core: splatPath(rand, big ? 92 : 78, 22, big ? 7 : 5), drops, satellites }
  }, [big])

  const mass = `color-mix(in srgb, ${pigment.mass} 62%, transparent)`
  const glaze = `color-mix(in srgb, ${pigment.glaze} 58%, transparent)`
  const still = reducedMotion

  return (
    <svg aria-hidden="true" viewBox="-448 -192 896 384" {...sx('bf-splash', styles.root)}>
      <g filter="url(#bf-wash)">
        <motion.path
          d={art.core}
          fill={mass}
          initial={still ? false : { scale: 0.1, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 150, damping: 11, mass: 0.9 }}
        />
        <motion.path
          d={art.core}
          fill={glaze}
          initial={still ? false : { scale: 0.05, opacity: 0 }}
          animate={{ scale: 0.55, opacity: 0.9 }}
          transition={{ type: 'spring', stiffness: 120, damping: 14, delay: 0.12 }}
        />
        {art.satellites.map((s) => (
          <motion.path
            key={`s${s.id}`}
            d={s.d}
            fill={s.glaze ? glaze : mass}
            style={{ x: s.x, y: s.y }}
            initial={still ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.85 }}
            transition={{ type: 'spring', stiffness: 110, damping: 16, delay: s.delay }}
          />
        ))}
        {art.drops.map((drop) => (
          <motion.circle
            key={drop.id}
            r={drop.r}
            fill={drop.glaze ? glaze : mass}
            initial={still ? { cx: drop.x, cy: drop.y } : { cx: 0, cy: 0, opacity: 0, scale: 0.4 }}
            animate={{ cx: drop.x, cy: drop.y, opacity: 0.9, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.12, 0.9, 0.2, 1], delay: drop.delay }}
          />
        ))}
      </g>
    </svg>
  )
}
