import { lazy, Suspense } from 'react'
import { LayoutGroup, motion } from 'motion/react'
import { NavLink, useLocation, useOutlet } from 'react-router-dom'
import { CLERK_ENABLED } from '@/lib/clerk'
import { useDocumentMetadata } from '@/hooks/useDocumentMetadata'
import { useFavicon } from '@/hooks/useFavicon'
import { BREATHFLOW_ROUTE_METADATA } from '@/lib/routeMetadata'
import { BreathFlowMark } from '../components/BreathFlowMark'
import { BreathStarfield } from '../components/BreathStarfield'
import { BreathStardust } from '../components/BreathStardust'
import { SelectionInk } from '../motion/SelectionInk'
import { chromeTransition, inkSpring } from '../motion/tokens'
import { useBreathflowTheme } from '../platform/useBreathflowTheme'
import { useReducedMotion } from '../platform/useReducedMotion'

const CloudSync = lazy(() =>
  import('@/components/layout/CloudSync').then((module) => ({ default: module.CloudSync })),
)

const NAV_ITEMS = [
  { to: '/breathwork', label: 'Home', end: true },
  { to: '/breathwork/session', label: 'Breathe', end: false },
  { to: '/breathwork/progress', label: 'Progress', end: false },
  { to: '/breathwork/settings', label: 'Settings', end: false },
] as const

function navLinkClass(isActive: boolean): string {
  return [
    'relative inline-flex min-h-11 items-center px-2.5 text-sm',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bw-accent',
    isActive ? 'font-medium text-bw-accent' : 'text-bw-secondary hover:text-bw',
  ].join(' ')
}

function mobileNavLinkClass(isActive: boolean): string {
  return [
    'relative flex min-h-12 min-w-16 flex-col items-center justify-center px-2 py-1.5',
    'text-[12px]',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bw-accent',
    isActive ? 'font-medium text-bw-accent' : 'text-bw-secondary',
  ].join(' ')
}

export function BreathflowLayout() {
  const location = useLocation()
  const outlet = useOutlet()
  const reducedMotion = useReducedMotion()
  const isSessionRoute = location.pathname.startsWith('/breathwork/session')
  useBreathflowTheme()
  useFavicon()
  useDocumentMetadata({
    title: BREATHFLOW_ROUTE_METADATA.title,
    description: BREATHFLOW_ROUTE_METADATA.description,
  })

  return (
    <div className="breathwork relative min-h-[100svh] bg-bw-canvas font-sans text-bw antialiased">
      <div className="bf-grain" aria-hidden="true" />
      <BreathStardust />
      {isSessionRoute ? null : <BreathStarfield />}

      {CLERK_ENABLED && (
        <Suspense fallback={null}>
          <CloudSync />
        </Suspense>
      )}

      <a
        href="#bf-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-5 focus:top-3 focus:z-50 focus:bg-bw-canvas focus:px-3 focus:py-2 focus:text-sm focus:text-bw focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bw-accent"
      >
        Skip to content
      </a>

      <header className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-5 sm:px-8">
        <NavLink
          to="/breathwork"
          end
          className="bf-display inline-flex min-h-11 items-center gap-2 rounded-md text-[15px] tracking-tight text-bw focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bw-accent"
        >
          <BreathFlowMark size={22} className="h-[22px] w-[22px]" />
          BreathFlow
        </NavLink>
        <LayoutGroup id="bf-nav-desktop">
          <nav aria-label="Primary" className="hidden items-center gap-1 sm:flex">
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => navLinkClass(isActive)}>
                {({ isActive }) => (
                  <>
                    {label}
                    {isActive ? <SelectionInk layoutId="bf-nav-desktop-ink" reducedMotion={reducedMotion} /> : null}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </LayoutGroup>
      </header>

      <main id="bf-main" className="mx-auto w-full max-w-3xl px-5 pb-28 pt-2 sm:px-8 sm:pb-16 sm:pt-4">
        <motion.div
          key={location.pathname}
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={chromeTransition}
        >
          {outlet}
        </motion.div>
      </main>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-bw-border bg-bw-canvas pb-[env(safe-area-inset-bottom)] sm:hidden"
        style={{ backgroundColor: 'var(--bw-nav-bg-mobile)' }}
      >
        <LayoutGroup id="bf-nav-mobile">
          <div className="mx-auto flex max-w-md items-center justify-around px-2 py-1">
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => mobileNavLinkClass(isActive)}>
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      reducedMotion ? (
                        <span aria-hidden="true" className="absolute inset-x-2 inset-y-1 rounded-md bg-bw-accent-subtle" />
                      ) : (
                        <motion.span
                          aria-hidden="true"
                          layoutId="bf-nav-mobile-ink"
                          className="absolute inset-x-2 inset-y-1 rounded-md bg-bw-accent-subtle"
                          transition={inkSpring}
                        />
                      )
                    ) : null}
                    <span className="relative">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </LayoutGroup>
      </nav>
    </div>
  )
}
