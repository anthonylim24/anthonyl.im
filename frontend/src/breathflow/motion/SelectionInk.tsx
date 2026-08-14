import { motion } from 'motion/react'
import { inkSpring } from './tokens'

export function SelectionInk({
  layoutId,
  reducedMotion,
}: {
  layoutId: string
  reducedMotion: boolean
}) {
  if (reducedMotion) {
    return (
      <span
        aria-hidden="true"
        className="absolute inset-x-0 -bottom-1 h-px bg-bw-accent"
      />
    )
  }

  return (
    <motion.span
      aria-hidden="true"
      layoutId={layoutId}
      className="absolute inset-x-0 -bottom-1 h-px bg-bw-accent"
      transition={inkSpring}
    />
  )
}
