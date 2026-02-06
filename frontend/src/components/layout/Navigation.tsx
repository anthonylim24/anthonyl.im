/**
 * Navigation.tsx
 * Premium iOS-style bottom tab bar with sculpted depth and active indicators.
 */
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Wind, BarChart3, Home, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ACCENT, ACCENT_BRIGHT } from '@/lib/palette'

export function Navigation() {
  const location = useLocation()

  const navItems = [
    { path: '/breathwork', label: 'Home', icon: Home },
    { path: '/breathwork/session', label: 'Breathe', icon: Wind },
    { path: '/breathwork/progress', label: 'Progress', icon: BarChart3 },
    { path: '/breathwork/settings', label: 'Settings', icon: Settings },
  ]

  const isActive = (path: string) => {
    if (path === '/breathwork') {
      return location.pathname === '/breathwork'
    }
    return location.pathname.startsWith(path)
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-4 pt-2 safe-bottom">
      <div
        className="rounded-[20px] mx-auto max-w-md overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, rgba(14, 18, 38, 0.85) 0%, rgba(10, 14, 32, 0.78) 100%)',
          backdropFilter: 'blur(32px) saturate(200%)',
          WebkitBackdropFilter: 'blur(32px) saturate(200%)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 -4px 32px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.3)',
        }}
      >
        <div className="flex items-center justify-around h-[64px] px-2">
          {navItems.map(({ path, label, icon: Icon }) => {
            const active = isActive(path)
            return (
              <Link
                key={path}
                to={path}
                className={cn(
                  'flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl text-[10px] font-semibold transition-all duration-300 relative',
                  active
                    ? 'text-white'
                    : 'text-white/30 hover:text-white/55 active:scale-95'
                )}
              >
                <div className="relative p-2.5 rounded-2xl">
                  <AnimatePresence>
                    {active && (
                      <motion.div
                        layoutId="nav-active"
                        className="absolute inset-0 rounded-2xl"
                        style={{
                          background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_BRIGHT})`,
                          boxShadow: `0 4px 16px -2px ${ACCENT}50`,
                        }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                  </AnimatePresence>
                  <Icon className={cn(
                    "relative h-[18px] w-[18px] transition-all duration-300",
                    active ? "text-white" : ""
                  )} />
                </div>
                <span className="tracking-wide">{label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
