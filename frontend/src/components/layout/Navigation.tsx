/**
 * Navigation.tsx
 * Minimal bottom tab bar — parchment + ink aesthetic.
 */
import { Link, useLocation } from 'react-router-dom'
import { Wind, BarChart3, Home, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
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
      className="md:hidden fixed left-0 right-0 z-50 safe-bottom transition-[bottom] duration-200"
      style={{ bottom: `${bottomOffset}px` }}
    >
      <div
        className="mx-auto max-w-md"
        style={{
          background: 'var(--bw-nav-bg-mobile)',
          borderTop: '1px solid var(--bw-nav-border)',
        }}
      >
        <div className="grid grid-cols-4 h-[64px]">
          {navItems.map(({ path, label, icon: Icon }, i) => {
            const active = i === activeIndex
            return (
              <Link
                key={path}
                to={path}
                onClick={() => { if (i !== activeIndex) haptic('selection') }}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors duration-300 relative min-h-[44px] min-w-[44px]',
                  active
                    ? 'text-bw font-semibold'
                    : 'text-bw-tertiary hover:text-bw-secondary active:scale-95'
                )}
              >
                <div className="relative p-3">
                  <Icon className={cn(
                    "relative h-[18px] w-[18px] transition-colors duration-300",
                    active ? "text-bw" : "text-bw-tertiary"
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
