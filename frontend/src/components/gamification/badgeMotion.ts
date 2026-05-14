// No springs — system is decel-only ("apothecary's notebook", not a toy).
const outExpo = [0.16, 1, 0.3, 1] as const
const decelTween = { type: 'tween' as const, duration: 0.32, ease: outExpo }
const instant = { type: 'tween' as const, duration: 0.01 }

export const badgeStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
}

export const reducedBadgeStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0 } },
}

const badgeFade = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: decelTween },
}

const reducedBadgeFade = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: instant },
}

export function getBadgeMotionConfig(reducedMotion: boolean, earned: boolean) {
  return {
    variants: reducedMotion ? reducedBadgeFade : badgeFade,
    transition: reducedMotion ? instant : decelTween,
    whileHover: earned && !reducedMotion ? { opacity: 0.85 } : undefined,
  }
}
