/**
 * Navigation.tsx
 *
 * Floating glass tab bar in two responsive variants, both powered by
 * `@ybouane/liquidglass` refracting the page DOM behind them.
 *
 *  • Mobile (<md): centered floating capsule, scroll-maps its translateY
 *    1:1 with the gesture (see useScrollMappedHide).
 *  • Desktop (>=md): always-visible glass dock at bottom-right with the
 *    primary "Breathe" CTA — distinct from the mobile pill.
 *
 * Architecturally, this component is a *direct child* of the LiquidGlass
 * root that lives in BreathworkLayout: page content (`.breathwork`) is a
 * sibling of these navs inside that root, so the library can rasterize
 * the page via html-to-image and refract it through the glass shader.
 * The page raster is cached on first render and repositioned per frame
 * via `getBoundingClientRect`, so scrolling shifts the raster naturally
 * — we just have to nudge the library with `markChanged()` on each
 * scroll event so it re-runs the shader at the page's new position.
 *
 * Hidden entirely on the active-session route so the breathing visual
 * has the screen to itself.
 */
import { useEffect, useRef, type RefObject } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Wind, BarChart3, Home, Settings } from 'lucide-react'
import { LiquidGlass } from '@ybouane/liquidglass'
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

// Pill height + bottom inset + safe-area + buffer. Over-translate slightly
// so the pill clears the home indicator gutter when fully hidden.
const MOBILE_MAX_HIDDEN = 160

// Per-element glass config. Biased toward visible refraction + Fresnel so
// you can read it as glass, not as a frosted card. Shadows disabled because
// the library renders the drop shadow into a 20px ring outside the glass
// element — visual drop shadow lives on the wrapper via filter instead.
const MOBILE_GLASS_CONFIG = {
  cornerRadius: 9999,
  zRadius: 13,
  refraction: 0.85,
  chromAberration: 0.12,
  edgeHighlight: 0.32,
  specular: 0.15,
  fresnel: 0.55,
  distortion: 0.9,
  blurAmount: 0.06,
  saturation: 0.05,
  tintStrength: 0.1,
  brightness: 0.5,
  opacity: 1.0,
  shadowOpacity: 0,
  shadowSpread: 0,
  shadowOffsetY: 0,
  floating: false,
  button: false,
  bevelMode: 0,
} as const

const DESKTOP_GLASS_CONFIG = {
  ...MOBILE_GLASS_CONFIG,
  zRadius: 20,
  refraction: 0.7,
  chromAberration: 0.10,
} as const

interface NavigationProps {
  /**
   * Ref to the LiquidGlass root element. The navs render as direct
   * children of that root so the library can see them in
   * `root.children` and treat them as glass elements that refract the
   * page-content sibling.
   */
  rootRef: RefObject<HTMLElement | null>
}

export function Navigation({ rootRef }: NavigationProps) {
  const location = useLocation()
  const { trigger: haptic } = useHaptics()
  const reducedMotion = useReducedMotion()

  const mobileNavRef = useRef<HTMLElement>(null)
  const desktopNavRef = useRef<HTMLElement>(null)
  // Held in a ref so the pathname-change effect can reach the live
  // instance without remounting the init effect on every navigation.
  const instanceRef = useRef<LiquidGlass | null>(null)

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

  // Initialise LiquidGlass with both navs as glass elements of the
  // layout-level root. The library walks `root.children` to assemble each
  // glass element's refraction scene — so `.breathwork` (sibling of the
  // navs inside the root) gets html-to-image-rasterized and becomes the
  // refraction source, no leaves video needed.
  //
  // Without a dynamic contributor (e.g. a <video>) inside the root, the
  // library's render loop short-circuits when nothing is marked dirty.
  // The page raster's *cached image* is static, but its position on
  // screen changes every scroll frame — we listen to scroll and call
  // `markChanged()` so the shader re-runs and re-samples the cached
  // raster at its current viewport-relative rect.
  useEffect(() => {
    if (!enabled) return
    const root = rootRef.current
    const mobile = mobileNavRef.current
    const desktop = desktopNavRef.current
    if (!root || !mobile || !desktop) return

    let cancelled = false

    LiquidGlass.init({ root, glassElements: [mobile, desktop] })
      .then((inst) => {
        if (cancelled) {
          inst.destroy()
          return
        }
        instanceRef.current = inst
      })
      .catch((err) => {
        // Soft failure — without the shader, the navs still render with
        // their inline-style fallback (translucent gradient surface), so
        // the user sees a card-like pill rather than nothing.
        console.warn('Navigation glass init failed', err)
      })

    const onScroll = () => {
      instanceRef.current?.markChanged()
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      cancelled = true
      window.removeEventListener('scroll', onScroll)
      instanceRef.current?.destroy()
      instanceRef.current = null
    }
  }, [enabled, rootRef])

  // Route change: the library captures each non-glass root child via
  // html-to-image and caches the result keyed off element identity, so
  // a content swap inside `.breathwork` (same element, different
  // children) leaves the cached raster stale — the previous route's
  // page renders inside the glass refraction until the next mutation
  // the library notices. The library's MutationObserver only watches
  // the *root's* childList, not subtree mutations inside `.breathwork`,
  // so we invalidate the cache explicitly here.
  //
  // We invalidate three times: immediately (for synchronously-loaded
  // routes), and again at ~120ms / ~480ms to cover lazy-loaded chunks
  // and AnimatedOutlet's enter transition — html-to-image is cheap
  // enough that two redundant captures per navigation is fine, and
  // it's the only way to guarantee the final visual state lands in the
  // cache without observing the entire breathwork subtree.
  useEffect(() => {
    const invalidate = () => {
      const inst = instanceRef.current
      const root = rootRef.current
      if (!inst || !root) return
      for (const child of Array.from(root.children)) {
        if (child === mobileNavRef.current || child === desktopNavRef.current) continue
        if (child instanceof HTMLElement) {
          inst.capture.invalidateCache(child)
        }
      }
      inst.markChanged()
    }

    invalidate()
    const t1 = window.setTimeout(invalidate, 120)
    const t2 = window.setTimeout(invalidate, 480)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [location.pathname, rootRef])

  if (isSessionRoute) return null

  return (
    <>
      {/* ── Mobile: scroll-aware floating glass capsule ── */}
      <nav
        ref={mobileNavRef}
        aria-label="Primary"
        data-config={JSON.stringify(MOBILE_GLASS_CONFIG)}
        // `bw-mobile-nav` carries env(safe-area-inset-bottom) padding —
        // jsdom drops env() from inline styles, so it lives in CSS.
        className="bw-mobile-nav md:hidden fixed bottom-4 left-1/2 z-50 pb-2 !pb-2 flex items-center gap-1 rounded-full px-2 py-2 will-change-transform"
   
        style={{
          transform: 'translate3d(-50%, 0px, 0)',
          // Fallback surface that's visible before glass init resolves
          // and if init fails. The library's injected shader canvas
          // (z-index: -1) sits behind these element styles, so once it's
          // running it dominates and we see real refraction instead.
          background:
            'color-mix(in oklab, var(--bw-surface) 35%, transparent)',
          // Drop shadow lives in `filter` (not box-shadow) so the
          // library's `overflow: visible` doesn't clip it.
          filter:
            'drop-shadow(0 12px 28px rgba(0, 0, 0, 0.22)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.08))',
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

      {/* ── Desktop: glass quick-launch dock ── */}
      <nav
        ref={desktopNavRef}
        aria-label="Quick actions"
        data-config={JSON.stringify(DESKTOP_GLASS_CONFIG)}
        className="hidden md:flex fixed bottom-8 right-8 z-50 items-center gap-2.5 rounded-full px-5 py-3"
        style={{
          background:
            'color-mix(in oklab, var(--bw-surface) 35%, transparent)',
          filter:
            'drop-shadow(0 14px 32px rgba(0, 0, 0, 0.20)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.08))',
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
            'group inline-flex items-center gap-2.5 text-bw transition-all duration-200 hover:-translate-y-px',
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
