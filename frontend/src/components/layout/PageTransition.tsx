import { motion } from 'motion/react'
import type { ReactNode } from 'react'

const deceleration = [0.33, 0, 0, 1] as const

/* Opacity only. A leftover translateY transform on the page root would
   create a containing block and break `position: sticky` on the header. */
const variants = {
  enter: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: { duration: 0.35, ease: deceleration },
  },
  exit: {
    opacity: 0,
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
  className?: string
}

export function PageTransition({ children, reducedMotion, className }: PageTransitionProps) {
  return (
    <motion.div
      className={className}
      variants={reducedMotion ? reducedVariants : variants}
      initial="enter"
      animate="visible"
      exit="exit"
    >
      {children}
    </motion.div>
  )
}
