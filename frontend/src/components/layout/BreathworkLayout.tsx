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

      {/* Animated gradient overlay */}
      <div className="fixed inset-0 animate-breath-gradient opacity-30 pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, rgba(96,165,250,0.08) 0%, rgba(139,92,246,0.08) 25%, rgba(167,139,250,0.08) 50%, rgba(59,130,246,0.08) 75%, rgba(99,102,241,0.08) 100%)',
          backgroundSize: '400% 400%'
        }}
      />

      {/* Decorative floating orbs - subtle background accents */}
      <div className="fixed breath-orb breath-orb-blue w-[300px] h-[300px] -top-20 -left-20 animate-orb-slow" />
      <div className="fixed breath-orb breath-orb-magenta w-[200px] h-[200px] bottom-20 right-1/4 animate-orb-delayed" />

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
