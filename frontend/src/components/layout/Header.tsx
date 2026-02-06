import { Link, useLocation } from 'react-router-dom'
import { Wind, BarChart3, Home, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

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
    <header className="sticky top-0 z-50 w-full">
      <div className="liquid-glass-breath border-b border-white/20">
        <div className="container flex h-16 items-center justify-between px-6">
          <div className="flex items-center">
            {/* Logo */}
            <Link to="/breathwork" className="flex items-center gap-3 mr-8 group">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-[#ff7170]/30 to-[#ff5eb5]/30 rounded-xl blur-lg group-hover:from-[#ff7170]/40 group-hover:to-[#ff5eb5]/40 transition-all duration-300" />
                <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-[#ff7170] to-[#ff5eb5] flex items-center justify-center shadow-lg shadow-[#ff7170]/25 group-hover:scale-105 transition-transform duration-300">
                  <Wind className="h-5 w-5 text-white" />
                </div>
              </div>
              <span className="font-semibold text-lg tracking-tight hidden sm:block bg-gradient-to-r from-[#ff7170] to-[#ff5eb5] bg-clip-text text-transparent">
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
                    'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300',
                    isActive(path)
                      ? 'bg-gradient-to-r from-[#ff7170]/15 to-[#ff5eb5]/15 text-[#ff7170] shadow-sm'
                      : 'text-white/40 hover:text-white hover:bg-white/10'
                  )}
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
        </div>
      </div>
    </header>
  )
}
