import type { TechniqueId } from '@/lib/constants'
import { getTechniqueGeometry } from '@/lib/techniqueConfig'

interface TechniqueGeometryIconProps {
  techniqueId: TechniqueId
  className?: string
  style?: React.CSSProperties
  size?: number
}

export function TechniqueGeometryIcon({ techniqueId, className, style, size = 16 }: TechniqueGeometryIconProps) {
  const geometry = getTechniqueGeometry(techniqueId)
  const c = size / 2
  const decorativeProps = {
    'aria-hidden': true,
    focusable: 'false',
  } as const

  switch (geometry) {
    case 'grid':
      return (
        <svg {...decorativeProps} width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" stroke="currentColor" strokeWidth="1" className={className} style={style}>
          {[0, 1, 2, 3, 4].map(i => {
            const pos = (i / 4) * size
            return <g key={i}><line x1="0" y1={pos} x2={size} y2={pos} /><line x1={pos} y1="0" x2={pos} y2={size} /></g>
          })}
        </svg>
      )
    case 'triangle':
      return (
        <svg {...decorativeProps} width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" stroke="currentColor" strokeWidth="1" className={className} style={style}>
          <polygon points={`${c},1 ${size - 1},${size - 1} 1,${size - 1}`} />
        </svg>
      )
    case 'octagram': {
      const r = size * 0.45
      const sq1 = [0,1,2,3].map(i => { const a = i*Math.PI/2 - Math.PI/4; return `${c+r*Math.cos(a)},${c+r*Math.sin(a)}` }).join(' ')
      const sq2 = [0,1,2,3].map(i => { const a = i*Math.PI/2; return `${c+r*Math.cos(a)},${c+r*Math.sin(a)}` }).join(' ')
      return (
        <svg {...decorativeProps} width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" stroke="currentColor" strokeWidth="1" className={className} style={style}>
          <polygon points={sq1} /><polygon points={sq2} />
        </svg>
      )
    }
    case 'spiral': {
      const pts: string[] = []
      for (let i = 0; i <= 180; i++) { const t = i/60; const a = t*2*Math.PI; const r = (t/3)*size*0.45; pts.push(`${c+r*Math.cos(a)},${c+r*Math.sin(a)}`) }
      return (
        <svg {...decorativeProps} width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" stroke="currentColor" strokeWidth="1" className={className} style={style}>
          <polyline points={pts.join(' ')} />
        </svg>
      )
    }
    case 'wave': {
      const pts = [0, 1, 2, 3, 4].map((i) => {
        const x = (i / 4) * size
        const y = c + Math.sin(i * Math.PI / 2) * c * 0.45
        return `${x},${y}`
      }).join(' ')
      return (
        <svg {...decorativeProps} width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" className={className} style={style}>
          <polyline points={pts} />
          <line x1="0" y1={c} x2={size} y2={c} opacity="0.28" />
        </svg>
      )
    }
    case 'rings':
      return (
        <svg {...decorativeProps} width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" stroke="currentColor" strokeWidth="1" className={className} style={style}>
          {[0.18, 0.32, 0.46].map((r) => (
            <circle key={r} cx={c} cy={c} r={size * r} />
          ))}
        </svg>
      )
    case 'ladder':
      return (
        <svg {...decorativeProps} width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" className={className} style={style}>
          <line x1={size * 0.28} y1="1" x2={size * 0.28} y2={size - 1} />
          <line x1={size * 0.72} y1="1" x2={size * 0.72} y2={size - 1} />
          {[0.22, 0.5, 0.78].map((p) => (
            <line key={p} x1={size * 0.2} y1={size * p} x2={size * 0.8} y2={size * p} />
          ))}
        </svg>
      )
    case 'crescent':
      return (
        <svg {...decorativeProps} width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" className={className} style={style}>
          <path d={`M ${size * 0.68} ${size * 0.12} A ${size * 0.42} ${size * 0.42} 0 1 0 ${size * 0.68} ${size * 0.88} A ${size * 0.28} ${size * 0.28} 0 1 1 ${size * 0.68} ${size * 0.12}`} />
        </svg>
      )
    case 'diamond':
      return (
        <svg {...decorativeProps} width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" stroke="currentColor" strokeWidth="1" className={className} style={style}>
          <polygon points={`${c},1 ${size - 1},${c} ${c},${size - 1} 1,${c}`} />
          <line x1={c} y1="1" x2={c} y2={size - 1} opacity="0.4" />
          <line x1="1" y1={c} x2={size - 1} y2={c} opacity="0.4" />
        </svg>
      )
  }
}
