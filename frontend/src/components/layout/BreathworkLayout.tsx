import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Navigation } from './Navigation'
import { useTheme } from '@/hooks/useTheme'

export function BreathworkLayout() {
  // Initialize theme system
  useTheme()

  return (
    <div className="breathwork-layout">
      {/* Warm gradient background */}
      <div className="fixed inset-0 breath-bg transition-colors duration-700" />

      {/* Animated gradient overlay – indigo */}
      <div className="fixed inset-0 animate-breath-gradient opacity-30 pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, rgba(110,123,242,0.06) 0%, rgba(75,85,184,0.06) 25%, rgba(139,150,255,0.06) 50%, rgba(110,123,242,0.06) 75%, rgba(75,85,184,0.06) 100%)',
          backgroundSize: '400% 400%'
        }}
      />

      {/* Decorative floating orbs – indigo family */}
      <div className="fixed breath-orb breath-orb-indigo w-[300px] h-[300px] -top-20 -left-20 animate-orb-slow" />
      <div className="fixed breath-orb breath-orb-indigo-light w-[200px] h-[200px] bottom-20 right-1/4 animate-orb-delayed" />

      {/* Main container */}
      <div className="breathwork relative z-10 min-h-screen min-h-[100svh]">
        <Header />
        <main>
          <div className="w-full max-w-5xl mx-auto px-5 sm:px-8 lg:px-12 py-6 sm:py-10 pb-24 md:pb-10">
            <Outlet />
          </div>
        </main>
        <Navigation />
      </div>
    </div>
  )
}
