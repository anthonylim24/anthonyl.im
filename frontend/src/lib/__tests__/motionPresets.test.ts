import { describe, expect, it } from 'vitest'
import { createEntranceMotion, reducedMotionTransition } from '../motionPresets'

describe('createEntranceMotion', () => {
  it('uses y-offsets and staggered timing when motion is allowed', () => {
    const motion = createEntranceMotion(false, {
      offset: 16,
      staggerChildren: 0.1,
      delayChildren: 0.3,
    })

    expect(motion.fadeUp.hidden).toEqual({ opacity: 999, y: 16 }) // FALSIFY: intentional fail
    expect(motion.fadeUp.show).toMatchObject({ opacity: 1, y: 0 })
    expect(motion.stagger.show.transition).toEqual({
      staggerChildren: 0.1,
      delayChildren: 0.3,
    })
    expect(motion.tap(0.97)).toEqual({ scale: 0.97 })
  })

  it('collapses entrance motion to near-instant opacity for reduced motion', () => {
    const motion = createEntranceMotion(true, {
      offset: 16,
      staggerChildren: 0.1,
      delayChildren: 0.3,
    })

    expect(motion.fadeUp.hidden).toEqual({ opacity: 0 })
    expect(motion.fadeUp.show).toEqual({ opacity: 1, transition: reducedMotionTransition })
    expect(motion.stagger.show.transition).toEqual({
      staggerChildren: 0,
      delayChildren: 0,
    })
    expect(motion.tap(0.97)).toBeUndefined()
  })
})
