import { useMemo } from "react"
import { sx } from "@/styles/merge"
import { projectToBox, type LngLat } from "../map/geo"
import { cover as c } from "../index.stylex"

// A trip's cover is a small chart of the trip itself: its real stops,
// plotted over a graticule, in the trip's accent. No
// stock photography, no placeholder gradients: the data is the picture.

const W = 400
const H = 240

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967295
}

export function TripCover({ seed, points, still }: { seed: string; points: readonly LngLat[]; still?: string }) {
  // A real map picture of the trip replaces the chart as soon as one is drawn.
  if (still) return <img src={still} alt="" {...sx(c.still)} decoding="async" />
  return <CoverChart seed={seed} points={points} />
}

function CoverChart({ seed, points }: { seed: string; points: readonly LngLat[] }) {
  const { plotted, meridians, parallels } = useMemo(() => {
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
    return { plotted, meridians, parallels }
  }, [points, seed])

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
      {plotted.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} {...sx(c.stop)} />
      ))}
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
