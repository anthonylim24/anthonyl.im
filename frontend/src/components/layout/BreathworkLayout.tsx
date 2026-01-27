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
      <div className="fixed inset-0 animate-breath-gradient opacity-50 pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, rgba(255,113,112,0.08) 0%, rgba(255,94,181,0.08) 25%, rgba(167,139,250,0.08) 50%, rgba(96,165,250,0.08) 75%, rgba(45,212,191,0.08) 100%)',
          backgroundSize: '400% 400%'
        }}
      />

      {/* Decorative floating orbs - fixed position with z-index 0 to stay behind content */}
      <div className="fixed breath-orb breath-orb-coral w-[400px] h-[400px] -top-20 -left-20 animate-orb" />
      <div className="fixed breath-orb breath-orb-magenta w-[300px] h-[300px] top-1/3 -right-10 animate-orb-delayed" />
      <div className="fixed breath-orb breath-orb-blue w-[350px] h-[350px] bottom-20 left-1/4 animate-orb-slow" />
      <div className="fixed breath-orb breath-orb-amber w-[250px] h-[250px] bottom-1/3 right-1/4 animate-orb" />

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
