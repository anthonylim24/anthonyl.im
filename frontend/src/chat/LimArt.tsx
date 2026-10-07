import { useId } from 'react'
import type { LimMood } from './scene/limScene'

const INK = 'var(--lim-ink-line)'
const MOUTH = '#3A1838'

const mouths: Record<LimMood, React.ReactNode> = {
  idle: <path d="M108 150 Q120 163 132 150" fill="none" stroke={MOUTH} strokeWidth="5" strokeLinecap="round" />,
  talking: <path d="M108 149 Q120 166 132 149 Z" fill={MOUTH} stroke={MOUTH} strokeWidth="3" strokeLinejoin="round" />,
  typing: <path d="M112 152 Q120 159 128 152" fill="none" stroke={MOUTH} strokeWidth="5" strokeLinecap="round" />,
  thinking: <ellipse cx="120" cy="155" rx="5.5" ry="7" fill={MOUTH} />,
  happy: (
    <g>
      <path d="M104 147 Q120 174 136 147 Z" fill={MOUTH} stroke={MOUTH} strokeWidth="3" strokeLinejoin="round" />
      <path d="M112 160 Q120 154 128 160 Q120 166 112 160 Z" fill="#FF8FA8" />
    </g>
  ),
  sad: <path d="M110 159 Q120 149 130 159" fill="none" stroke={MOUTH} strokeWidth="5" strokeLinecap="round" />,
}

const brows: Partial<Record<LimMood, React.ReactNode>> = {
  sad: (
    <g stroke="#3A2350" strokeWidth="4.5" strokeLinecap="round">
      <path d="M86 98 L102 92" />
      <path d="M154 98 L138 92" />
    </g>
  ),
  thinking: (
    <g stroke="#3A2350" strokeWidth="4.5" strokeLinecap="round">
      <path d="M86 92 L102 88" />
      <path d="M138 96 L154 96" />
    </g>
  ),
}

/**
 * Lim as flat vector art: the first-paint stand-in for the live jelly, the
 * whole mascot when WebGPU/WebGL2 is missing, and the avatar on replies.
 */
export function LimArt({
  mood = 'idle',
  shadow = false,
  ...box
}: {
  mood?: LimMood
  shadow?: boolean
  className?: string
  style?: React.CSSProperties
  onPointerDown?: () => void
}) {
  const id = 'lim' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const look = mood === 'thinking' ? [-4, -5] : mood === 'sad' ? [0, 5] : mood === 'typing' ? [4, 3] : [0, 0]
  const squint = mood === 'happy'
  return (
    <svg viewBox="26 28 188 178" {...box} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF8B6E" />
          <stop offset="1" stopColor="#FF6F7D" />
        </linearGradient>
        <radialGradient id={`${id}s`} cx="0.36" cy="0.3" r="0.78">
          <stop offset="0.62" stopColor="#D9476C" stopOpacity="0" />
          <stop offset="1" stopColor="#D9476C" stopOpacity="0.7" />
        </radialGradient>
      </defs>
      {shadow && <ellipse cx="120" cy="198" rx="80" ry="7" fill="#5B2D55" opacity="0.2" />}
      <path
        d="M120 34 C172 34 204 84 206 140 C208 182 176 196 120 196 C64 196 32 182 34 140 C36 84 68 34 120 34 Z"
        fill={`url(#${id}b)`}
      />
      <ellipse cx="120" cy="162" rx="54" ry="27" fill="#FFC9B2" opacity="0.55" />
      <path
        d="M120 34 C172 34 204 84 206 140 C208 182 176 196 120 196 C64 196 32 182 34 140 C36 84 68 34 120 34 Z"
        fill={`url(#${id}s)`}
        stroke={INK}
        strokeWidth="4"
      />
      <ellipse cx="84" cy="70" rx="18" ry="9" transform="rotate(-30 84 70)" fill="#fff" opacity="0.85" />
      <circle cx="107" cy="55" r="4" fill="#fff" opacity="0.85" />
      <ellipse cx="72" cy="145" rx="12" ry="8" fill="#FF4F86" opacity={mood === 'happy' ? 0.7 : 0.45} />
      <ellipse cx="168" cy="145" rx="12" ry="8" fill="#FF4F86" opacity={mood === 'happy' ? 0.7 : 0.45} />
      {brows[mood]}
      {[96, 144].map((cx) => (
        <g key={cx} className="lim-art-eye" style={{ transformOrigin: `${cx}px 120px` }}>
          <ellipse cx={cx} cy="120" rx="15.5" ry={squint ? 8 : 15.5} fill="#fff" stroke={INK} strokeWidth="3.5" />
          <circle cx={cx + look[0]} cy={120 + (squint ? 0 : look[1])} r={squint ? 5.5 : 8.5} fill="#2B2140" />
          {!squint && <circle cx={cx + look[0] - 4} cy={115 + look[1]} r="3.2" fill="#fff" />}
        </g>
      ))}
      {mouths[mood]}
    </svg>
  )
}
