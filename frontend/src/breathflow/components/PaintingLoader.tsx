import { useEffect, useState, type CSSProperties } from 'react'
import { layout } from '@/styles/common.stylex'
import { sx } from '@/styles/merge'
import type { Pigment } from '../pigments'

const LINES = ['Wetting the paper', 'Mixing {pigment}', 'Inking the ears', 'Painting whiskers', 'Letting the wash bloom']

// A sitting cat, drawn in the order a painter would: head and ears, body, tail, face.
const STROKES = [
  'M72 80 Q66 54 74 38 L90 55 Q100 52 110 55 L126 38 Q134 54 128 80 Q128 106 100 107 Q72 106 72 80',
  'M82 104 Q60 132 65 166 Q68 181 100 181 Q132 181 135 166 Q140 132 118 104',
  'M134 170 Q168 168 162 140 Q158 124 146 131',
  'M88 80 v4 M112 80 v4 M96 92 Q100 96 104 92 M78 88 L58 84 M78 94 L58 97 M122 88 L142 84 M122 94 L142 97',
]

/**
 * Shown while the live cat scene is still compiling: a brush inks the cat's
 * outline stroke by stroke over a blooming wash. Fades in after a beat, so a
 * warm scene (route changes) never flashes it.
 */
export function PaintingLoader({ pigment, reducedMotion }: { pigment: Pigment; reducedMotion: boolean }) {
  const [line, setLine] = useState(0)
  useEffect(() => {
    if (reducedMotion) return
    const id = setInterval(() => setLine((n) => (n + 1) % LINES.length), 1400)
    return () => clearInterval(id)
  }, [reducedMotion])
  const vars = { '--bf-mass': pigment.mass, '--bf-glaze': pigment.glaze } as CSSProperties
  const caption = LINES[line].replace('{pigment}', pigment.name.toLowerCase())

  return (
    <div role="status" {...sx('bf-loader')} style={vars}>
      <div {...sx('bf-loader-art')}>
        <div aria-hidden="true" {...sx('bf-loader-wash')} />
        <svg aria-hidden="true" viewBox="0 0 200 200" {...sx('bf-loader-cat')}>
          {STROKES.map((d, i) => (
            <path key={i} d={d} pathLength={1} {...sx('bf-brush', 'bf-loader-stroke')} style={{ '--i': i } as CSSProperties} />
          ))}
        </svg>
      </div>
      <p {...sx('bf-display', 'bf-loader-caption')}>
        <span aria-hidden="true">{caption}…</span>
        <span {...sx(layout.srOnly)}>Painting the cat…</span>
      </p>
    </div>
  )
}
