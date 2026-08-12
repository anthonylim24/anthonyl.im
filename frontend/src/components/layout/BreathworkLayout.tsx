import { useRef, useEffect, lazy, memo, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { AnimatedOutlet } from './AnimatedOutlet'
import type { CSSProperties } from 'react'
import { Header } from './Header'
import { Navigation } from './Navigation'
import { useTheme } from '@/hooks/useTheme'
import { useFavicon } from '@/hooks/useFavicon'
import { useDocumentMetadata } from '@/hooks/useDocumentMetadata'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useSettingsStore } from '@/stores/settingsStore'
import { CLERK_ENABLED } from '@/lib/clerk'
import { BREATHFLOW_ROUTE_METADATA } from '@/lib/routeMetadata'

const CloudSync = lazy(() =>
  import('./CloudSync').then((module) => ({ default: module.CloudSync })),
)

const LEAVES_VISIBLE_OPACITY = '0.5'

/**
 * Fully isolated video component — subscribes to the theme store directly
 * and manages play/pause imperatively via refs. Wrapped in memo with a
 * comparator that only allows reduced-motion changes through. This prevents
 * browsers from restarting the video during ordinary parent re-renders.
 */
const LeavesVideo = memo(function LeavesVideo({ reducedMotion }: { reducedMotion: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (reducedMotion) return

    const apply = (isDark: boolean) => {
      const wrap = wrapRef.current
      const video = videoRef.current
      if (wrap) wrap.style.opacity = isDark ? '0' : LEAVES_VISIBLE_OPACITY
      if (!video) return
      if (isDark) {
        video.pause()
      } else {
        video.play().catch(() => {})
      }
    }

    const unsubscribe = useSettingsStore.subscribe((state) => {
      apply(state.theme === 'dark')
    })

    apply(useSettingsStore.getState().theme === 'dark')
    return unsubscribe
  }, [reducedMotion])

  if (reducedMotion) return null
  if (typeof document === 'undefined') return null

  // Portal to body so a viewport-sized texture cannot sit in BreathFlow's
  // document flow. On iOS, a `position: fixed` overlay sized with 100vw/100vh
  // inside the layout tree was expanding scrollHeight by a full viewport.
  return createPortal(
    <div ref={wrapRef} className="leaves-overlay" aria-hidden="true">
      <video
        ref={videoRef}
        src="https://leaves.anthonylim-ucsc.workers.dev/"
        loop
        muted
        playsInline
        preload="auto"
        className="leaves-overlay-media"
      />
    </div>,
    document.body,
  )
}, (prev, next) => prev.reducedMotion === next.reducedMotion)

export function BreathworkLayout() {
  const location = useLocation()
  useTheme() // Applies dark class to <html>
  useFavicon()
  useDocumentMetadata({
    title: BREATHFLOW_ROUTE_METADATA.title,
    description: BREATHFLOW_ROUTE_METADATA.description,
  })
  const reducedMotion = useReducedMotion()
  const isSessionRoute = location.pathname.startsWith('/breathwork/session')
  const glassRootRef = useRef<HTMLDivElement>(null)

  // Nav capsule is ~3.75rem tall, sits `bottom-4` (1rem) above the home
  // indicator, plus a 0.5rem gap so the last row isn't tucked under it.
  const contentStyle = {
    '--mobile-content-bottom-space': isSessionRoute
      ? '0px'
      : 'calc(5.25rem + env(safe-area-inset-bottom, 0px))',
  } as CSSProperties

  return (
    <div className="breathwork-layout">
      {CLERK_ENABLED && (
        <Suspense fallback={null}>
          <CloudSync />
        </Suspense>
      )}

      <LeavesVideo reducedMotion={reducedMotion} />

      <div ref={glassRootRef}>
        <div
          className="breathwork relative z-0 bg-transparent col-fade-in"
          style={contentStyle}
        >
          <Header />
          <main
            className={
              isSessionRoute
                ? 'w-full'
                : 'w-full pb-[var(--mobile-content-bottom-space)] md:pb-24'
            }
          >
            <div
              className={`w-full mx-auto px-5 sm:px-8 lg:px-12 bg-transparent ${
                isSessionRoute
                  ? 'max-w-5xl py-4 pb-0 md:py-10 md:pb-10'
                  : 'max-w-3xl pt-6 sm:pt-10'
              }`}
            >
              <AnimatedOutlet />
            </div>
          </main>
        </div>
        <Navigation rootRef={glassRootRef} />
      </div>
    </div>
  )
}
