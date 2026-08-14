import { lazy, Suspense } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Wind, BarChart3, Home, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CLERK_ENABLED } from '@/lib/clerk'
import { preloadBreathworkRoute } from '@/lib/breathworkRoutePreload'
import { useHaptics } from '@/hooks/useHaptics'
import { BreathFlowMark } from '@/components/ui/BreathFlowMark'

const HeaderAuthControls = lazy(() =>
  import('./HeaderAuthControls').then((module) => ({ default: module.HeaderAuthControls })),
)

const navItems = [
  { path: '/breathwork', label: 'Home', icon: Home },
  { path: '/breathwork/session', label: 'Breathe', icon: Wind },
  { path: '/breathwork/progress', label: 'Progress', icon: BarChart3 },
  { path: '/breathwork/settings', label: 'Settings', icon: Settings },
] as const

export function Header() {
  const location = useLocation()
  const { trigger: haptic } = useHaptics()

  const isActive = (path: string) => {
    if (path === '/breathwork') {
      return location.pathname === '/breathwork'
    }
    return location.pathname.startsWith(path)
  }

  return (
    <header
      className="sticky top-0 z-50 w-full safe-top"
      style={{
        backgroundColor: 'var(--bw-nav-bg)',
        borderBottom: '1px solid var(--bw-nav-border)',
      }}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
        <Link
          to="/breathwork"
          onPointerEnter={() => preloadBreathworkRoute('/breathwork')}
          onFocus={() => preloadBreathworkRoute('/breathwork')}
          className="col-start-1 row-start-1 flex h-12 min-h-11 items-center gap-2.5 px-5 md:h-16 md:px-6"
        >
          <BreathFlowMark size={28} className="h-7 w-7" />
          <span className="font-display text-xl font-semibold leading-none text-bw">
            BreathFlow
          </span>
        </Link>

        <div className="col-start-2 row-start-1 flex h-12 items-center justify-end pr-3 md:col-start-3 md:h-16 md:pr-6">
          {CLERK_ENABLED ? (
            <Suspense fallback={null}>
              <HeaderAuthControls />
            </Suspense>
          ) : null}
        </div>

        <nav
          aria-label="Primary"
          className="col-span-2 row-start-2 grid grid-cols-4 border-t md:col-span-1 md:col-start-2 md:row-start-1 md:flex md:h-16 md:items-center md:gap-1 md:border-t-0 md:px-2"
          style={{ borderColor: 'var(--bw-nav-border)' }}
        >
          {navItems.map(({ path, label, icon: Icon }) => {
            const active = isActive(path)
            return (
              <Link
                key={path}
                to={path}
                aria-current={active ? 'page' : undefined}
                onPointerEnter={() => preloadBreathworkRoute(path)}
                onFocus={() => preloadBreathworkRoute(path)}
                onClick={() => {
                  if (!active) haptic('selection')
                }}
                className={cn(
                  'flex min-h-11 items-center justify-center px-1 text-[10px] font-mono font-medium uppercase tracking-[0.08em] break-words transition-colors duration-200',
                  'md:justify-start md:gap-2 md:px-4 md:py-2',
                  active
                    ? 'text-bw shadow-[inset_0_-1.5px_0_0_var(--bw-accent)] md:shadow-none'
                    : 'text-bw-secondary hover:text-bw',
                )}
              >
                <Icon
                  className={cn(
                    'hidden h-4 w-4 md:block',
                    active && 'text-bw-accent',
                  )}
                  aria-hidden="true"
                />
                <span>{label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
