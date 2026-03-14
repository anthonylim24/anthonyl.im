import { Link, useLocation } from 'react-router-dom'
import { Wind, BarChart3, Home, Settings } from 'lucide-react'
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react'
import { cn } from '@/lib/utils'
import { ACCENT, ACCENT_BRIGHT } from '@/lib/palette'
import { CLERK_ENABLED } from '@/lib/clerk'

export function Header() {
  const location = useLocation()

  const navItems = [
    { path: '/breathwork', label: 'Home', icon: Home },
    { path: '/breathwork/session', label: 'Breathe', icon: Wind },
    { path: '/breathwork/progress', label: 'Progress', icon: BarChart3 },
    { path: '/breathwork/settings', label: 'Settings', icon: Settings },
  ]

  const isActive = (path: string) => {
    if (path === '/breathwork') {
      return location.pathname === '/breathwork'
    }
    return location.pathname.startsWith(path)
  }

  return (
    <header className="sticky top-0 z-50 w-full" style={{ transform: 'translateZ(0)' }}>
      <div
        className="safe-top"
        style={{
          background: 'rgba(5, 8, 22, 0.85)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
        }}
      >
        <div className="container flex h-16 items-center justify-between px-6">
          <div className="flex items-center">
            {/* Logo */}
            <Link to="/breathwork" className="flex items-center gap-2.5 mr-8 group">
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center"
                style={{ background: ACCENT }}
              >
                <Wind className="h-4 w-4 text-white" />
              </div>
              <span className="font-display font-bold text-base tracking-tight hidden sm:block text-white/90">
                BreathFlow
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300',
                    isActive(path)
                      ? 'text-white'
                      : 'text-white/35 hover:text-white/70 hover:bg-white/5'
                  )}
                  style={isActive(path) ? {
                    background: `linear-gradient(135deg, ${ACCENT}20, ${ACCENT_BRIGHT}15)`,
                    color: ACCENT_BRIGHT,
                  } : undefined}
                >
                  <Icon className={cn(
                    "h-4 w-4 transition-transform duration-300",
                    isActive(path) && "scale-110"
                  )} />
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Auth controls */}
          {CLERK_ENABLED && (
            <div className="flex items-center">
              <SignedOut>
                <SignInButton mode="modal">
                  <button
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-all duration-300"
                  >
                    Sign In
                  </button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: 'h-8 w-8',
                    },
                  }}
                />
              </SignedIn>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
