/**
 * Navigation.tsx
 *
 * Paper capsule tab bar. Opaque surface, 1px border, no refraction.
 *
 *  • Mobile (<md): centered floating capsule, scroll-maps its translateY
 *    1:1 with the gesture (see useScrollMappedHide).
 *  • Desktop (>=md): always-visible dock at bottom-right with the
 *    primary "Breathe" CTA.
 *
 * Hidden entirely on the active-session route so the breathing visual
 * has the screen to itself.
 */
import { useRef, type RefObject } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Wind, BarChart3, Home, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHaptics } from '@/hooks/useHaptics'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useScrollMappedHide } from '@/hooks/useScrollMappedHide'
import { preloadBreathworkRoute } from '@/lib/breathworkRoutePreload'

const navItems = [
  { path: '/breathwork', label: 'Home', icon: Home },
  { path: '/breathwork/session', label: 'Breathe', icon: Wind },
  { path: '/breathwork/progress', label: 'Progress', icon: BarChart3 },
  { path: '/breathwork/settings', label: 'Settings', icon: Settings },
]

const MOBILE_MAX_HIDDEN = 160

interface NavigationProps {
  /** Kept for layout compatibility; the nav no longer samples a glass root. */
  rootRef: RefObject<HTMLElement | null>
}

export function Navigation({ rootRef }: NavigationProps) {
  void rootRef
  const location = useLocation()
  const { trigger: haptic } = useHaptics()
  const reducedMotion = useReducedMotion()

  const mobileNavRef = useRef<HTMLElement>(null)

  const activeIndex = navItems.findIndex(({ path }) =>
    path === '/breathwork'
      ? location.pathname === '/breathwork'
      : location.pathname.startsWith(path),
  )

  const isSessionRoute = location.pathname.startsWith('/breathwork/session')
  const enabled = !isSessionRoute && !reducedMotion

  useScrollMappedHide(mobileNavRef, {
    translateX: '-50%',
    maxHidden: MOBILE_MAX_HIDDEN,
    enabled,
  })

  if (isSessionRoute) return null

  return (
    <>
      <nav
        ref={mobileNavRef}
        aria-label="Primary"
        className="bw-mobile-nav md:hidden fixed bottom-4 left-1/2 z-50 pb-2 !pb-2 flex items-center gap-1 rounded-full px-2 py-2 will-change-transform"
        style={{
          transform: 'translate3d(-50%, 0px, 0)',
          background: 'var(--bw-surface)',
          border: '1px solid var(--bw-nav-border)',
          boxShadow: 'var(--bw-nav-shadow)',
        }}
      >
        {navItems.map(({ path, label, icon: Icon }, i) => {
          const active = i === activeIndex
          return (
            <Link
              key={path}
              to={path}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              onPointerEnter={() => preloadBreathworkRoute(path)}
              onFocus={() => preloadBreathworkRoute(path)}
              onClick={() => {
                if (!active) haptic('selection')
              }}
              className={cn(
                'relative grid h-11 w-11 place-items-center rounded-full transition-colors duration-200',
                active
                  ? 'text-bw-accent'
                  : 'text-bw-secondary hover:text-bw active:scale-95',
              )}
              style={
                active
                  ? {
                      background:
                        'color-mix(in oklab, var(--bw-accent) 18%, transparent)',
                    }
                  : undefined
              }
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
            </Link>
          )
        })}
      </nav>

      <nav
        aria-label="Quick actions"
        className="hidden md:flex fixed bottom-8 right-8 z-50 items-center gap-2.5 rounded-full px-5 py-3"
        style={{
          background: 'var(--bw-surface)',
          border: '1px solid var(--bw-nav-border)',
          boxShadow: 'var(--bw-nav-shadow)',
        }}
      >
        <Link
          to="/breathwork/session"
          aria-label="Start a session"
          aria-current={
            location.pathname.startsWith('/breathwork/session') ? 'page' : undefined
          }
          onPointerEnter={() => preloadBreathworkRoute('/breathwork/session')}
          onFocus={() => preloadBreathworkRoute('/breathwork/session')}
          className={cn(
            'group inline-flex items-center gap-2.5 text-bw transition-colors duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bw-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bw-canvas',
          )}
        >
          <span
            className="grid h-7 w-7 place-items-center rounded-full"
            style={{
              background:
                'color-mix(in oklab, var(--bw-accent) 18%, transparent)',
            }}
          >
            <Wind className="h-4 w-4 text-bw-accent" strokeWidth={2} />
          </span>
          <span className="text-[12px] font-mono font-medium uppercase tracking-[0.12em]">
            Start a session
          </span>
        </Link>
      </nav>
    </>
  )
}
