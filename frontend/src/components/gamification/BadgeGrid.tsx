import { motion } from 'motion/react'
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

const spring = { type: 'spring' as const, stiffness: 300, damping: 30, mass: 1 }
const badgeStagger = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } }
const badgePop = {
  hidden: { opacity: 0, scale: 0.8 },
  show: { opacity: 1, scale: 1, transition: spring },
}

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
    <motion.div
      className="grid grid-cols-3 sm:grid-cols-4 gap-3"
      variants={badgeStagger}
      initial="hidden"
      animate="show"
    >
      {BADGES.map((badge) => {
        const earned = earnedBadges.includes(badge.id)

        if (badge.secret && !earned) {
          return (
            <motion.div
              key={badge.id}
              variants={badgePop}
              data-badge={badge.id}
              data-secret="true"
              aria-label="Secret badge — not yet discovered"
              className="flex flex-col items-center gap-2.5 p-3 border border-bw-border"
            >
              <div className="h-11 w-11 bg-bw-active flex items-center justify-center">
                <HelpCircle className="h-5 w-5 text-bw-faint" />
              </div>
              <span className="text-[11px] text-bw-faint text-center font-medium">???</span>
            </motion.div>
          )
        }

        return (
          <motion.div
            key={badge.id}
            variants={badgePop}
            whileHover={earned ? { scale: 1.05 } : undefined}
            transition={spring}
            data-badge={badge.id}
            aria-label={`${badge.name} — ${earned ? 'earned' : 'locked'}`}
            className={cn(
              'flex flex-col items-center gap-2.5 p-3 border transition-[background,border-color,opacity] duration-300',
              earned
                ? 'border-bw-border'
                : 'border-transparent opacity-35'
            )}
          >
            <div
              className={cn(
                'h-11 w-11 flex items-center justify-center transition-[background,color] duration-300',
                earned
                  ? 'bg-bw-text text-background'
                  : 'bg-bw-active text-bw-tertiary'
              )}
            >
              {earned ? ICON_MAP[badge.icon] : <Lock className="h-4 w-4" />}
            </div>
            <span
              className={cn(
                'text-[11px] text-center font-mono font-medium leading-tight',
                earned ? 'text-bw' : 'text-bw-tertiary'
              )}
            >
              {badge.name}
            </span>
          </motion.div>
        )
      })}
    </motion.div>
  )
}
