/**
 * Navigation.tsx
 *
 * Floating glass tab bar in two responsive variants:
 *
 *  • Mobile (<md): an iOS-style capsule centered at the bottom of the
 *    viewport. Uses `backdrop-filter` for the live-blur glass effect that
 *    iOS system surfaces have, and scroll-maps its translateY so it
 *    retracts as the user scrolls down and reveals as they scroll up. The
 *    mapping is 1:1 with the scroll gesture (see useScrollMappedHide) —
 *    no easing, no snap, the bar simply tracks the finger.
 *
 *  • Desktop (>=md): a compact, always-visible glass dock anchored at
 *    bottom-right with just the primary "Breathe" CTA. Distinct from the
 *    mobile pill so desktop doesn't get a stretched mobile UI — primary
 *    nav on desktop lives in the Header; this dock is a quick-launch
 *    affordance rather than a full nav.
 *
 * Hidden entirely on the active-session route so the breathing visual
 * has the screen to itself.
 */
import { useRef } from 'react'
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

// Pill height (56px) + bottom inset (~24px) + safe area. Slightly over-
// translate so the pill clears the home indicator gutter when fully
// hidden, instead of stopping with its bottom edge flush to it.
const MOBILE_MAX_HIDDEN = 120

// Glass surface shared by both variants — kept as plain inline styles
// (rather than a Tailwind class) because the vendor-prefixed
// `WebkitBackdropFilter` needs to ship to iOS Safari.
const glassSurface = {
  background:
    'color-mix(in oklab, var(--bw-surface) 70%, transparent)',
  backdropFilter: 'blur(22px) saturate(180%)',
  WebkitBackdropFilter: 'blur(22px) saturate(180%)',
  border: '1px solid var(--bw-nav-border)',
  boxShadow:
    '0 10px 30px -12px rgba(0, 0, 0, 0.25), 0 2px 8px -2px rgba(0, 0, 0, 0.08)',
}

export function Navigation() {
  const location = useLocation()
  const { trigger: haptic } = useHaptics()
  const reducedMotion = useReducedMotion()
  const mobileRef = useRef<HTMLElement>(null)

  const activeIndex = navItems.findIndex(({ path }) =>
    path === '/breathwork'
      ? location.pathname === '/breathwork'
      : location.pathname.startsWith(path),
  )

  const isSessionRoute = location.pathname.startsWith('/breathwork/session')

  // Scroll-mapped hide on mobile only. Reduced-motion users keep a
  // static pill — the gesture-tracked transform animates implicitly via
  // the user's own movement, but disabling it removes any chance of
  // motion if e.g. momentum scrolling carries the offset past 0.
  useScrollMappedHide(mobileRef, {
    translateX: '-50%',
    maxHidden: MOBILE_MAX_HIDDEN,
    enabled: !isSessionRoute && !reducedMotion,
  })

  if (isSessionRoute) return null

  return (
    <>
      {/* ── Mobile: scroll-aware floating capsule ── */}
      <nav
        ref={mobileRef}
        aria-label="Primary"
        // `bw-mobile-nav` only carries the env(safe-area-inset-bottom)
        // padding — kept as a CSS class because jsdom drops env() values
        // from inline styles, which breaks responsive tests.
        className="bw-mobile-nav md:hidden fixed bottom-3 left-1/2 z-50 will-change-transform"
        style={{
          // The `translateX(-50%)` lives inside the inline transform set
          // by useScrollMappedHide so centering and scroll offset compose
          // cleanly in a single matrix.
          transform: 'translate3d(-50%, 0px, 0)',
        }}
      >
        <div
          className="flex items-center gap-1 rounded-full px-2 py-1.5"
          style={glassSurface}
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
                          'color-mix(in oklab, var(--bw-accent) 14%, transparent)',
                      }
                    : undefined
                }
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
              </Link>
            )
          })}
        </div>
      </nav>

      {/* ── Desktop: compact glass quick-launch dock ── */}
      <nav
        aria-label="Quick actions"
        className="hidden md:block fixed bottom-8 right-8 z-50"
      >
        <Link
          to="/breathwork/session"
          aria-current={
            location.pathname.startsWith('/breathwork/session') ? 'page' : undefined
          }
          onPointerEnter={() => preloadBreathworkRoute('/breathwork/session')}
          onFocus={() => preloadBreathworkRoute('/breathwork/session')}
          className={cn(
            'group inline-flex items-center gap-2.5 rounded-full px-5 py-3',
            'text-bw transition-all duration-200 hover:-translate-y-px hover:shadow-lg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bw-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bw-canvas',
          )}
          style={glassSurface}
        >
          <span
            className="grid h-7 w-7 place-items-center rounded-full"
            style={{
              background:
                'color-mix(in oklab, var(--bw-accent) 14%, transparent)',
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
