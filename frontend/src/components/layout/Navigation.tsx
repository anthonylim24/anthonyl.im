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
      className="md:hidden fixed left-0 right-0 z-50 bg-transparent transition-[bottom] duration-200"
      style={{ bottom: `${bottomOffset}px` }}
    >
      {/* Visual layer — absolute child that stops ABOVE the bottom safe area
          so Safari 26 sees transparent in the home indicator zone → liquid glass */}
      <div
        className="absolute left-0 right-0 top-0"
        aria-hidden="true"
        style={{
          bottom: 'env(safe-area-inset-bottom, 0px)',
          backgroundColor: 'var(--bw-nav-bg-mobile)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--bw-nav-border)',
        }}
      />
      <div className="relative mx-auto max-w-md">
        <div className="grid grid-cols-4 h-[64px]">
          {navItems.map(({ path, label, icon: Icon }, i) => {
            const active = i === activeIndex
            return (
              <Link
                key={path}
                to={path}
                onClick={() => { if (i !== activeIndex) haptic('selection') }}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 text-[10px] font-mono font-medium tracking-[0.07em] uppercase transition-colors duration-300 relative min-h-[24px] min-w-[44px]',
                  active
                    ? 'text-bw'
                    : 'text-bw-secondary hover:text-bw active:scale-95'
                )}
              >
                <div className="relative">
                  <Icon className={cn(
                    "relative h-[24px] w-[24px] transition-colors duration-300",
                    active ? "text-bw" : "text-bw-secondary"
                  )} />
                </div>
                <span>{label}</span>
              </Link>
            )
          })}
        </div>
        {/* Bottom safe area spacer for iOS notch */}
        <div className="pb-safe" />
      </div>
    </nav>
  )
}
