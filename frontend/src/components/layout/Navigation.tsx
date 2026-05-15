/**
 * Navigation.tsx
 *
 * Floating glass tab bar in two responsive variants, both powered by
 * `@ybouane/liquidglass` for live refraction of the leaves video that
 * lives inside each pill's root. iOS-style frosted appearance with real
 * shader-driven distortion + Fresnel + tint, not a backdrop-filter
 * approximation.
 *
 * Both variants are rendered through a React Portal anchored to
 * `document.body`. This is load-bearing: `.breathwork`'s `col-fade-in`
 * animation ends with `transform: translateY(0)`, which creates a
 * containing block for `position: fixed` descendants — so a regular
 * fixed-position nav inside `.breathwork` scrolls with the layout
 * instead of staying glued to the viewport bottom. Mounting outside
 * `.breathwork` via portal sidesteps the containing-block trap.
 *
 *  • Mobile (<md): centered floating capsule. TranslateY scroll-maps
 *    1:1 with the gesture (see useScrollMappedHide).
 *  • Desktop (>=md): bottom-right quick-launch CTA dock — distinct
 *    shape and content from the mobile pill since primary nav on
 *    desktop already lives in the Header.
 *
 * Hidden entirely on the active-session route so the breathing visual
 * has the screen to itself.
 */
import { useEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
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

// Same-origin leaves clip — see LiquidGlassOrb.tsx for the CORS notes
// on why this isn't fetched from the Cloudflare-hosted original.
const LEAVES_VIDEO_SRC = '/leaves.mp4'

// Mobile pill — frosted look biased toward tint + Fresnel over heavy
// refraction so the buttons remain legible. Shadows disabled because the
// library's drop shadow renders into a 20px ring past the glass element,
// which gets clipped by our rounded-overflow root.
const MOBILE_GLASS_CONFIG = {
  cornerRadius: 9999,
  zRadius: 22,
  refraction: 0.55,
  chromAberration: 0.08,
  edgeHighlight: 0.3,
  specular: 0.4,
  fresnel: 0.5,
  distortion: 0.0,
  blurAmount: 0.12,
  saturation: 1.05,
  tintStrength: 0.4,
  brightness: 0.05,
  shadowOpacity: 0,
  shadowSpread: 0,
  shadowOffsetY: 0,
  bevelMode: 0,
} as const

const DESKTOP_GLASS_CONFIG = {
  ...MOBILE_GLASS_CONFIG,
  zRadius: 18,
  refraction: 0.5,
  fresnel: 0.4,
  tintStrength: 0.35,
} as const

// Pill height (≈60px) + bottom inset (16px) + safe-area + buffer. Over-
// translate slightly so the pill clears the home indicator gutter when
// fully hidden instead of stopping flush with it.
const MOBILE_MAX_HIDDEN = 160

function useGlassInit(
  rootRef: RefObject<HTMLElement | null>,
  glassRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return
    const root = rootRef.current
    const glass = glassRef.current
    if (!root || !glass) return

    let instance: LiquidGlass | null = null
    let cancelled = false

    LiquidGlass.init({ root, glassElements: [glass] })
      .then((inst) => {
        if (cancelled) inst.destroy()
        else instance = inst
      })
      .catch((err) => {
        // Soft failure — without the shader, the leaves video shows
        // through the glass element directly, which is degraded but
        // still readable.
        console.warn('Navigation glass init failed', err)
      })

    return () => {
      cancelled = true
      instance?.destroy()
      instance = null
    }
  }, [enabled, rootRef, glassRef])
}

function useVideoKickstart(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
) {
  // Mirrors LiquidGlassOrb's video kickstart: iOS Safari sometimes
  // ignores the autoplay attribute on inline muted videos under Low
  // Power Mode or slow first-frame decode, and the LiquidGlass scene
  // walker bails on `readyState === 0`. An explicit play() coaxes the
  // element past those restrictions.
  useEffect(() => {
    if (!enabled) return
    const v = videoRef.current
    if (!v) return
    const kick = () => {
      v.play().catch(() => undefined)
    }
    kick()
    document.addEventListener('visibilitychange', kick)
    return () => document.removeEventListener('visibilitychange', kick)
  }, [enabled, videoRef])
}

export function Navigation() {
  const location = useLocation()
  const { trigger: haptic } = useHaptics()
  const reducedMotion = useReducedMotion()

  const mobileWrapperRef = useRef<HTMLElement>(null)
  const mobileGlassRootRef = useRef<HTMLDivElement>(null)
  const mobileGlassElRef = useRef<HTMLDivElement>(null)
  const mobileVideoRef = useRef<HTMLVideoElement>(null)

  const desktopGlassRootRef = useRef<HTMLDivElement>(null)
  const desktopGlassElRef = useRef<HTMLAnchorElement>(null)
  const desktopVideoRef = useRef<HTMLVideoElement>(null)

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

  useGlassInit(mobileGlassRootRef, mobileGlassElRef, enabled)
  useGlassInit(desktopGlassRootRef, desktopGlassElRef, enabled)
  useVideoKickstart(mobileVideoRef, enabled)
  useVideoKickstart(desktopVideoRef, enabled)

  if (isSessionRoute) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      {/* ── Mobile: scroll-aware floating glass capsule ── */}
      <nav
        ref={mobileWrapperRef}
        aria-label="Primary"
        // `bw-mobile-nav` only carries the env(safe-area-inset-bottom)
        // padding — kept as a CSS class because jsdom drops env() values
        // from inline styles, which breaks responsive tests.
        className="bw-mobile-nav md:hidden fixed bottom-4 left-1/2 z-50 pb-2 will-change-transform"
        style={{
          transform: 'translate3d(-50%, 0px, 0)',
          // Drop shadow lives on the wrapper, not on the glass element,
          // because the library forces the glass element to
          // `overflow: visible` and we'd otherwise have to choose
          // between a clipped pill and a clipped shadow.
          filter:
            'drop-shadow(0 12px 28px rgba(0, 0, 0, 0.22)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.08))',
        }}
      >
        <div
          ref={mobileGlassRootRef}
          className="relative overflow-hidden rounded-full"
        >
            <video
              ref={mobileVideoRef}
              src={LEAVES_VIDEO_SRC}
              crossOrigin="anonymous"
              autoPlay
              loop
              muted
              playsInline
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div
              ref={mobileGlassElRef}
              data-config={JSON.stringify(MOBILE_GLASS_CONFIG)}
              className="relative flex items-center gap-1 px-2 py-2"
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
          </div>
      </nav>

      {/* ── Desktop: glass quick-launch dock ── */}
      <nav
        aria-label="Quick actions"
        className="hidden md:block fixed bottom-8 right-8 z-50"
        style={{
          filter:
            'drop-shadow(0 14px 32px rgba(0, 0, 0, 0.2)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.08))',
        }}
      >
        <div
          ref={desktopGlassRootRef}
          className="relative overflow-hidden rounded-full"
        >
          <video
            ref={desktopVideoRef}
            src={LEAVES_VIDEO_SRC}
            crossOrigin="anonymous"
            autoPlay
            loop
            muted
            playsInline
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <Link
            ref={desktopGlassElRef}
            to="/breathwork/session"
            aria-current={
              location.pathname.startsWith('/breathwork/session') ? 'page' : undefined
            }
            onPointerEnter={() => preloadBreathworkRoute('/breathwork/session')}
            onFocus={() => preloadBreathworkRoute('/breathwork/session')}
            data-config={JSON.stringify(DESKTOP_GLASS_CONFIG)}
            className={cn(
              'group relative inline-flex items-center gap-2.5 rounded-full px-5 py-3',
              'text-bw transition-all duration-200 hover:-translate-y-px',
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
        </div>
      </nav>
    </>,
    document.body,
  )
}
