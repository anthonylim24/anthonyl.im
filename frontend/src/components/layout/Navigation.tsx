/**
 * Navigation.tsx
 * Bottom navigation bar for mobile devices with dynamic safe area support.
 * Updated: Liquid glass styling with vibrant gradient accents.
 */
import { Link, useLocation } from 'react-router-dom'
import { Wind, BarChart3, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Navigation() {
  const location = useLocation()

  const navItems = [
    { path: '/breathwork', label: 'Home', icon: Home, gradient: 'from-[#ff7170] to-[#ff5eb5]' },
    { path: '/breathwork/session', label: 'Breathe', icon: Wind, gradient: 'from-[#2dd4bf] to-[#22d3ee]' },
    { path: '/breathwork/progress', label: 'Progress', icon: BarChart3, gradient: 'from-[#60a5fa] to-[#818cf8]' },
  ]

  const isActive = (path: string) => {
    if (path === '/breathwork') {
      return location.pathname === '/breathwork'
    }
    return location.pathname.startsWith(path)
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-5 pt-3 safe-bottom">
      <div className="liquid-glass-breath rounded-2xl mx-auto max-w-md shadow-xl shadow-black/5">
        <div className="flex items-center justify-around h-16 px-3">
          {navItems.map(({ path, label, icon: Icon, gradient }) => {
            const active = isActive(path)
            return (
              <Link
                key={path}
                to={path}
                className={cn(
                  'flex flex-col items-center gap-1 px-6 py-2 rounded-xl text-xs font-medium transition-all duration-300',
                  active
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <div className={cn(
                  "relative p-2 rounded-xl transition-all duration-300",
                  active && "bg-gradient-to-br shadow-lg"
                )}
                style={active ? { backgroundImage: `linear-gradient(to bottom right, var(--tw-gradient-stops))` } : undefined}
                >
                  {active && (
                    <div className={cn("absolute inset-0 rounded-xl bg-gradient-to-br opacity-100", gradient)} />
                  )}
                  <Icon className={cn(
                    "relative h-5 w-5 transition-all duration-300",
                    active ? "text-white scale-110" : "scale-100"
                  )} />
                </div>
                <span className={cn(
                  "transition-all duration-300",
                  active && "font-semibold"
                )}>{label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
