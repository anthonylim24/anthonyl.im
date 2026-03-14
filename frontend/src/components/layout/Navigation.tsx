/**
 * Navigation.tsx
 * Premium iOS-style bottom tab bar with sculpted depth and active indicators.
 */
import { Link, useLocation } from 'react-router-dom'
import { Wind, BarChart3, Home, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ACCENT, ACCENT_BRIGHT } from '@/lib/palette'
import { useViewportOffset } from '@/hooks/useViewportOffset'
import { useHaptics } from '@/hooks/useHaptics'

const navItems = [
  { path: '/breathwork', label: 'Home', icon: Home },
  { path: '/breathwork/session', label: 'Breathe', icon: Wind },
  { path: '/breathwork/progress', label: 'Progress', icon: BarChart3 },
  { path: '/breathwork/settings', label: 'Settings', icon: Settings },
]

export function Navigation() {
  const location = useLocation()
  const { bottomOffset } = useViewportOffset()
  const { trigger: haptic } = useHaptics()

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
        className="rounded-2xl mx-auto max-w-md overflow-hidden"
        style={{
          background: 'rgba(8, 12, 28, 0.9)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          transform: 'translateZ(0)',
        }}
      >
        <div className="relative grid grid-cols-4 h-[64px]">
          {/* Sliding active indicator — GPU-composited, no layout recalc */}
          {/* Sliding active indicator — GPU-composited, no layout recalc.
              Positioned to align with the icon area (p-2.5 = 10px around 18px icon = 38px).
              Cell is 64px tall; icon area starts ~9px from top → center at ~28px.
              Pill is 38px tall → top = 28 - 19 = 9px. */}
          {activeIndex >= 0 && (
            <div
              className="absolute pointer-events-none flex justify-center"
              style={{
                width: `${100 / navItems.length}%`,
                top: 9,
                height: 38,
                left: 0,
                transform: `translateX(${activeIndex * 100}%) translateZ(0)`,
                transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                willChange: 'transform',
              }}
            >
              <div
                className="h-full rounded-2xl"
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
                onClick={() => { if (i !== activeIndex) haptic('selection') }}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-semibold transition-colors duration-300 relative min-h-[44px] min-w-[44px]',
                  active
                    ? 'text-white'
                    : 'text-white/30 hover:text-white/55 active:scale-95'
                )}
              >
                <div className="relative p-3 rounded-2xl">
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
