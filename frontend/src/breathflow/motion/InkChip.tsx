import { motion } from 'motion/react'
import { sx } from '@/styles/merge'
import { bf } from '../styles/breathflow.stylex'
import { useReducedMotion } from '../platform/useReducedMotion'
import { SelectionInk } from './SelectionInk'
import { pressSpring } from './tokens'

export function InkChip({
  active,
  onClick,
  label,
  layoutId,
  compact = false,
}: {
  active: boolean
  onClick: () => void
  label: string
  layoutId: string
  /** Smaller label (history filter chips). */
  compact?: boolean
}) {
  const reducedMotion = useReducedMotion()

  return (
    <motion.button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      whileTap={reducedMotion ? undefined : { scale: 0.98 }}
      transition={pressSpring}
      {...sx(
        bf.inkChip,
        active ? bf.inkChipActive : bf.inkChipInactive,
        compact && bf.inkChipXs,
      )}
    >
      {label}
      {active ? <SelectionInk layoutId={layoutId} reducedMotion={reducedMotion} /> : null}
    </motion.button>
  )
}
