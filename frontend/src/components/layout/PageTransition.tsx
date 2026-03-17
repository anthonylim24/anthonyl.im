import { motion } from 'motion/react'
import type { ReactNode } from 'react'

const deceleration = [0.33, 0, 0, 1] as const

const variants = {
  enter: {
    opacity: 0,
    y: 12,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: deceleration },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: { duration: 0.2, ease: [0.4, 0, 1, 1] },
  },
}

const reducedVariants = {
  enter: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.1 } },
  exit: { opacity: 0, transition: { duration: 0.08 } },
}

interface PageTransitionProps {
  children: ReactNode
  reducedMotion?: boolean
}

export function PageTransition({ children, reducedMotion }: PageTransitionProps) {
  return (
    <motion.div
      variants={reducedMotion ? reducedVariants : variants}
      initial="enter"
      animate="visible"
      exit="exit"
    >
      {children}
    </motion.div>
  )
}
