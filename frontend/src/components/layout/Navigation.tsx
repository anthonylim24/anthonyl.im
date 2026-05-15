/**
 * Navigation.tsx
 *
 * Floating glass tab bar in two responsive variants:
 *
 *  • Mobile (<md): an iOS-style capsule centered at the viewport bottom.
 *    TranslateY scroll-maps 1:1 with the gesture (see useScrollMappedHide).
 *  • Desktop (>=md): a compact, always-visible glass dock at bottom-right
 *    with the primary "Breathe" CTA — distinct from the mobile pill.
 *
 * The glass effect comes from `backdrop-filter` (real-time blur +
 * saturation of the rendered DOM behind each pill), not from the
 * `@ybouane/liquidglass` library. The library samples only its own root's
 * children, so it cannot refract page content that lives outside that
 * root — the right tool for "frost the rendered page below the pill" is
 * the browser's built-in backdrop filter, which is what iOS system
 * surfaces use internally.
 *
 * Both variants are rendered through a React Portal anchored to
 * `document.body`. This is load-bearing: `.breathwork`'s `col-fade-in`
 * animation ends with `transform: translateY(0)`, which creates a
 * containing block for `position: fixed` descendants — so a regular
 * fixed-position nav inside `.breathwork` scrolls with the layout
 * instead of staying glued to the viewport bottom. Mounting outside
 * `.breathwork` via portal sidesteps the containing-block trap.
 */
import { useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
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

// Pill height (≈60px) + bottom inset (16px) + safe-area + buffer. Over-
// translate slightly so the pill clears the home indicator gutter when
// fully hidden instead of stopping flush with it.
const MOBILE_MAX_HIDDEN = 160

// Shared glass surface. WebkitBackdropFilter must ship to iOS Safari —
// modern Safari supports the unprefixed property too, but keeping both
// is the maximum-compatibility shape and matches what iOS-grade web
// apps actually ship.
//
// The `linear-gradient` background gives the pill a subtle top-edge
// highlight + bottom-edge fade, which is the visual cue that sells "this
// is a 3D glass surface lit from above" — a flat translucent fill reads
// as a plain card, not glass.
const glassSurface: CSSProperties = {
  background:
    'linear-gradient(180deg, color-mix(in oklab, var(--bw-surface) 55%, transparent) 0%, color-mix(in oklab, var(--bw-surface) 38%, transparent) 100%)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  border: '1px solid color-mix(in oklab, var(--bw-surface) 70%, transparent)',
  boxShadow:
    [
      'inset 0 1px 0 rgba(255, 255, 255, 0.35)', // top-edge specular highlight
      'inset 0 -1px 0 rgba(0, 0, 0, 0.04)', // bottom-edge contact shadow
      '0 12px 28px -10px rgba(0, 0, 0, 0.22)', // drop shadow
      '0 2px 6px -2px rgba(0, 0, 0, 0.10)',
    ].join(', '),
}

export function Navigation() {
  const location = useLocation()
  const { trigger: haptic } = useHaptics()
  const reducedMotion = useReducedMotion()

  const mobileWrapperRef = useRef<HTMLElement>(null)

  const activeIndex = navItems.findIndex(({ path }) =>
    path === '/breathwork'
      ? location.pathname === '/breathwork'
      : location.pathname.startsWith(path),
  )

  const isSessionRoute = location.pathname.startsWith('/breathwork/session')
  const enabled = !isSessionRoute && !reducedMotion

  useScrollMappedHide(mobileWrapperRef, {
    translateX: '-50%',
    maxHidden: MOBILE_MAX_HIDDEN,
    enabled,
  })

  if (isSessionRoute) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      {/* ── Mobile: scroll-aware floating glass capsule ── */}
      <nav
        ref={mobileWrapperRef}
        aria-label="Primary"
        // `bw-mobile-nav` carries the env(safe-area-inset-bottom) padding —
        // kept as a CSS class because jsdom drops env() values from inline
        // styles, which breaks responsive tests.
        className="bw-mobile-nav md:hidden fixed bottom-4 left-1/2 z-50 pb-2 will-change-transform"
        style={{ transform: 'translate3d(-50%, 0px, 0)' }}
      >
        <div
          className="flex items-center gap-1 rounded-full px-2 py-2"
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
                          'color-mix(in oklab, var(--bw-accent) 18%, transparent)',
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

      {/* ── Desktop: glass quick-launch dock ── */}
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
            'text-bw transition-all duration-200 hover:-translate-y-px',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bw-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bw-canvas',
          )}
          style={glassSurface}
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
    </>,
    document.body,
  )
}
