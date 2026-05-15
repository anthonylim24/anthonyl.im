import { useRef, useEffect, lazy, memo, Suspense } from 'react'
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

// Parallax tuning — the video drifts upward at a fraction of the scroll
// distance, giving the leaves a sense of depth. FACTOR stays well below 0.2
// to keep the motion ambient rather than theatrical. BUFFER_PX is added on
// top of the computed height so subpixel rounding and bounce-scroll never
// expose the viewport edge.
const PARALLAX_FACTOR = 0.08
const PARALLAX_BUFFER_PX = 24

/**
 * Fully isolated video component — subscribes to the theme store directly
 * and manages play/pause imperatively via refs. Wrapped in memo with a
 * comparator that only allows reduced-motion changes through. This prevents
 * browsers from restarting the video during ordinary parent re-renders.
 */
const LeavesVideo = memo(function LeavesVideo({ reducedMotion }: { reducedMotion: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (reducedMotion) return

    // Subscribe to theme changes outside of React's render cycle
    const unsubscribe = useSettingsStore.subscribe((state) => {
      const video = videoRef.current
      if (!video) return
      const isDark = state.theme === 'dark'
      video.style.opacity = isDark ? '0' : LEAVES_VISIBLE_OPACITY
      if (isDark) {
        video.pause()
      } else {
        video.play().catch(() => {})
      }
    })

    // Initial play based on current theme
    const video = videoRef.current
    if (video) {
      const isDark = useSettingsStore.getState().theme === 'dark'
      video.style.opacity = isDark ? '0' : LEAVES_VISIBLE_OPACITY
      if (!isDark) {
        video.play().catch(() => {})
      }
    }

    return unsubscribe
  }, [reducedMotion])

  // Slight parallax — translate the fixed video against scroll position to
  // suggest depth. The video element is grown vertically by exactly enough
  // to absorb the maximum upward translation, so the viewport edge is never
  // exposed regardless of page length. Both height and transform are mutated
  // imperatively so React never re-renders on scroll/resize, and this stays
  // compatible with the memoization above.
  useEffect(() => {
    if (reducedMotion) return
    const video = videoRef.current
    if (!video) return

    let rafId: number | null = null

    const updateHeight = () => {
      const viewportHeight = window.innerHeight
      const documentHeight = document.documentElement.scrollHeight
      const maxScroll = Math.max(0, documentHeight - viewportHeight)
      const required = viewportHeight + maxScroll * PARALLAX_FACTOR + PARALLAX_BUFFER_PX
      video.style.height = `${Math.ceil(required)}px`
    }

    const applyTransform = () => {
      rafId = null
      // Clamp to >= 0 so iOS rubber-band scrolling (scrollY < 0) doesn't push
      // the video downward and reveal the top edge.
      const offset = Math.max(0, window.scrollY) * PARALLAX_FACTOR
      video.style.transform = `translate3d(0, ${-offset}px, 0)`
    }

    const onScroll = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(applyTransform)
    }

    const onResize = () => {
      updateHeight()
      applyTransform()
    }

    updateHeight()
    applyTransform()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)

    // Document height also changes when content loads/route changes/lazy
    // images settle — observe it so the video stays tall enough.
    const resizeObserver = new ResizeObserver(updateHeight)
    resizeObserver.observe(document.documentElement)

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      resizeObserver.disconnect()
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [reducedMotion])

  if (reducedMotion) return null

  return (
    <video
      ref={videoRef}
      src="https://leaves.anthonylim-ucsc.workers.dev/"
      loop
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      className="leaves-overlay"
      style={{
        mixBlendMode: 'multiply',
        // Anchor top, release bottom so the JS-controlled height isn't
        // over-constrained against the CSS class's `inset: 0`.
        top: 0,
        bottom: 'auto',
        willChange: 'transform',
      }}
    />
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

  // Static bottom space — nav height (4rem) + breathing room (3.5rem) +
  // safe-area-inset-bottom for the home indicator. The previous formula
  // added a dynamic `visualViewport`-derived offset, which on real iOS
  // either left the nav hidden behind the URL bar or, on iOS 13+ (where
  // position:fixed is anchored to the visual viewport), pushed it
  // off-screen. The static value pairs cleanly with the Navigation's
  // standard `bottom: 0 + padding-bottom: env(safe-area-inset-bottom)`.
  const contentStyle = {
    '--mobile-content-bottom-space': isSessionRoute
      ? '0px'
      : 'calc(7.5rem + env(safe-area-inset-bottom, 0px))',
  } as CSSProperties

  return (
    <div className="breathwork-layout">
      {CLERK_ENABLED && (
        <Suspense fallback={null}>
          <CloudSync />
        </Suspense>
      )}

      {/*
       * Leaves video lives OUTSIDE the glass root. The asset is served
       * from a cross-origin Cloudflare worker without CORS headers, so
       * drawing it into a canvas (which `@ybouane/liquidglass` does
       * when sampling its root's children) would taint that canvas and
       * disable the glass effect for the whole root. Keeping it as a
       * sibling of the glass root preserves the ambient backdrop without
       * poisoning the texture upload path.
       */}
      <LeavesVideo reducedMotion={reducedMotion} />

      {/*
       * Glass root: the Navigation pills are direct child glass elements
       * of this wrapper, and `.breathwork` is a sibling. The library
       * rasterizes `.breathwork` via html-to-image once, then re-positions
       * the cached raster per frame via getBoundingClientRect — so
       * scrolling shifts the page raster naturally and the nav refracts
       * whatever's behind it without any per-frame DOM capture.
       *
       * Plain div, no transform/filter/contain — anything that creates a
       * containing block here would re-break the nav's `position: fixed`.
       */}
      <div ref={glassRootRef}>
        {/* Content */}
        <div className="breathwork relative z-0 min-h-screen min-h-[100svh] col-fade-in bg-transparent">
          <Header />
          <main>
            <div
              className="w-full max-w-3xl mx-auto px-5 sm:px-8 lg:px-12 py-6 sm:py-10 pb-[var(--mobile-content-bottom-space)] md:pb-10 bg-transparent"
              style={contentStyle}
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
