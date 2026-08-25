import { sx } from '@/styles/merge'
import type { StyleXStyles } from '@stylexjs/stylex'
import { mapModeCompass } from './MapModeCompass.stylex'
// Map Mode compass — dial tracks camera yaw via rAF (no React re-renders).
// Clicking orients the scene north-up via `korea-map-orient-north`.

import { useEffect, useRef, type CSSProperties } from "react"

interface MapModeCompassProps {
  yawRef: { current: number }
  onOrientNorth: () => void
  style?: StyleXStyles
  inlineStyle?: CSSProperties
}

export function MapModeCompass({
  yawRef,
  onOrientNorth,
  style,
  inlineStyle,
}: MapModeCompassProps) {
  const dialRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let lastYaw = NaN
    function loop() {
      const el = dialRef.current
      const yaw = yawRef.current
      if (el && yaw !== lastYaw) {
        el.style.transform = `rotate(${yaw}rad)`
        lastYaw = yaw
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [yawRef])

  return (
    <button
      type="button"
      onClick={onOrientNorth}
      title="Orient north up"
      aria-label="Orient north up"
      {...sx(mapModeCompass.button, style)}
      style={inlineStyle}
    >
      <div
        ref={dialRef}
        aria-hidden
        {...sx(mapModeCompass.s718dff)}
        style={{ transformOrigin: "center" }}
      >
        <svg viewBox="0 0 28 28" {...sx(mapModeCompass.s284c2f1)}>
          <polygon points="14,2 11,14 17,14" {...sx(mapModeCompass.s91b1cc5a)} />
          <polygon points="14,26 11,14 17,14" {...sx(mapModeCompass.s51215eea)} />
          <circle cx="14" cy="14" r="1.5" {...sx(mapModeCompass.s2fb61f6a)} />
        </svg>
        <span {...sx(mapModeCompass.s354f7a26)}>
          N
        </span>
      </div>
    </button>
  )
}
