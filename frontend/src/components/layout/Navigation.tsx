/**
 * Navigation.tsx
 * Premium iOS-style bottom tab bar with sculpted depth and active indicators.
 */
import { Link, useLocation } from 'react-router-dom'
import { Wind, BarChart3, Home, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ACCENT, ACCENT_BRIGHT } from '@/lib/palette'
import { useViewportOffset } from '@/hooks/useViewportOffset'

const navItems = [
  { path: '/breathwork', label: 'Home', icon: Home },
  { path: '/breathwork/session', label: 'Breathe', icon: Wind },
  { path: '/breathwork/progress', label: 'Progress', icon: BarChart3 },
  { path: '/breathwork/settings', label: 'Settings', icon: Settings },
]

export function Navigation() {
  const location = useLocation()
  const { bottomOffset } = useViewportOffset()

  const activeIndex = navItems.findIndex(({ path }) =>
    path === '/breathwork'
      ? location.pathname === '/breathwork'
      : location.pathname.startsWith(path)
  )

  const shouldHideInSession = location.pathname.startsWith('/breathwork/session')

  if (shouldHideInSession) {
    return null
  }

  return (
    <nav
      className="md:hidden fixed left-0 right-0 z-50 px-4 pt-2 safe-bottom transition-[bottom] duration-200"
      style={{ bottom: `${bottomOffset}px` }}
    >
      <div
        className="rounded-[20px] mx-auto max-w-md overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, rgba(14, 18, 38, 0.85) 0%, rgba(10, 14, 32, 0.78) 100%)',
          backdropFilter: 'blur(32px) saturate(200%)',
          WebkitBackdropFilter: 'blur(32px) saturate(200%)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 -4px 32px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.3)',
          transform: 'translateZ(0)',
        }}
      >
        <div className="relative flex items-center justify-around h-[64px] px-2">
          {/* Sliding active indicator — GPU-composited, no layout recalc */}
          {activeIndex >= 0 && (
            <div
              className="absolute top-1/2 rounded-2xl pointer-events-none"
              style={{
                width: `${100 / navItems.length}%`,
                height: 40,
                marginTop: -20,
                left: 0,
                transform: `translateX(${activeIndex * 100}%) translateZ(0)`,
                transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                willChange: 'transform',
              }}
            >
              <div
                className="mx-auto h-full rounded-2xl"
                style={{
                  width: 44,
                  background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_BRIGHT})`,
                  boxShadow: `0 4px 16px -2px ${ACCENT}50`,
                }}
              />
            </div>
          )}
          {navItems.map(({ path, label, icon: Icon }, i) => {
            const active = i === activeIndex
            return (
              <Link
                key={path}
                to={path}
                className={cn(
                  'flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl text-[10px] font-semibold transition-colors duration-300 relative',
                  active
                    ? 'text-white'
                    : 'text-white/30 hover:text-white/55 active:scale-95'
                )}
              >
                <div className="relative p-2.5 rounded-2xl">
                  <Icon className={cn(
                    "relative h-[18px] w-[18px] transition-colors duration-300",
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
