import { Link, useLocation } from 'react-router-dom'
import { Wind, BarChart3, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Navigation() {
  const location = useLocation()

  const navItems = [
    { path: '/breathwork', label: 'Home', icon: Home },
    { path: '/breathwork/session', label: 'Breathe', icon: Wind },
    { path: '/breathwork/progress', label: 'Progress', icon: BarChart3 },
  ]

  const isActive = (path: string) => {
    if (path === '/breathwork') {
      return location.pathname === '/breathwork'
    }
    return location.pathname.startsWith(path)
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-4 pt-2 pb-4 safe-bottom">
      <div className="glass-strong rounded-2xl mx-auto max-w-md">
        <div className="flex items-center justify-around h-14 px-2">
          {navItems.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className={cn(
                'flex flex-col items-center gap-1 px-6 py-2 rounded-xl text-xs font-medium transition-all duration-200',
                isActive(path)
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className={cn(
                "h-5 w-5 transition-transform duration-200",
                isActive(path) && "scale-110"
              )} />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
