import { useMemo } from "react"
import { sx } from "@/styles/merge"
import { projectToBox, type LngLat } from "../map/geo"
import { cover as c } from "../index.stylex"

// A trip's cover is a small chart of the trip itself: its real stops,
// plotted in itinerary order over a graticule, in the trip's accent. No
// stock photography, no placeholder gradients: the data is the picture.

const W = 400
const H = 240

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967295
}

/** Smooth path through the points (Catmull-Rom → cubic Bézier). */
function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return ""
  let d = `M${points[0]!.x.toFixed(1)},${points[0]!.y.toFixed(1)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!
    const p1 = points[i]!
    const p2 = points[i + 1]!
    const p3 = points[Math.min(points.length - 1, i + 2)]!
    const t = 0.18
    d += ` C${(p1.x + (p2.x - p0.x) * t).toFixed(1)},${(p1.y + (p2.y - p0.y) * t).toFixed(1)} ${(p2.x - (p3.x - p1.x) * t).toFixed(1)},${(p2.y - (p3.y - p1.y) * t).toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
  }
  return d
}

export function TripCover({ seed, points }: { seed: string; points: readonly LngLat[] }) {
  const { plotted, path, meridians, parallels } = useMemo(() => {
    const plotted = projectToBox(points, W, H, 44)
    const tilt = (hash(seed) - 0.5) * 70
    // A slice of globe graticule, off-centre so every cover differs.
    const cx = W * (0.25 + hash(`${seed}x`) * 0.5)
    const cy = H * 1.9
    const meridians = Array.from({ length: 9 }, (_, i) => {
      const spread = (i - 4) * 62 + tilt
      return `M${cx + spread * 0.25},${-10} Q${cx + spread * 1.5},${H * 0.5} ${cx + spread * 2.4},${H + 10}`
    })
    const parallels = Array.from({ length: 5 }, (_, i) => {
      const r = H * 1.25 + i * 58
      return `M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`
    })
    return { plotted, path: smoothPath(plotted), meridians, parallels }
  }, [points, seed])

  const last = plotted[plotted.length - 1]
  return (
    <svg {...sx(c.svg)} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width={W} height={H} {...sx(c.wash)} />
      <g {...sx(c.graticule)}>
        {meridians.map((d, i) => (
          <path key={`m${i}`} d={d} />
        ))}
        {parallels.map((d, i) => (
          <path key={`p${i}`} d={d} />
        ))}
      </g>
      {path && <path d={path} pathLength={1} {...sx(c.route)} />}
      {plotted.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === 0 || i === plotted.length - 1 ? 4 : 2.4} {...sx(c.stop)} />
      ))}
      {last && <circle cx={last.x} cy={last.y} r={9} {...sx(c.halo)} />}
      {plotted.length === 0 && (
        <g {...sx(c.empty)}>
          <circle cx={W / 2} cy={H / 2} r={5} {...sx(c.stop)} />
          <circle cx={W / 2} cy={H / 2} r={16} {...sx(c.halo)} />
          <circle cx={W / 2} cy={H / 2} r={30} {...sx(c.haloFar)} />
        </g>
      )}
    </svg>
  )
}
