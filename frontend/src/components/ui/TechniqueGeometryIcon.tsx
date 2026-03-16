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

  switch (geometry) {
    case 'grid':
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" stroke="currentColor" strokeWidth="1" className={className} style={style}>
          {[0, 1, 2, 3, 4].map(i => {
            const pos = (i / 4) * size
            return <g key={i}><line x1="0" y1={pos} x2={size} y2={pos} /><line x1={pos} y1="0" x2={pos} y2={size} /></g>
          })}
        </svg>
      )
    case 'triangle':
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" stroke="currentColor" strokeWidth="1" className={className} style={style}>
          <polygon points={`${c},1 ${size - 1},${size - 1} 1,${size - 1}`} />
        </svg>
      )
    case 'octagram': {
      const r = size * 0.45
      const sq1 = [0,1,2,3].map(i => { const a = i*Math.PI/2 - Math.PI/4; return `${c+r*Math.cos(a)},${c+r*Math.sin(a)}` }).join(' ')
      const sq2 = [0,1,2,3].map(i => { const a = i*Math.PI/2; return `${c+r*Math.cos(a)},${c+r*Math.sin(a)}` }).join(' ')
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" stroke="currentColor" strokeWidth="1" className={className} style={style}>
          <polygon points={sq1} /><polygon points={sq2} />
        </svg>
      )
    }
    case 'spiral': {
      const pts: string[] = []
      for (let i = 0; i <= 180; i++) { const t = i/60; const a = t*2*Math.PI; const r = (t/3)*size*0.45; pts.push(`${c+r*Math.cos(a)},${c+r*Math.sin(a)}`) }
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" stroke="currentColor" strokeWidth="1" className={className} style={style}>
          <polyline points={pts.join(' ')} />
        </svg>
      )
    }
  }
}
