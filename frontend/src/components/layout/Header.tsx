import { lazy, Suspense } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Wind, BarChart3, Home, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CLERK_ENABLED } from '@/lib/clerk'
import { preloadBreathworkRoute } from '@/lib/breathworkRoutePreload'

const HeaderAuthControls = lazy(() =>
  import('./HeaderAuthControls').then((module) => ({ default: module.HeaderAuthControls })),
)

export function Header() {
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
    <header className="sticky top-0 z-50 w-full safe-top" style={{ backgroundColor: 'var(--bw-nav-bg)' }}>
      {/* Hairline edge — system depth strategy is borders-only, no glass. */}
      <div
        className="absolute left-0 right-0 bottom-0 pointer-events-none"
        aria-hidden="true"
        style={{ borderBottom: '1px solid var(--bw-nav-border)' }}
      />
      <div className="relative">
        <div className="container flex h-16 items-center justify-between px-6">
          <div className="flex items-center">
            {/* Logo */}
            <Link
              to="/breathwork"
              onPointerEnter={() => preloadBreathworkRoute('/breathwork')}
              onFocus={() => preloadBreathworkRoute('/breathwork')}
              className="mr-8 flex min-h-11 items-center gap-2.5 group"
            >
              <span className="font-display text-xl font-semibold text-bw leading-none">
                BreathFlow
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  aria-current={isActive(path) ? 'page' : undefined}
                  onPointerEnter={() => preloadBreathworkRoute(path)}
                  onFocus={() => preloadBreathworkRoute(path)}
                  className={cn(
                    'flex min-h-11 items-center gap-2 px-4 py-2 text-[10px] font-mono font-medium tracking-[0.07em] uppercase transition-colors duration-300',
                    isActive(path)
                      ? 'text-bw'
                      : 'text-bw-secondary hover:text-bw'
                  )}
                >
                  <Icon className={cn('h-4 w-4', isActive(path) && 'text-bw-accent')} />
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Auth controls */}
          {CLERK_ENABLED && (
            <Suspense fallback={null}>
              <HeaderAuthControls />
            </Suspense>
          )}
        </div>
      </div>
    </header>
  )
}
