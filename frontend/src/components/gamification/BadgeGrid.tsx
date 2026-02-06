import { BADGES } from '@/lib/gamification'
import { cn } from '@/lib/utils'
import {
  Zap,
  Flame,
  Crown,
  Award,
  Clock,
  Star,
  Box,
  Wind,
  Moon,
  Sunrise,
  Timer,
  HelpCircle,
  Lock,
} from 'lucide-react'

const ICON_MAP: Record<string, React.ReactNode> = {
  Zap: <Zap className="h-5 w-5" />,
  Flame: <Flame className="h-5 w-5" />,
  Crown: <Crown className="h-5 w-5" />,
  Award: <Award className="h-5 w-5" />,
  Clock: <Clock className="h-5 w-5" />,
  Star: <Star className="h-5 w-5" />,
  Box: <Box className="h-5 w-5" />,
  Wind: <Wind className="h-5 w-5" />,
  Moon: <Moon className="h-5 w-5" />,
  Sunrise: <Sunrise className="h-5 w-5" />,
  Timer: <Timer className="h-5 w-5" />,
}

interface BadgeGridProps {
  earnedBadges: string[]
}

export function BadgeGrid({ earnedBadges }: BadgeGridProps) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
      {BADGES.map((badge) => {
        const earned = earnedBadges.includes(badge.id)

        if (badge.secret && !earned) {
          return (
            <div
              key={badge.id}
              data-badge={badge.id}
              data-secret="true"
              className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white/5 border border-white/5"
            >
              <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center">
                <HelpCircle className="h-5 w-5 text-white/20" />
              </div>
              <span className="text-xs text-white/20 text-center">???</span>
            </div>
          )
        }

        return (
          <div
            key={badge.id}
            data-badge={badge.id}
            className={cn(
              'flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all',
              earned
                ? 'bg-white/10 border-white/15'
                : 'bg-white/5 border-white/5 opacity-40'
            )}
          >
            <div
              className={cn(
                'h-10 w-10 rounded-xl flex items-center justify-center',
                earned
                  ? 'bg-gradient-to-br from-[#B0B8FF] to-[#6E7BF2] text-white shadow-lg shadow-[#6E7BF2]/25'
                  : 'bg-white/10 text-white/30'
              )}
            >
              {earned ? ICON_MAP[badge.icon] : <Lock className="h-4 w-4" />}
            </div>
            <span
              className={cn(
                'text-xs text-center font-medium leading-tight',
                earned ? 'text-foreground' : 'text-white/30'
              )}
            >
              {badge.name}
            </span>
          </div>
        )
      })}
    </div>
  )
}
