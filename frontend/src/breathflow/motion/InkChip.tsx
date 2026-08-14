import { motion } from 'motion/react'
import { useReducedMotion } from '../platform/useReducedMotion'
import { SelectionInk } from './SelectionInk'
import { pressSpring } from './tokens'

export function InkChip({
  active,
  onClick,
  label,
  layoutId,
  className = '',
}: {
  active: boolean
  onClick: () => void
  label: string
  layoutId: string
  className?: string
}) {
  const reducedMotion = useReducedMotion()

  return (
    <motion.button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      whileTap={reducedMotion ? undefined : { scale: 0.98 }}
      transition={pressSpring}
      className={[
        'relative min-h-11 px-1 text-sm',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bw-accent',
        active ? 'font-medium text-bw' : 'text-bw-secondary hover:text-bw',
        className,
      ].join(' ')}
    >
      {label}
      {active ? <SelectionInk layoutId={layoutId} reducedMotion={reducedMotion} /> : null}
    </motion.button>
  )
}
