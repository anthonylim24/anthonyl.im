import { useRef, useEffect } from 'react'
import { AnimatedOutlet } from './AnimatedOutlet'
import type { CSSProperties } from 'react'
import { Header } from './Header'
import { Navigation } from './Navigation'
import { useTheme } from '@/hooks/useTheme'
import { useViewportOffset } from '@/hooks/useViewportOffset'
import { useFavicon } from '@/hooks/useFavicon'
import { useCloudSync } from '@/hooks/useCloudSync'
import { CLERK_ENABLED } from '@/lib/clerk'

function CloudSync() {
  useCloudSync()
  return null
}

export function BreathworkLayout() {
  const { theme } = useTheme()
  useFavicon()
  const { bottomOffset } = useViewportOffset()
  const leavesVideoRef = useRef<HTMLVideoElement>(null)

  // Resolve effective theme (light or dark)
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  // Play/pause leaves video based on theme
  useEffect(() => {
    const video = leavesVideoRef.current
    if (!video) return

    if (!isDark) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [isDark])

  const contentStyle = {
    '--mobile-content-bottom-space': `calc(7.5rem + env(safe-area-inset-bottom, 0px) + ${bottomOffset}px)`,
  } as CSSProperties

  return (
    <div className="breathwork-layout">
      {CLERK_ENABLED && <CloudSync />}
      {/* Clean canvas */}
      <div className="fixed inset-0 breath-bg" style={{ transform: 'translateZ(0)' }} />

      {/* Leaves video overlay — visible in light mode only */}
      <video
        ref={leavesVideoRef}
        src="https://leaves.anthonylim-ucsc.workers.dev/"
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        className="leaves-overlay"
        style={{ opacity: isDark ? 0 : 1 }}
      />

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
