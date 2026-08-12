// Map Mode compass — dial tracks camera yaw via rAF (no React re-renders).
// Clicking orients the scene north-up via `korea-map-orient-north`.

import { useEffect, useRef, type CSSProperties } from "react"

interface MapModeCompassProps {
  yawRef: { current: number }
  onOrientNorth: () => void
  className?: string
  style?: CSSProperties
}

export function MapModeCompass({
  yawRef,
  onOrientNorth,
  className,
  style,
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
      className={
        className ??
        "inline-flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(28,25,23,0.08)] bg-[rgba(255,254,250,0.88)] text-stone-700 shadow-[0_8px_24px_rgba(28,25,23,0.1)] backdrop-blur-xl transition hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 dark:border-[rgba(255,252,245,0.06)] dark:bg-[rgba(28,25,23,0.78)] dark:text-stone-300 dark:hover:text-rose-200"
      }
      style={style}
    >
      <div
        ref={dialRef}
        aria-hidden
        className="relative h-7 w-7"
        style={{ transformOrigin: "center" }}
      >
        <svg viewBox="0 0 28 28" className="h-full w-full">
          <polygon points="14,2 11,14 17,14" className="fill-rose-600 dark:fill-rose-400" />
          <polygon points="14,26 11,14 17,14" className="fill-stone-400 dark:fill-stone-600" />
          <circle cx="14" cy="14" r="1.5" className="fill-stone-700 dark:fill-stone-300" />
        </svg>
        <span className="absolute -top-[3px] left-1/2 -translate-x-1/2 font-mono text-[7px] font-bold uppercase tracking-[0.18em] text-rose-700 dark:text-rose-300">
          N
        </span>
      </div>
    </button>
  )
}
