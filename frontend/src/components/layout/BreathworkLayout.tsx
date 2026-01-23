import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Navigation } from './Navigation'
import { useTheme } from '@/hooks/useTheme'

export function BreathworkLayout() {
  // Initialize theme system
  useTheme()

  return (
    <div className="breathwork-layout">
      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-950 transition-colors duration-500" />
      <div className="fixed inset-0 animated-gradient pointer-events-none" />

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
