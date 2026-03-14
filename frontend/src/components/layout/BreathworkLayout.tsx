import { Outlet } from 'react-router-dom'
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
  useTheme()
  useFavicon()
  const { bottomOffset } = useViewportOffset()
  const contentStyle = {
    '--mobile-content-bottom-space': `calc(7.5rem + env(safe-area-inset-bottom, 0px) + ${bottomOffset}px)`,
  } as CSSProperties

  return (
    <div className="breathwork-layout">
      {CLERK_ENABLED && <CloudSync />}
      {/* Deep background with subtle radial vignettes */}
      <div className="fixed inset-0 breath-bg" style={{ transform: 'translateZ(0)' }} />

      {/* Content */}
      <div className="breathwork relative z-10 min-h-screen min-h-[100svh]">
        <Header />
        <main>
          <div
            className="w-full max-w-5xl mx-auto px-5 sm:px-8 lg:px-12 py-6 sm:py-10 pb-[var(--mobile-content-bottom-space)] md:pb-10"
            style={contentStyle}
          >
            <Outlet />
          </div>
        </main>
        <Navigation />
      </div>
    </div>
  )
}
