import { useEffect, useState, useRef } from 'react'
import { motion } from 'motion/react'
import { BADGES } from '@/lib/gamification'
import { formatTime } from '@/lib/utils'
import { ACCENT, ACCENT_BRIGHT, ACHIEVEMENT, PERSONAL_BEST } from '@/lib/palette'
import { Trophy, Zap, Target, Clock, Star, X } from 'lucide-react'
import { CelebrationParticles } from './CelebrationParticles'
import { useHaptics } from '@/hooks/useHaptics'

interface SessionSummaryProps {
  xpEarned: number
  newBadges: string[]
  rounds: number
  durationSeconds: number
  holdTimes: number[]
  isNewPersonalBest: boolean
  onClose: () => void
}

const spring = { type: 'spring' as const, stiffness: 300, damping: 30, mass: 1 }

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.3 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: spring },
}

/** Animated counter that counts up from 0 to `target` */
function AnimatedCounter({ target, prefix = '', suffix = '', className }: {
  target: number
  prefix?: string
  suffix?: string
  className?: string
}) {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number>(0)
  const startRef = useRef<number>(0)

  useEffect(() => {
    if (target <= 0) return

    const duration = Math.min(1200, 400 + target * 8)
    startRef.current = performance.now()

    function tick(now: number) {
      const elapsed = now - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      // ease-out-quart for satisfying deceleration
      const eased = 1 - Math.pow(1 - progress, 4)
      setValue(Math.round(eased * target))

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target])

  return <span className={className}>{prefix}{value}{suffix}</span>
}

export function SessionSummary({
  xpEarned,
  newBadges,
  rounds,
  durationSeconds,
  holdTimes,
  isNewPersonalBest,
  onClose,
}: SessionSummaryProps) {
  const { trigger: haptic } = useHaptics()
  const maxHold = holdTimes.length > 0 ? Math.max(...holdTimes) : 0
  const avgHold =
    holdTimes.length > 0
      ? Math.round(holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length)
      : 0

  const particleCount = isNewPersonalBest ? 60 : newBadges.length > 0 ? 50 : 40

  // Celebration haptic on mount
  useEffect(() => {
    if (isNewPersonalBest) {
      haptic([100, 50, 100, 50, 150], { intensity: 0.9 })
    } else if (newBadges.length > 0) {
      haptic([80, 40, 80, 40, 80], { intensity: 0.7 })
    } else {
      haptic('success')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm"
      style={{ transform: 'translateZ(0)' }}
    >
      {/* Celebration particles behind the card */}
      <CelebrationParticles count={particleCount} />

      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ ...spring, delay: 0.1 }}
        className="relative w-full max-w-sm rounded-3xl bg-white border border-bw-border shadow-2xl overflow-hidden"
      >
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
        >
          <div className="relative px-6 pt-8 pb-4 text-center">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 h-8 w-8 rounded-full bg-bw-active flex items-center justify-center text-bw-tertiary hover:text-bw-secondary transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <motion.div
              variants={fadeUp}
              className="h-16 w-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-foreground"
            >
              <Trophy className="h-8 w-8 text-background" />
            </motion.div>

            <motion.h2
              variants={fadeUp}
              className="font-display text-2xl font-light text-bw tracking-[0.04em]"
            >
              Session Complete
            </motion.h2>

            <motion.div
              variants={fadeUp}
              className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-full"
              style={{ backgroundColor: `${ACCENT}15`, border: `1px solid ${ACCENT}25` }}
            >
              <Zap className="h-4 w-4" style={{ color: ACCENT_BRIGHT }} />
              <AnimatedCounter
                target={xpEarned}
                prefix="+"
                suffix=" XP"
                className="font-bold"
              />
            </motion.div>
          </div>

          <div className="px-6 pb-4">
            <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-bw-hover p-3 text-center">
                <Target className="h-5 w-5 mx-auto mb-1 text-bw-tertiary" />
                <div className="text-xl font-bold text-bw">{rounds}</div>
                <div className="text-xs text-bw-tertiary">Rounds</div>
              </div>
              <div className="rounded-xl bg-bw-hover p-3 text-center">
                <Clock className="h-5 w-5 mx-auto mb-1 text-bw-tertiary" />
                <div className="text-xl font-bold text-bw">
                  {formatTime(durationSeconds)}
                </div>
                <div className="text-xs text-bw-tertiary">Duration</div>
              </div>
            </motion.div>

            {holdTimes.length > 0 && (
              <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 mt-3">
                <div className="rounded-xl bg-bw-hover p-3 text-center">
                  <div className="text-xl font-bold" style={{ color: ACHIEVEMENT }}>
                    <AnimatedCounter target={maxHold} suffix="s" />
                  </div>
                  <div className="text-xs text-bw-tertiary">Best Hold</div>
                </div>
                <div className="rounded-xl bg-bw-hover p-3 text-center">
                  <div className="text-xl font-bold text-bw">
                    <AnimatedCounter target={avgHold} suffix="s" />
                  </div>
                  <div className="text-xs text-bw-tertiary">Avg Hold</div>
                </div>
              </motion.div>
            )}

            {isNewPersonalBest && (
              <motion.div
                variants={fadeUp}
                className="mt-3 p-3 rounded-xl text-center"
                style={{ background: `linear-gradient(to right, ${PERSONAL_BEST}20, ${PERSONAL_BEST}10)`, border: `1px solid ${PERSONAL_BEST}40` }}
              >
                <div className="flex items-center justify-center gap-2">
                  <Star className="h-4 w-4" style={{ color: PERSONAL_BEST }} />
                  <span className="text-sm font-semibold" style={{ color: PERSONAL_BEST }}>
                    New Personal Best!
                  </span>
                  <Star className="h-4 w-4" style={{ color: PERSONAL_BEST }} />
                </div>
              </motion.div>
            )}

            {newBadges.length > 0 && (
              <motion.div variants={fadeUp} className="mt-4 space-y-2">
                <div className="text-xs text-bw-tertiary text-center font-medium uppercase tracking-wider">
                  Badges Unlocked
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {newBadges.map((badgeId) => {
                    const badge = BADGES.find((b) => b.id === badgeId)
                    if (!badge) return null
                    return (
                      <motion.div
                        key={badgeId}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ ...spring, delay: 0.8 }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                        style={{ backgroundColor: `${ACHIEVEMENT}33`, border: `1px solid ${ACHIEVEMENT}4D` }}
                      >
                        <span className="text-xs font-medium" style={{ color: ACHIEVEMENT }}>
                          {badge.name}
                        </span>
                      </motion.div>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </div>

          <motion.div variants={fadeUp} className="px-6 pb-6">
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl text-background font-semibold active:scale-[0.98] transition-all duration-200 bg-foreground"
            >
              Continue
            </button>
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
