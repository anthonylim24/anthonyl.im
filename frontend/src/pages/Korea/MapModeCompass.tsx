// Map Mode compass — small overlay badge that rotates with the camera's
// yaw so the user can always see which direction is north on the screen.
// Clicking the compass dispatches a "korea-map-orient-north" event and
// the scene's tick loop eases the yaw back to 0 (north up).
//
// The yaw value lives in a ref written by the Three.js tick loop. We
// read it via rAF so the React tree never re-renders on drag — only the
// inline CSS transform updates.

import { useEffect, useRef } from "react"

interface MapModeCompassProps {
  yawRef: { current: number }
  onOrientNorth: () => void
}

export function MapModeCompass({ yawRef, onOrientNorth }: MapModeCompassProps) {
  const dialRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let lastYaw = NaN
    function loop() {
      const el = dialRef.current
      const yaw = yawRef.current
      if (el && yaw !== lastYaw) {
        // CSS rotation in radians. yaw=0 → north at top (no rotation).
        // yaw=+π/2 → camera turned 90° CCW (looking from above), so
        // world-north now appears at screen-right → compass rotates
        // +90° clockwise so its N indicator tracks to the right.
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
      className="group absolute right-3 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/85 text-stone-700 shadow-md backdrop-blur transition hover:bg-stone-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 dark:bg-stone-900/85 dark:text-stone-300 dark:hover:bg-stone-900 dark:hover:text-rose-200"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 188px)" }}
    >
      {/* Rotating dial. The N indicator at the top tracks toward
          screen-north regardless of how the camera is oriented. */}
      <div
        ref={dialRef}
        aria-hidden
        className="relative h-7 w-7 transition-[transform] duration-100 ease-out"
        style={{ transformOrigin: "center" }}
      >
        <svg viewBox="0 0 28 28" className="h-full w-full">
          {/* North needle — filled rose triangle */}
          <polygon
            points="14,2 11,14 17,14"
            className="fill-rose-600 dark:fill-rose-400"
          />
          {/* South needle — outlined stone triangle */}
          <polygon
            points="14,26 11,14 17,14"
            className="fill-stone-400 dark:fill-stone-600"
          />
          {/* Hub */}
          <circle cx="14" cy="14" r="1.5" className="fill-stone-700 dark:fill-stone-300" />
        </svg>
        {/* N label rides above the dial, anchored to the dial so it
            rotates with the needle. Stays visible on hover via the
            group-hover treatment below. */}
        <span
          className="absolute -top-[3px] left-1/2 -translate-x-1/2 font-mono text-[7px] font-bold uppercase tracking-[0.18em] text-rose-700 dark:text-rose-300"
        >
          N
        </span>
      </div>
    </button>
  )
}
