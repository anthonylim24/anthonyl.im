import { Link, useLocation } from 'react-router-dom'
import { Wind, BarChart3, Home, Settings } from 'lucide-react'
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react'
import { cn } from '@/lib/utils'
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
          background: 'var(--bw-nav-bg)',
          borderBottom: '1px solid var(--bw-nav-border)',
        }}
      >
        <div className="container flex h-16 items-center justify-between px-6">
          <div className="flex items-center">
            {/* Logo */}
            <Link to="/breathwork" className="flex items-center gap-2.5 mr-8 group">
              <span className="font-display font-light text-lg tracking-[0.04em] text-bw">
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
                    'flex items-center gap-2 px-4 py-2 text-sm font-medium tracking-wide transition-colors duration-300',
                    isActive(path)
                      ? 'text-bw font-semibold'
                      : 'text-bw-tertiary hover:text-bw'
                  )}
                >
                  <Icon className="h-4 w-4" />
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
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-bw-secondary hover:text-bw hover:bg-bw-hover transition-all duration-300"
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
