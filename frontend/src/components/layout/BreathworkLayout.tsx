import { Outlet } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { Header } from './Header'
import { Navigation } from './Navigation'
import { useTheme } from '@/hooks/useTheme'
import { useViewportOffset } from '@/hooks/useViewportOffset'
import { useFavicon } from '@/hooks/useFavicon'

export function BreathworkLayout() {
  useTheme()
  useFavicon()
  const { bottomOffset } = useViewportOffset()
  const contentStyle = {
    '--mobile-content-bottom-space': `calc(7.5rem + env(safe-area-inset-bottom, 0px) + ${bottomOffset}px)`,
  } as CSSProperties

  return (
    <div className="breathwork-layout noise-overlay">
      {/* Deep background with subtle radial vignettes */}
      <div className="fixed inset-0 breath-bg" style={{ transform: 'translateZ(0)' }} />

      {/* Slow-moving gradient wash */}
      <div
        className="fixed inset-0 animate-breath-gradient opacity-20 pointer-events-none"
        style={{
          background:
            'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(79,70,229,0.05) 25%, rgba(129,140,248,0.05) 50%, rgba(99,102,241,0.06) 75%, rgba(79,70,229,0.05) 100%)',
          backgroundSize: '400% 400%',
        }}
      />

      {/* Ambient orbs */}
      <div className="fixed breath-orb breath-orb-indigo w-[300px] h-[300px] -top-20 -left-20 animate-orb-slow" />
      <div className="fixed breath-orb breath-orb-indigo-light w-[200px] h-[200px] bottom-20 right-1/4 animate-orb-delayed" />

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
