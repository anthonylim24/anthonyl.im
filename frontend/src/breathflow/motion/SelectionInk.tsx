import { motion } from 'motion/react'
import { sx } from '@/styles/merge'
import { bf } from '../styles/breathflow.stylex'
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
        {...sx(bf.selectionInk)}
      />
    )
  }

  return (
    <motion.span
      aria-hidden="true"
      layoutId={layoutId}
      {...sx(bf.selectionInk)}
      transition={inkSpring}
    />
  )
}
