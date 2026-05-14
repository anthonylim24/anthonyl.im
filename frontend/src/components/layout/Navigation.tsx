/**
 * Navigation.tsx
 * Minimal bottom tab bar — parchment + ink aesthetic.
 *
 * iOS Safari positioning notes:
 * - Since iOS 13, `position: fixed; bottom: 0` anchors to the visual viewport
 *   on Safari Mobile, so the bar stays visible whether the URL bar is at the
 *   top, at the bottom, expanded, or collapsed. The previous implementation
 *   tried to compute `bottom: ${innerHeight - visualViewport.height}px` to
 *   "push the nav up past the URL bar" — this was double-correcting and on
 *   modern iOS placed the nav OFF-screen below the visible area.
 * - The home indicator gutter is handled by padding the nav itself with
 *   `env(safe-area-inset-bottom)`. This is the pattern Material UI's
 *   BottomNavigation, Tailwind UI's mobile nav, and every iOS-grade web app
 *   uses. Requires `<meta name="viewport" content="… viewport-fit=cover">`
 *   in index.html — already present.
 * - No `transition` on `bottom` — the property is now static, so there's
 *   nothing for the browser to animate (avoids a class of jitter bugs).
 * - `transform: translateZ(0)` promotes the nav to its own compositor layer
 *   so it doesn't repaint during scroll.
 */
import { Link, useLocation } from 'react-router-dom'
import { Wind, BarChart3, Home, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHaptics } from '@/hooks/useHaptics'
import { preloadBreathworkRoute } from '@/lib/breathworkRoutePreload'

const navItems = [
  { path: '/breathwork', label: 'Home', icon: Home },
  { path: '/breathwork/session', label: 'Breathe', icon: Wind },
  { path: '/breathwork/progress', label: 'Progress', icon: BarChart3 },
  { path: '/breathwork/settings', label: 'Settings', icon: Settings },
]

export function Navigation() {
  const location = useLocation()
  const { trigger: haptic } = useHaptics()

  const activeIndex = navItems.findIndex(({ path }) =>
    path === '/breathwork'
      ? location.pathname === '/breathwork'
      : location.pathname.startsWith(path)
  )

  const shouldHideInSession = location.pathname.startsWith('/breathwork/session')

  if (shouldHideInSession) {
    return null
  }

  return (
    <nav
      className="bw-mobile-nav md:hidden fixed bottom-0 left-0 right-0 z-50"
      style={{
        backgroundColor: 'var(--bw-nav-bg-mobile)',
        borderTop: '1px solid var(--bw-nav-border)',
        transform: 'translateZ(0)',
        willChange: 'transform',
        contain: 'layout paint',
      }}
    >
      <div className="mx-auto max-w-md">
        <div className="grid grid-cols-4 h-16">
          {navItems.map(({ path, label, icon: Icon }, i) => {
            const active = i === activeIndex
            return (
              <Link
                key={path}
                to={path}
                aria-current={active ? 'page' : undefined}
                onPointerEnter={() => preloadBreathworkRoute(path)}
                onFocus={() => preloadBreathworkRoute(path)}
                onClick={() => { if (i !== activeIndex) haptic('selection') }}
                className={cn(
                  'flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 text-[10px] font-mono font-medium tracking-[0.07em] uppercase transition-colors duration-300 relative',
                  active
                    ? 'text-bw'
                    : 'text-bw-secondary hover:text-bw active:scale-95'
                )}
              >
                <div className="relative">
                  <Icon className={cn(
                    "relative h-[24px] w-[24px] transition-colors duration-300",
                    active ? "text-bw-accent" : "text-bw-secondary"
                  )} />
                </div>
                <span>{label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
