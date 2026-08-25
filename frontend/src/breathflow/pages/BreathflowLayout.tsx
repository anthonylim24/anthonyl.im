import { lazy, Suspense } from 'react'
import { LayoutGroup, motion } from 'motion/react'
import { NavLink, useLocation, useOutlet } from 'react-router-dom'
import { CLERK_ENABLED } from '@/lib/clerk'
import { useDocumentMetadata } from '@/hooks/useDocumentMetadata'
import { useFavicon } from '@/hooks/useFavicon'
import { BREATHFLOW_ROUTE_METADATA } from '@/lib/routeMetadata'
import { sx } from '@/styles/merge'
import { BreathFlowMark } from '../components/BreathFlowMark'
import { BreathStarfield } from '../components/BreathStarfield'
import { BreathStardust } from '../components/BreathStardust'
import { SelectionInk } from '../motion/SelectionInk'
import { chromeTransition, inkSpring } from '../motion/tokens'
import { useBreathflowTheme } from '../platform/useBreathflowTheme'
import { useReducedMotion } from '../platform/useReducedMotion'
import { bf } from '../styles/breathflow.stylex'

const CloudSync = lazy(() =>
  import('@/components/layout/CloudSync').then((module) => ({ default: module.CloudSync })),
)

const NAV_ITEMS = [
  { to: '/breathwork', label: 'Home', end: true },
  { to: '/breathwork/session', label: 'Breathe', end: false },
  { to: '/breathwork/progress', label: 'Progress', end: false },
  { to: '/breathwork/settings', label: 'Settings', end: false },
] as const

function desktopNavSx(isActive: boolean) {
  return sx(
    bf.navLinkDesktop,
    isActive ? bf.navLinkDesktopActive : bf.navLinkDesktopInactive,
  )
}

function mobileNavSx(isActive: boolean) {
  return sx(
    bf.navLinkMobile,
    isActive ? bf.navLinkMobileActive : bf.navLinkMobileInactive,
  )
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
    <div {...sx('breathwork', bf.relative, bf.minH100svh, bf.bgCanvas, bf.fontSans, bf.textBw, bf.antialiased)}>
      <div {...sx('bf-grain')} aria-hidden="true" />
      <BreathStardust />
      {isSessionRoute ? null : <BreathStarfield />}

      {CLERK_ENABLED && (
        <Suspense fallback={null}>
          <CloudSync />
        </Suspense>
      )}

      <a href="#bf-main" {...sx(bf.skipLink)}>
        Skip to content
      </a>

      <header {...sx(bf.headerBar, bf.smPx8)}>
        <NavLink
          to="/breathwork"
          end
          {...sx('bf-display', bf.brandLink)}
        >
          <BreathFlowMark size={22} style={bf.markNav} />
          BreathFlow
        </NavLink>
        <LayoutGroup id="bf-nav-desktop">
          <nav aria-label="Primary" {...sx(bf.desktopNav)}>
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => desktopNavSx(isActive).className ?? ''}
              >
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

      <main
        id="bf-main"
        {...sx(bf.mainContent, bf.smPx8, bf.smPb16, bf.smPt4)}
      >
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
        {...sx(bf.mobileNavBar, bf.smHidden)}
        style={{ backgroundColor: 'var(--bw-nav-bg-mobile)' }}
      >
        <LayoutGroup id="bf-nav-mobile">
          <div {...sx(bf.mobileNavInner)}>
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => mobileNavSx(isActive).className ?? ''}
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      reducedMotion ? (
                        <span aria-hidden="true" {...sx(bf.navInkMobile)} />
                      ) : (
                        <motion.span
                          aria-hidden="true"
                          layoutId="bf-nav-mobile-ink"
                          {...sx(bf.navInkMobile)}
                          transition={inkSpring}
                        />
                      )
                    ) : null}
                    <span {...sx(bf.relative)}>{label}</span>
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
