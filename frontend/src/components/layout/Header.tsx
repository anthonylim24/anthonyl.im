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
    <header
      // iOS Safari real-device polish:
      // - `transform: translateZ(0)` + `will-change: transform` promote the
      //   header to its own compositor layer. Without this, sticky headers
      //   jitter on iOS during URL-bar collapse because the header gets
      //   repainted on every scroll frame.
      // - Direct `border-bottom` (instead of an absolutely-positioned
      //   hairline child) means one element to composite, not two.
      // - `contain: layout paint` further isolates the header's paint work
      //   from the rest of the document.
      className="sticky top-0 z-50 w-full safe-top"
      style={{
        backgroundColor: 'var(--bw-nav-bg)',
        borderBottom: '1px solid var(--bw-nav-border)',
        transform: 'translateZ(0)',
        willChange: 'transform',
        contain: 'layout paint',
      }}
    >
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
