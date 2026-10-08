import { lazy, Suspense } from 'react'
import { LayoutGroup, motion } from 'motion/react'
import { NavLink, useLocation, useOutlet } from 'react-router-dom'
import { CLERK_ENABLED } from '@/lib/clerk'
import { useDocumentMetadata } from '@/hooks/useDocumentMetadata'
import { useFavicon } from '@/hooks/useFavicon'
import { BREATHFLOW_ROUTE_METADATA, breathflowTitle } from '@/lib/routeMetadata'
import { sx } from '@/styles/merge'
import { WatercolorDefs } from '../components/WatercolorDefs'
import { SelectionInk } from '../motion/SelectionInk'
import { EASE_SETTLE, inkSpring } from '../motion/tokens'
import { useBreathflowTheme } from '../platform/useBreathflowTheme'
import { useReducedMotion } from '../platform/useReducedMotion'
import { bf } from '../styles/breathflow.stylex'
import { wc } from '../styles/watercolor.stylex'
import '../styles/watercolor.css'

const CloudSync = lazy(() =>
  import('@/components/layout/CloudSync').then((module) => ({ default: module.CloudSync })),
)

const NAV_ITEMS = [
  { to: '/breathwork', label: 'Home', end: true },
  { to: '/breathwork/session', label: 'Breathe', end: false },
  { to: '/breathwork/progress', label: 'Progress', end: false },
  { to: '/breathwork/settings', label: 'Settings', end: false },
] as const

export function BreathflowLayout() {
  const location = useLocation()
  const outlet = useOutlet()
  const reducedMotion = useReducedMotion()
  useBreathflowTheme()
  useFavicon()
  useDocumentMetadata({
    title: breathflowTitle(location.pathname),
    description: BREATHFLOW_ROUTE_METADATA.description,
  })

  return (
    <div {...sx('breathwork', bf.relative, bf.minH100svh, bf.bgCanvas, bf.fontSans, bf.textBw, bf.antialiased, wc.root)}>
      <WatercolorDefs />
      <div {...sx('bf-paper')} aria-hidden="true" />

      {CLERK_ENABLED && (
        <Suspense fallback={null}>
          <CloudSync />
        </Suspense>
      )}

      <a href="#bf-main" {...sx(bf.skipLink)}>
        Skip to content
      </a>

      <header {...sx(wc.header)}>
        <NavLink to="/breathwork" end {...sx(wc.brand)}>
          <span aria-hidden="true" {...sx('bf-ragged', wc.brandDot)} />
          <span {...sx('bf-display', wc.brandWord)}>BreathFlow</span>
        </NavLink>
        <LayoutGroup id="bf-nav-desktop">
          <nav aria-label="Primary" {...sx(wc.desktopNav)}>
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => sx(wc.navLink, isActive ? wc.navLinkActive : wc.navLinkIdle).className ?? ''}
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

      <main id="bf-main" {...sx(wc.main)}>
        {/* Opacity only: a transform or filter here would trap the fixed session view. */}
        <motion.div
          key={location.pathname}
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.45, ease: EASE_SETTLE }}
        >
          {outlet}
        </motion.div>
      </main>

      <nav aria-label="Primary" {...sx(wc.mobileNav)}>
        <LayoutGroup id="bf-nav-mobile">
          <div {...sx(wc.mobileNavInner)}>
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => sx(wc.mobileLink, isActive ? wc.navLinkActive : wc.navLinkIdle).className ?? ''}
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      reducedMotion ? (
                        <span aria-hidden="true" {...sx(wc.mobileInk)} />
                      ) : (
                        <motion.span
                          aria-hidden="true"
                          layoutId="bf-nav-mobile-ink"
                          {...sx(wc.mobileInk)}
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
