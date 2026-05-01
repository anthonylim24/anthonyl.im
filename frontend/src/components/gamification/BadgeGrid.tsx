import { motion } from 'motion/react'
import { BADGES } from '@/lib/gamification'
import { cn } from '@/lib/utils'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import {
  badgeStagger,
  getBadgeMotionConfig,
  reducedBadgeStagger,
} from './badgeMotion'
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
  Zap: <Zap className="h-5 w-5" aria-hidden="true" />,
  Flame: <Flame className="h-5 w-5" aria-hidden="true" />,
  Crown: <Crown className="h-5 w-5" aria-hidden="true" />,
  Award: <Award className="h-5 w-5" aria-hidden="true" />,
  Clock: <Clock className="h-5 w-5" aria-hidden="true" />,
  Star: <Star className="h-5 w-5" aria-hidden="true" />,
  Box: <Box className="h-5 w-5" aria-hidden="true" />,
  Wind: <Wind className="h-5 w-5" aria-hidden="true" />,
  Moon: <Moon className="h-5 w-5" aria-hidden="true" />,
  Sunrise: <Sunrise className="h-5 w-5" aria-hidden="true" />,
  Timer: <Timer className="h-5 w-5" aria-hidden="true" />,
}

interface BadgeGridProps {
  earnedBadges: string[]
}

export function BadgeGrid({ earnedBadges }: BadgeGridProps) {
  const reducedMotion = useReducedMotion()
  const earnedCount = BADGES.filter((badge) => earnedBadges.includes(badge.id)).length

  return (
    <motion.div
      className="grid grid-cols-3 sm:grid-cols-4 gap-3"
      role="list"
      aria-label={`${earnedCount} of ${BADGES.length} achievements earned`}
      variants={reducedMotion ? reducedBadgeStagger : badgeStagger}
      initial="hidden"
      animate="show"
    >
      {BADGES.map((badge) => {
        const earned = earnedBadges.includes(badge.id)
        const motionConfig = getBadgeMotionConfig(reducedMotion, earned)

        if (badge.secret && !earned) {
          return (
            <motion.div
              key={badge.id}
              variants={motionConfig.variants}
              data-badge={badge.id}
              data-secret="true"
              role="listitem"
              aria-label="Secret badge locked. Not yet discovered."
              className="flex flex-col items-center gap-2.5 p-3 border border-bw-border"
            >
              <div className="h-11 w-11 bg-bw-active flex items-center justify-center">
                <HelpCircle className="h-5 w-5 text-bw-faint" aria-hidden="true" />
              </div>
              <span className="text-[11px] text-bw-faint text-center font-medium">???</span>
            </motion.div>
          )
        }

        return (
          <motion.div
            key={badge.id}
            variants={motionConfig.variants}
            whileHover={motionConfig.whileHover}
            transition={motionConfig.transition}
            data-badge={badge.id}
            role="listitem"
            aria-label={`${badge.name} ${earned ? 'earned' : 'locked'}. ${badge.description}.`}
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
                  ? 'bg-bw-accent text-bw-accent-foreground'
                  : 'bg-bw-active text-bw-tertiary'
              )}
            >
              {earned ? ICON_MAP[badge.icon] : <Lock className="h-4 w-4" aria-hidden="true" />}
            </div>
            <span
              className={cn(
                'text-[11px] text-center font-medium leading-tight',
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
