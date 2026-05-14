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
  Award,
  Clock,
  Trophy,
  Star,
  Square,
  Wind,
  Moon,
  Sunrise,
  Timer,
  Beaker,
  Mountain,
  HelpCircle,
  Lock,
} from 'lucide-react'

const ICON_MAP: Record<string, React.ReactNode> = {
  Zap: <Zap className="h-4 w-4" aria-hidden="true" />,
  Flame: <Flame className="h-4 w-4" aria-hidden="true" />,
  Award: <Award className="h-4 w-4" aria-hidden="true" />,
  Clock: <Clock className="h-4 w-4" aria-hidden="true" />,
  Trophy: <Trophy className="h-4 w-4" aria-hidden="true" />,
  Star: <Star className="h-4 w-4" aria-hidden="true" />,
  Square: <Square className="h-4 w-4" aria-hidden="true" />,
  Wind: <Wind className="h-4 w-4" aria-hidden="true" />,
  Moon: <Moon className="h-4 w-4" aria-hidden="true" />,
  Sunrise: <Sunrise className="h-4 w-4" aria-hidden="true" />,
  Timer: <Timer className="h-4 w-4" aria-hidden="true" />,
  Beaker: <Beaker className="h-4 w-4" aria-hidden="true" />,
  Mountain: <Mountain className="h-4 w-4" aria-hidden="true" />,
}

interface BadgeGridProps {
  earnedBadges: string[]
}

export function BadgeGrid({ earnedBadges }: BadgeGridProps) {
  const reducedMotion = useReducedMotion()
  const earnedCount = BADGES.filter((badge) => earnedBadges.includes(badge.id)).length

  return (
    <motion.ol
      className="divide-y divide-bw-border border-t border-bw-border"
      role="list"
      aria-label={`${earnedCount} of ${BADGES.length} milestones earned`}
      variants={reducedMotion ? reducedBadgeStagger : badgeStagger}
      initial="hidden"
      animate="show"
    >
      {BADGES.map((badge, index) => {
        const earned = earnedBadges.includes(badge.id)
        const motionConfig = getBadgeMotionConfig(reducedMotion, earned)
        const indexLabel = String(index + 1).padStart(2, '0')

        if (badge.secret && !earned) {
          return (
            <motion.li
              key={badge.id}
              variants={motionConfig.variants}
              data-badge={badge.id}
              data-secret="true"
              aria-label="Secret milestone locked. Not yet discovered."
              className="flex items-center gap-4 py-3"
            >
              <span className="font-display text-base text-bw-tertiary tabular-nums w-7 shrink-0">
                {indexLabel}
              </span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-bw-border text-bw-tertiary">
                <HelpCircle className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-display text-sm text-bw-tertiary">Hidden milestone</span>
                <span className="block text-[11px] text-bw-tertiary leading-tight mt-0.5">
                  Keep practicing — this one reveals itself.
                </span>
              </span>
              <span className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-tertiary shrink-0">
                Locked
              </span>
            </motion.li>
          )
        }

        return (
          <motion.li
            key={badge.id}
            variants={motionConfig.variants}
            whileHover={motionConfig.whileHover}
            transition={motionConfig.transition}
            data-badge={badge.id}
            aria-label={`${badge.name} ${earned ? 'earned' : 'locked'}. ${badge.description}.`}
            className={cn(
              'flex items-center gap-4 py-3 transition-colors duration-300',
              !earned && 'opacity-55',
            )}
          >
            <span
              className={cn(
                'font-display text-base tabular-nums w-7 shrink-0',
                earned ? 'text-bw-accent' : 'text-bw-tertiary',
              )}
            >
              {indexLabel}
            </span>
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center border transition-colors duration-300',
                earned
                  ? 'border-bw-accent bg-bw-accent text-bw-accent-foreground'
                  : 'border-bw-border text-bw-tertiary',
              )}
            >
              {earned ? ICON_MAP[badge.icon] : <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
            </span>
            <span className="flex-1 min-w-0">
              <span
                className={cn(
                  'block font-display text-sm leading-tight',
                  earned ? 'text-bw font-semibold' : 'text-bw-secondary font-medium',
                )}
              >
                {badge.name}
              </span>
              <span className="block text-[11px] text-bw-tertiary leading-snug mt-0.5">
                {badge.description}
              </span>
            </span>
            <span
              className={cn(
                'text-[10px] font-medium uppercase tracking-[0.07em] shrink-0',
                earned ? 'text-bw-accent' : 'text-bw-tertiary',
              )}
            >
              {earned ? 'Earned' : 'Locked'}
            </span>
          </motion.li>
        )
      })}
    </motion.ol>
  )
}
