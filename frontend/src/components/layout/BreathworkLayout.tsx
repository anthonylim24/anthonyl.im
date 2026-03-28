import { useRef, useEffect, memo } from 'react'
import { AnimatedOutlet } from './AnimatedOutlet'
import type { CSSProperties } from 'react'
import { Header } from './Header'
import { Navigation } from './Navigation'
import { useTheme } from '@/hooks/useTheme'
import { useViewportOffset } from '@/hooks/useViewportOffset'
import { useFavicon } from '@/hooks/useFavicon'
import { useCloudSync } from '@/hooks/useCloudSync'
import { useSettingsStore } from '@/stores/settingsStore'
import { CLERK_ENABLED } from '@/lib/clerk'

function CloudSync() {
  useCloudSync()
  return null
}

/**
 * Fully isolated video component — subscribes to the theme store directly
 * and manages play/pause imperatively via refs. Wrapped in memo with a
 * constant comparator so React never re-renders or reconciles the <video>
 * DOM node after initial mount. This prevents browsers (especially Safari)
 * from restarting the video during parent re-renders.
 */
const LeavesVideo = memo(function LeavesVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    // Subscribe to theme changes outside of React's render cycle
    const unsubscribe = useSettingsStore.subscribe((state) => {
      const video = videoRef.current
      if (!video) return
      const isDark = state.theme === 'dark'
      video.style.opacity = isDark ? '0' : '1'
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
      video.style.opacity = isDark ? '0' : '1'
      if (!isDark) {
        video.play().catch(() => {})
      }
    }

    return unsubscribe
  }, [])

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
    />
  )
}, () => true) // Never re-render — everything is ref/subscription-based

export function BreathworkLayout() {
  useTheme() // Applies dark class to <html>
  useFavicon()
  const { bottomOffset } = useViewportOffset()

  const contentStyle = {
    '--mobile-content-bottom-space': `calc(7.5rem + env(safe-area-inset-bottom, 0px) + ${bottomOffset}px)`,
  } as CSSProperties

  return (
    <div className="breathwork-layout">
      {CLERK_ENABLED && <CloudSync />}

      {/* Leaves video overlay — fully isolated from React re-renders */}
      <LeavesVideo />

      {/* Content */}
      <div className="breathwork relative z-10 min-h-screen min-h-[100svh] col-fade-in">
        <Header />
        <main>
          <div
            className="w-full max-w-3xl mx-auto px-5 sm:px-8 lg:px-12 py-6 sm:py-10 pb-[var(--mobile-content-bottom-space)] md:pb-10"
            style={contentStyle}
          >
            <AnimatedOutlet />
          </div>
        </main>
        <Navigation />
      </div>
    </div>
  )
}
