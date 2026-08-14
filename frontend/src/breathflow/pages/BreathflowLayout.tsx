import { lazy, Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { BarChart3, Home, Settings, Wind } from 'lucide-react'
import { CLERK_ENABLED } from '@/lib/clerk'
import { useDocumentMetadata } from '@/hooks/useDocumentMetadata'
import { useFavicon } from '@/hooks/useFavicon'
import { BREATHFLOW_ROUTE_METADATA } from '@/lib/routeMetadata'
import { useBreathflowTheme } from '../platform/useBreathflowTheme'

const CloudSync = lazy(() =>
  import('@/components/layout/CloudSync').then((module) => ({ default: module.CloudSync })),
)

const NAV_ITEMS = [
  { to: '/breathwork', label: 'Home', icon: Home, end: true },
  { to: '/breathwork/session', label: 'Breathe', icon: Wind, end: false },
  { to: '/breathwork/progress', label: 'Progress', icon: BarChart3, end: false },
  { to: '/breathwork/settings', label: 'Settings', icon: Settings, end: false },
] as const

function navLinkClass(isActive: boolean): string {
  return [
    'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors duration-200',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bw-accent',
    isActive ? 'font-semibold text-bw-accent' : 'text-bw-secondary hover:text-bw hover:bg-bw-hover',
  ].join(' ')
}

function mobileNavLinkClass(isActive: boolean): string {
  return [
    'flex min-h-12 min-w-16 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5',
    'text-[11px] font-medium transition-colors duration-200',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bw-accent',
    isActive ? 'text-bw-accent' : 'text-bw-secondary',
  ].join(' ')
}

export function BreathflowLayout() {
  useBreathflowTheme()
  useFavicon()
  useDocumentMetadata({
    title: BREATHFLOW_ROUTE_METADATA.title,
    description: BREATHFLOW_ROUTE_METADATA.description,
  })

  return (
    <div className="breathwork min-h-[100svh] bg-bw-canvas font-sans text-bw antialiased">
      {CLERK_ENABLED && (
        <Suspense fallback={null}>
          <CloudSync />
        </Suspense>
      )}

      <header className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-5 sm:px-8">
        <NavLink
          to="/breathwork"
          end
          className="rounded-lg text-[15px] font-semibold tracking-tight text-bw focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bw-accent"
        >
          BreathFlow
        </NavLink>
        <nav aria-label="Primary" className="hidden items-center gap-1 sm:flex">
          {NAV_ITEMS.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => navLinkClass(isActive)}>
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 pb-28 pt-2 sm:px-8 sm:pb-16 sm:pt-4">
        <Outlet />
      </main>

      {/* Mobile bottom navigation (44px+ targets, safe-area aware). */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-bw-border bg-bw-canvas pb-[env(safe-area-inset-bottom)] sm:hidden"
        style={{ backgroundColor: 'var(--bw-nav-bg-mobile)' }}
      >
        <div className="mx-auto flex max-w-md items-center justify-around px-2 py-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => mobileNavLinkClass(isActive)}>
              <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
