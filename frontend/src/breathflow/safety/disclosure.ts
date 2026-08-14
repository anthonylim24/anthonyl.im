/** Global safety disclosure — single source for Settings and session setup. */
export const SAFETY_DISCLOSURE = {
  title: 'Wellness education, not medical care',
  points: [
    'BreathFlow teaches breathing exercises for general wellness. It does not diagnose, treat, or replace medical care.',
    'Practice in a safe position — seated or lying down, never while driving, standing, or in water.',
    'Stop immediately if you feel dizzy, faint, panicked, or notice chest pain.',
    'Seek medical care for severe or persistent symptoms.',
    'Consult a clinician before breath holds or forceful breathing if you are pregnant, or have cardiovascular, respiratory, neurological, or fainting concerns.',
  ],
} as const

/** Copy for the in-car / constrained-viewport advanced-protocol block. */
export const CONSTRAINED_VIEWPORT_MESSAGE =
  'Breath holds and fast breathing are unavailable in this viewing mode. Use Cyclic Sighing or Resonance Breathing instead.'
