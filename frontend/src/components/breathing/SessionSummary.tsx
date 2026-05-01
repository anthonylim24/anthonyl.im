import { useEffect, useState, useRef, type KeyboardEvent } from 'react'
import { motion } from 'motion/react'
import { BADGES } from '@/lib/gamification'
import { formatTime } from '@/lib/utils'
import { buildSessionInsight } from '@/lib/sessionInsights'
import type { TechniqueId } from '@/lib/constants'
import { getProtocol } from '@/lib/breathingProtocols'
import { Trophy, Zap, Target, Clock, Star, X, Sparkles, Activity, ArrowRight, RotateCcw } from 'lucide-react'
import { CelebrationParticles } from './CelebrationParticles'
import { useHaptics } from '@/hooks/useHaptics'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { reducedMotionTransition, useEntranceMotion } from '@/lib/motionPresets'

interface SessionSummaryProps {
  techniqueId: TechniqueId
  xpEarned: number
  newBadges: string[]
  rounds: number
  durationSeconds: number
  holdTimes: number[]
  isNewPersonalBest: boolean
  onClose: () => void
  onRepeat?: () => void
}

/** Animated counter that counts up from 0 to `target` */
function AnimatedCounter({ target, prefix = '', suffix = '', className }: {
  target: number
  prefix?: string
  suffix?: string
  className?: string
}) {
  const reducedMotion = useReducedMotion()
  const [value, setValue] = useState(0)
  const rafRef = useRef<number>(0)
  const startRef = useRef<number>(0)

  useEffect(() => {
    if (reducedMotion) {
      return
    }

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
  }, [reducedMotion, target])

  const displayedValue = reducedMotion ? target : value

  return <span className={className}>{prefix}{displayedValue}{suffix}</span>
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function SessionSummary({
  techniqueId,
  xpEarned,
  newBadges,
  rounds,
  durationSeconds,
  holdTimes,
  isNewPersonalBest,
  onClose,
  onRepeat,
}: SessionSummaryProps) {
  const { trigger: haptic } = useHaptics()
  const dialogRef = useRef<HTMLDivElement>(null)
  const continueButtonRef = useRef<HTMLButtonElement>(null)
  const { reducedMotion, stagger, fadeUp, spring } = useEntranceMotion({
    offset: 16,
    staggerChildren: 0.1,
    delayChildren: 0.3,
  })
  const protocol = getProtocol(techniqueId)
  const maxHold = holdTimes.length > 0 ? Math.max(...holdTimes) : 0
  const avgHold =
    holdTimes.length > 0
      ? Math.round(holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length)
      : 0
  const insight = buildSessionInsight({
    techniqueId,
    rounds,
    durationSeconds,
    holdTimes,
    isNewPersonalBest,
    newBadgeCount: newBadges.length,
  })
  const isSafetyGatedProtocol = (protocol.safetyChecklist?.length ?? 0) > 0
  const canRepeatSession = Boolean(onRepeat) && !isSafetyGatedProtocol
  const showRecoveryReminder = Boolean(onRepeat) && isSafetyGatedProtocol
  const initialCelebrationRef = useRef<{
    haptic: typeof haptic
    isNewPersonalBest: boolean
    newBadgeCount: number
  } | null>(null)

  if (initialCelebrationRef.current === null) {
    initialCelebrationRef.current = {
      haptic,
      isNewPersonalBest,
      newBadgeCount: newBadges.length,
    }
  }

  const particleCount = isNewPersonalBest ? 60 : newBadges.length > 0 ? 50 : 40

  // Celebration haptic on mount
  useEffect(() => {
    const celebration = initialCelebrationRef.current
    if (!celebration) return

    if (celebration.isNewPersonalBest) {
      celebration.haptic([100, 50, 100, 50, 150], { intensity: 0.9 })
    } else if (celebration.newBadgeCount > 0) {
      celebration.haptic([80, 40, 80, 40, 80], { intensity: 0.7 })
    } else {
      celebration.haptic('success')
    }
  }, [])

  useEffect(() => {
    continueButtonRef.current?.focus()
  }, [])

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }

    if (event.key !== 'Tab') {
      return
    }

    const dialog = dialogRef.current
    if (!dialog) return

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    )

    if (focusable.length === 0) {
      event.preventDefault()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const activeElement = document.activeElement

    if (event.shiftKey) {
      if (activeElement === first || !dialog.contains(activeElement)) {
        event.preventDefault()
        last.focus()
      }
      return
    }

    if (activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <motion.div
      ref={dialogRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reducedMotion ? reducedMotionTransition : { duration: 0.3 }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[color:var(--bw-dialog-scrim)] p-4 breathwork"
      style={{ transform: 'translateZ(0)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-summary-title"
      onKeyDown={handleDialogKeyDown}
    >
      {/* Celebration particles behind the card */}
      <CelebrationParticles count={particleCount} />

      <motion.div
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 20 }}
        animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        transition={reducedMotion ? reducedMotionTransition : { ...spring, delay: 0.1 }}
        className="relative my-auto w-full max-w-lg border border-bw-border bg-bw-canvas overflow-hidden"
      >
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
        >
          <div className="relative px-6 pt-8 pb-5 text-center sm:px-8">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close session summary"
              className="absolute top-4 right-4 flex h-11 w-11 items-center justify-center border border-bw-border text-bw-tertiary transition-colors hover:text-bw-secondary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>

            <motion.div
              variants={fadeUp}
              className="h-16 w-16 flex items-center justify-center mx-auto mb-4 bg-bw-accent text-bw-accent-foreground"
            >
              <Trophy className="h-8 w-8" />
            </motion.div>

            <motion.h2
              id="session-summary-title"
              variants={fadeUp}
              className="font-display text-4xl font-semibold text-bw leading-none"
            >
              Session Complete
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-2 text-xs text-bw-tertiary">
              {protocol.name} · {insight.doseLabel}
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="inline-flex items-center gap-2 mt-3"
            >
              <Zap className="h-4 w-4 text-bw-accent" />
              <AnimatedCounter
                target={xpEarned}
                prefix="+"
                suffix=" XP"
                className="font-mono font-medium text-bw"
              />
            </motion.div>
          </div>

          <div className="px-6 pb-5 sm:px-8">
            <motion.div variants={fadeUp} className="grid grid-cols-[auto_1fr] gap-5 border-y border-bw-border py-5">
              <div className="flex h-20 w-20 flex-col items-center justify-center border border-bw-border">
                <span className="font-mono text-2xl text-bw tabular-nums">
                  <AnimatedCounter target={insight.score} />
                </span>
                <span className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-tertiary">
                  Score
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-bw-secondary">
                  <Activity className="h-4 w-4 text-bw-accent" aria-hidden="true" />
                  <span className="text-[10px] font-medium uppercase tracking-[0.07em]">
                    Session Insight · {insight.scoreLabel}
                  </span>
                </div>
                <h3 className="mt-2 font-display text-2xl font-semibold leading-none text-bw">
                  {insight.effectLabel}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-bw-tertiary">
                  {insight.effectDescription}
                </p>
              </div>
            </motion.div>

            <motion.div variants={fadeUp} className="grid grid-cols-2 gap-x-6 border-b border-bw-border py-4 sm:grid-cols-4">
              <div>
                <div className="flex items-center gap-1.5 text-bw-secondary">
                  <Target className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-medium uppercase tracking-[0.07em]">Rounds</span>
                </div>
                <div className="mt-1 font-mono text-sm font-medium text-bw tabular-nums">{rounds}</div>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-bw-secondary">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-medium uppercase tracking-[0.07em]">Duration</span>
                </div>
                <div className="mt-1 font-mono text-sm font-medium text-bw tabular-nums">
                  {formatTime(durationSeconds)}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-bw-secondary">
                  <Zap className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-medium uppercase tracking-[0.07em]">XP</span>
                </div>
                <div className="mt-1 font-mono text-sm font-medium text-bw tabular-nums">
                  +{xpEarned}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-bw-secondary">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-medium uppercase tracking-[0.07em]">Dose</span>
                </div>
                <div className="mt-1 text-xs font-medium text-bw">{insight.doseLabel}</div>
              </div>
            </motion.div>

            {holdTimes.length > 0 && (
              <motion.div variants={fadeUp} className="divide-y divide-bw-border">
                <div className="flex items-center justify-between py-3">
                  <span className="text-xs font-medium uppercase tracking-wider text-bw-secondary">Best Hold</span>
                  <span className="text-sm font-mono font-medium text-bw tabular-nums">
                    <AnimatedCounter target={maxHold} suffix="s" />
                  </span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="text-xs font-medium uppercase tracking-wider text-bw-secondary">Avg Hold</span>
                  <span className="text-sm font-mono font-medium text-bw tabular-nums">
                    <AnimatedCounter target={avgHold} suffix="s" />
                  </span>
                </div>
              </motion.div>
            )}

            {isNewPersonalBest && (
              <motion.div
                variants={fadeUp}
                className="mt-3 p-3 text-center border border-bw-border bg-bw-active"
              >
                <div className="flex items-center justify-center gap-2">
                  <Star className="h-4 w-4 text-bw-secondary" />
                  <span className="text-sm font-medium text-bw">
                    New Personal Best
                  </span>
                  <Star className="h-4 w-4 text-bw-secondary" />
                </div>
              </motion.div>
            )}

            <motion.div variants={fadeUp} className="mt-4 border border-bw-border p-4">
              <div className="flex items-start gap-3">
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-bw-accent" />
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary">
                    Next step
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-bw-tertiary">
                    {insight.nextStep}
                  </p>
                </div>
              </div>
            </motion.div>

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
                        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
                        animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                        transition={reducedMotion ? reducedMotionTransition : { ...spring, delay: 0.8 }}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-bw-border"
                      >
                        <span className="text-xs font-medium text-bw">
                          {badge.name}
                        </span>
                      </motion.div>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </div>

          <motion.div
            variants={fadeUp}
            className="grid gap-2 px-6 pb-6 sm:px-8"
            style={canRepeatSession ? { gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' } : undefined}
          >
            {showRecoveryReminder ? (
              <div
                role="note"
                data-testid="summary-recovery-reminder"
                className="border border-bw-border bg-bw-active px-4 py-3"
              >
                <div className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary">
                  Recovery first
                </div>
                <p className="mt-1 text-xs leading-relaxed text-bw-tertiary">
                  Return to relaxed nasal breathing before another advanced set.
                </p>
              </div>
            ) : null}
            {canRepeatSession ? (
              <button
                type="button"
                onClick={onRepeat}
                className="inline-flex min-h-11 items-center justify-center gap-2 border border-bw-border py-3 text-sm font-medium text-bw-secondary transition-colors hover:bg-bw-hover hover:text-bw"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Repeat
              </button>
            ) : null}
            <button
              ref={continueButtonRef}
              type="button"
              onClick={onClose}
              className="min-h-11 w-full border border-bw-accent bg-bw-accent py-3 font-medium text-bw-accent-foreground transition-all duration-200 active:scale-[0.98]"
            >
              Continue
            </button>
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
