const spring = { type: 'spring' as const, stiffness: 300, damping: 30, mass: 1 }
const instant = { type: 'tween' as const, duration: 0.01 }

export const badgeStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
}

export const reducedBadgeStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0 } },
}

const badgePop = {
  hidden: { opacity: 0, scale: 0.8 },
  show: { opacity: 1, scale: 1, transition: spring },
}

const reducedBadgePop = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: instant },
}

export function getBadgeMotionConfig(reducedMotion: boolean, earned: boolean) {
  return {
    variants: reducedMotion ? reducedBadgePop : badgePop,
    transition: reducedMotion ? instant : spring,
    whileHover: earned && !reducedMotion ? { scale: 1.05 } : undefined,
  }
}
