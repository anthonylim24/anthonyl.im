import { useEffect, useRef, type CSSProperties, type ReactNode, type Ref } from 'react'
import { sx } from '@/styles/merge'
import type { Pigment } from '../pigments'
import { wc } from '../styles/watercolor.stylex'
import type { BreathSample } from './breathDrive'

interface BloomAnchorProps {
  ref?: Ref<HTMLDivElement>
  pigment: Pigment
  read: () => BreathSample
  /** Progress stroke: a ring per phase, or a box traced once per cycle. */
  stroke?: 'ring' | 'box' | null
  /** Live scene is painting; hide the CSS wash. */
  live: boolean
  reducedMotion: boolean
  /** Re-apply once per engine tick under reduced motion. */
  tick?: unknown
  children?: ReactNode
  style?: Parameters<typeof sx>[0]
}

/**
 * The square the bloom lives in. Holds the painted CSS wash (first paint and
 * no-GPU fallback), the brush-stroke progress ring, and centred content. One
 * rAF loop writes `--bf-amp` and the stroke offset straight to the DOM, so
 * the 1 Hz engine never re-renders React mid-breath.
 */
export function BloomAnchor({ ref, pigment, read, stroke = null, live, reducedMotion, tick, children, style }: BloomAnchorProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const strokeRef = useRef<SVGPathElement>(null)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const apply = () => {
      const s = read()
      el.style.setProperty('--bf-amp', s.amplitude.toFixed(3))
      const path = strokeRef.current
      if (path) path.style.strokeDashoffset = String(1 - (stroke === 'box' ? s.cycle : s.progress))
    }
    apply()
    if (reducedMotion) return
    let raf = requestAnimationFrame(function loop() {
      apply()
      raf = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(raf)
  }, [read, reducedMotion, stroke, tick])

  const setRefs = (node: HTMLDivElement | null) => {
    boxRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }

  const vars = { '--bf-mass': pigment.mass, '--bf-glaze': pigment.glaze } as CSSProperties

  return (
    <div ref={setRefs} {...sx(wc.anchor, style)} style={vars}>
      <div aria-hidden="true" {...sx('bf-painted-bloom', live && wc.hidden)} />
      {stroke && (
        <svg aria-hidden="true" viewBox="0 0 200 200" {...sx(wc.strokeSvg)}>
          {stroke === 'box' ? (
            <>
              <rect x="22" y="22" width="156" height="156" rx="18" {...sx(wc.strokeGuide)} />
              <path ref={strokeRef} d="M22 160 V40 Q22 22 40 22 H160 Q178 22 178 40 V160 Q178 178 160 178 H40 Q22 178 22 160" pathLength={1} {...sx('bf-brush', wc.strokePaint)} />
            </>
          ) : (
            <>
              <circle cx="100" cy="100" r="88" {...sx(wc.strokeGuide)} />
              <path ref={strokeRef} d="M100 12 A88 88 0 1 1 99.99 12" pathLength={1} {...sx('bf-brush', wc.strokePaint)} />
            </>
          )}
        </svg>
      )}
      {children ? <div {...sx(wc.anchorCentre)}>{children}</div> : null}
    </div>
  )
}
