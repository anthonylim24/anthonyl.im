import * as stylex from '@stylexjs/stylex'

/*
 * Lim's loading screen (chat/LimLoader.tsx). While it is up the scene compiles shaders on the main
 * thread, so every animation here is a CSS keyframe or transition on `transform` or `opacity`,
 * which the compositor keeps playing when the page is busy. Tokens are the `--chat-*` vars.
 */
const DESK = '@media (min-width: 1024px)'
const RM = '@media (prefers-reduced-motion: reduce)'
const HOVER = '@media (hover: hover) and (pointer: fine)'
const DISPLAY = '"Fredoka", ui-rounded, "Nunito", system-ui, sans-serif'
const BODY = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'
const UP = 'cubic-bezier(0.2, 0.75, 0.35, 1)'
const DOWN = 'cubic-bezier(0.55, 0, 0.8, 0.35)'
/** Lim's bounce and the jelly's answer to it share one period, so every landing dents the bar. */
const HOP = '920ms'
/** The bar and Lim follow the load with the same jelly overshoot. */
const FOLLOW = 'cubic-bezier(0.3, 1.35, 0.55, 1)'

const contentIn = stylex.keyframes({
  from: { opacity: 0, transform: 'translateY(12px) scale(0.97)' },
  to: { opacity: 1, transform: 'none' },
})
const fadeIn = stylex.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })
const fadeOut = stylex.keyframes({ from: { opacity: 1 }, to: { opacity: 0 } })
const hop = stylex.keyframes({
  '0%': { transform: 'translateY(0) scale(1.22, 0.8)', animationTimingFunction: 'ease-out' },
  '12%': { transform: 'translateY(-4%) scale(0.9, 1.12)', animationTimingFunction: UP },
  '48%': { transform: 'translateY(-60%) scale(0.98, 1.03)', animationTimingFunction: 'ease-in-out' },
  '58%': { transform: 'translateY(-60%) scale(1, 1)', animationTimingFunction: DOWN },
  '92%': { transform: 'translateY(-3%) scale(0.88, 1.14)', animationTimingFunction: 'ease-out' },
  '100%': { transform: 'translateY(0) scale(1.22, 0.8)' },
})
const shadowPulse = stylex.keyframes({
  '0%, 100%': { transform: 'scale(1.15, 1)', opacity: 0.34 },
  '53%': { transform: 'scale(0.55, 0.8)', opacity: 0.1 },
})
const wobble = stylex.keyframes({
  '0%': { transform: 'scale(1.02, 0.8)' },
  '11%': { transform: 'scale(0.99, 1.12)' },
  '24%': { transform: 'scale(1.01, 0.94)' },
  '37%': { transform: 'scale(1, 1.03)' },
  '50%, 100%': { transform: 'scale(1, 1)' },
})
// Each squish and jiggle has a twin (a hair different, or StyleX would merge them into one name) so a
// second poke restarts it without remounting anything.
const squishA = stylex.keyframes({
  '0%': { transform: 'scale(1, 1)' },
  '22%': { transform: 'scale(1.28, 0.72)' },
  '46%': { transform: 'scale(0.86, 1.16)' },
  '68%': { transform: 'scale(1.06, 0.95)' },
  '100%': { transform: 'scale(1, 1)' },
})
const squishB = stylex.keyframes({
  '0%': { transform: 'scale(1, 1)' },
  '22%': { transform: 'scale(1.28, 0.72)' },
  '46%': { transform: 'scale(0.86, 1.16)' },
  '68%': { transform: 'scale(1.05, 0.95)' },
  '100%': { transform: 'scale(1, 1)' },
})
const jiggleA = stylex.keyframes({
  '0%': { transform: 'scale(1, 1)' },
  '18%': { transform: 'scale(1.03, 0.6)' },
  '38%': { transform: 'scale(0.98, 1.3)' },
  '58%': { transform: 'scale(1.01, 0.88)' },
  '78%': { transform: 'scale(1, 1.05)' },
  '100%': { transform: 'scale(1, 1)' },
})
const jiggleB = stylex.keyframes({
  '0%': { transform: 'scale(1, 1)' },
  '18%': { transform: 'scale(1.03, 0.6)' },
  '38%': { transform: 'scale(0.98, 1.3)' },
  '58%': { transform: 'scale(1.01, 0.88)' },
  '78%': { transform: 'scale(1, 1.04)' },
  '100%': { transform: 'scale(1, 1)' },
})
const wordRise = stylex.keyframes({
  '0%': { opacity: 0, transform: 'translateY(0) scale(0.5) rotate(-8deg)' },
  '22%': { opacity: 1, transform: 'translateY(-12px) scale(1.12) rotate(4deg)' },
  '70%': { opacity: 1, transform: 'translateY(-40px) scale(1) rotate(-3deg)' },
  '100%': { opacity: 0, transform: 'translateY(-60px) scale(1) rotate(-4deg)' },
})
const wordStill = stylex.keyframes({
  '0%, 100%': { opacity: 0 },
  '15%, 70%': { opacity: 1 },
})
const bubble = stylex.keyframes({
  '0%': { opacity: 0, transform: 'translate(0, 7px) scale(0.5)' },
  '30%': { opacity: 0.9 },
  '100%': { opacity: 0, transform: 'translate(5px, -9px) scale(1)' },
})
// Lim ends out of sight above the page; it fades there too, or the falling sheet would carry it back down.
const leap = stylex.keyframes({
  '0%': { transform: 'translateY(0) scale(1, 1)', animationTimingFunction: 'ease-out' },
  '26%': { transform: 'translateY(3%) scale(1.3, 0.7)', animationTimingFunction: 'cubic-bezier(0.5, 0, 0.9, 0.5)' },
  '80%': { opacity: 1 },
  '100%': { transform: 'translateY(-115vh) scale(0.74, 1.4)', opacity: 0 },
})
const drop = stylex.keyframes({
  '0%': { transform: 'translateY(0)', animationTimingFunction: 'ease-out' },
  '20%': { transform: 'translateY(-2.5%) scale(1, 1.01)', animationTimingFunction: 'cubic-bezier(0.5, 0, 0.85, 0.3)' },
  '100%': { transform: 'translateY(112%) scale(1, 1.04)' },
})
const cheer = stylex.keyframes({
  '0%': { opacity: 1, transform: 'scale(1, 1)' },
  '10%': { transform: 'scale(1.16, 0.88)' },
  '20%': { transform: 'scale(0.95, 1.06)' },
  '30%': { transform: 'scale(1, 1)' },
  '80%': { opacity: 1, transform: 'translateY(0)' },
  '100%': { opacity: 0, transform: 'translateY(-8px)' },
})
const cheerStill = stylex.keyframes({
  '0%, 80%': { opacity: 1 },
  '100%': { opacity: 0 },
})

const focusRing = {
  outlineWidth: { default: 0, ':focus-visible': '3px' },
  outlineStyle: { default: 'none', ':focus-visible': 'solid' },
  outlineColor: 'var(--chat-focus)',
  outlineOffset: '3px',
} as const

export const loader = stylex.create({
  sheet: {
    position: 'absolute',
    inset: 0,
    zIndex: 60,
    display: 'grid',
    placeItems: 'center',
    paddingTop: 'max(16px, env(safe-area-inset-top, 0px))',
    paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
    paddingInline: '16px',
    // Pastel blobs low on the sheet; the top edge stays plain so the jelly lip above it matches.
    backgroundColor: 'var(--chat-bg)',
    backgroundImage:
      'radial-gradient(circle 62vmax at 0% 100%, color-mix(in srgb, var(--chat-blob-2) 85%, transparent), transparent 70%), ' +
      'radial-gradient(circle 58vmax at 100% 92%, color-mix(in srgb, var(--chat-blob-4) 85%, transparent), transparent 70%), ' +
      'radial-gradient(circle 40vmax at 100% 40%, color-mix(in srgb, var(--chat-blob-1) 60%, transparent), transparent 70%)',
    color: 'var(--chat-text)',
    fontFamily: BODY,
    transformOrigin: '50% 0',
  },
  // The jelly sheet slides off the page like a pudding off its plate. It waits for Lim's leap, and for
  // the stage under it to finish turning from the drawing into the live scene.
  leaving: {
    pointerEvents: 'none',
    animationName: { default: drop, [RM]: fadeOut },
    animationDuration: { default: '480ms', [RM]: '240ms' },
    animationDelay: { default: '240ms', [RM]: '0ms' },
    animationFillMode: 'both',
  },
  leavingQuick: {
    pointerEvents: 'none',
    animationName: fadeOut,
    animationDuration: '180ms',
    animationDelay: '0ms',
    animationTimingFunction: 'ease-out',
    animationFillMode: 'both',
  },
  lip: {
    position: 'absolute',
    left: 0,
    bottom: '100%',
    display: 'block',
    width: '100%',
    height: { default: '28px', [DESK]: '40px' },
    color: 'var(--chat-bg)',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: 'min(100%, 460px)',
    textAlign: 'center',
    // A load that fails within a frame or two never flashes the screen.
    animationName: { default: contentIn, [RM]: fadeIn },
    animationDuration: '560ms',
    animationTimingFunction: EASE,
    animationDelay: '120ms',
    animationFillMode: 'both',
  },
  kicker: {
    margin: 0,
    fontFamily: DISPLAY,
    fontWeight: 500,
    fontSize: '13px',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--chat-mid)',
  },
  title: {
    marginTop: '6px',
    marginBottom: 0,
    fontFamily: DISPLAY,
    fontWeight: 600,
    fontStretch: '112%',
    fontSize: { default: 'clamp(32px, 9vw, 42px)', [DESK]: '54px' },
    lineHeight: 1,
    letterSpacing: '-0.02em',
    textWrap: 'balance',
    color: 'var(--chat-bright)',
  },
  titleAccent: { color: 'var(--chat-accent-deep)' },
  scene: {
    position: 'relative',
    width: '100%',
    height: { default: '196px', [DESK]: '244px' },
    marginTop: { default: '4px', [DESK]: '10px' },
    paddingInline: { default: '50px', [DESK]: '64px' },
    display: 'flex',
    alignItems: 'flex-end',
  },
  // Lim rides the leading edge of the jelly: as wide as the bar, so 100% is the bar's own length.
  rider: {
    position: 'absolute',
    left: { default: '50px', [DESK]: '64px' },
    right: { default: '50px', [DESK]: '64px' },
    bottom: { default: '20px', [DESK]: '24px' },
    height: 0,
    transitionProperty: { default: 'transform', [RM]: 'none' },
    transitionDuration: '640ms',
    transitionTimingFunction: FOLLOW,
  },
  seat: {
    position: 'absolute',
    bottom: 0,
    left: { default: '-50px', [DESK]: '-64px' },
    width: { default: '100px', [DESK]: '128px' },
  },
  shadow: {
    position: 'absolute',
    left: '18%',
    right: '18%',
    bottom: '-4px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: '#5B2D55',
    opacity: 0.3,
    animationName: { default: shadowPulse, [RM]: 'none' },
    animationDuration: HOP,
    animationIterationCount: 'infinite',
    animationTimingFunction: 'linear',
  },
  shadowGone: {
    animationName: fadeOut,
    animationDuration: '200ms',
    animationIterationCount: 1,
    animationFillMode: 'both',
  },
  hop: {
    display: 'block',
    position: 'relative',
    transformOrigin: '50% 100%',
    animationName: { default: hop, [RM]: 'none' },
    animationDuration: HOP,
    animationIterationCount: 'infinite',
  },
  leap: {
    animationName: { default: leap, [RM]: 'none' },
    animationDuration: '380ms',
    animationIterationCount: 1,
    animationFillMode: 'both',
  },
  // The target holds still over the whole hop while Lim bounces inside it. A tap the busy main thread
  // holds back is hit-tested late, so a target that moved with Lim would often be gone by then.
  poke: {
    display: 'block',
    width: '100%',
    padding: 0,
    // Lim's height (188 x 178 art) times the hop's 60% rise.
    paddingTop: '57%',
    borderWidth: 0,
    borderRadius: '999px',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
    ...focusRing,
  },
  squish: { display: 'block', transformOrigin: '50% 100%' },
  squishA: { animationName: { default: squishA, [RM]: 'none' }, animationDuration: '560ms', animationTimingFunction: 'ease-out' },
  squishB: { animationName: { default: squishB, [RM]: 'none' }, animationDuration: '560ms', animationTimingFunction: 'ease-out' },
  art: { display: 'block', width: '100%', height: 'auto', overflow: 'visible' },
  // Beside Lim's head rather than over it, so the bounce never carries Lim's face through the word.
  word: {
    position: 'absolute',
    left: '90%',
    bottom: '40%',
    width: 'max-content',
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontStretch: '115%',
    fontSize: { default: '20px', [DESK]: '24px' },
    color: 'var(--chat-accent-deep)',
    WebkitTextStroke: '5px var(--chat-card)',
    paintOrder: 'stroke fill',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    animationName: { default: wordRise, [RM]: wordStill },
    animationDuration: '1.2s',
    animationTimingFunction: EASE,
    animationFillMode: 'both',
  },
  // Past the middle of the bar the word goes on Lim's other side, so it stays on screen.
  wordLeft: { left: 'auto', right: '90%' },
  track: {
    position: 'relative',
    width: '100%',
    height: { default: '24px', [DESK]: '28px' },
    overflow: 'hidden',
    borderRadius: '999px',
    borderWidth: '2.5px',
    borderStyle: 'solid',
    borderColor: 'color-mix(in srgb, var(--chat-text) 62%, transparent)',
    backgroundColor: 'var(--chat-card)',
    boxShadow: 'inset 0 3px 0 rgba(43, 33, 64, 0.08)',
    transformOrigin: '50% 100%',
    animationName: { default: wobble, [RM]: 'none' },
    animationDuration: HOP,
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-out',
  },
  trackWrap: { width: '100%', transformOrigin: '50% 100%' },
  jiggleA: { animationName: { default: jiggleA, [RM]: 'none' }, animationDuration: '620ms', animationTimingFunction: 'ease-out' },
  jiggleB: { animationName: { default: jiggleB, [RM]: 'none' }, animationDuration: '620ms', animationTimingFunction: 'ease-out' },
  fill: {
    position: 'absolute',
    inset: 0,
    borderRadius: '999px',
    backgroundImage: 'linear-gradient(to bottom, var(--chat-accent-hi), var(--chat-accent) 46%, var(--chat-accent-deep))',
    boxShadow: 'inset 0 -3px 0 rgba(0, 0, 0, 0.1)',
    transitionProperty: { default: 'transform', [RM]: 'none' },
    transitionDuration: '640ms',
    transitionTimingFunction: FOLLOW,
  },
  gloss: {
    position: 'absolute',
    top: '3px',
    left: '12px',
    right: '14px',
    height: '28%',
    borderRadius: '999px',
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
  bubble: {
    position: 'absolute',
    bottom: '4px',
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    opacity: 0,
    animationName: { default: bubble, [RM]: 'none' },
    animationDuration: '1.9s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-out',
  },
  status: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: '10px',
    minHeight: '26px',
    marginTop: { default: '18px', [DESK]: '22px' },
    marginBottom: 0,
    fontFamily: DISPLAY,
    fontWeight: 500,
    fontSize: { default: '17px', [DESK]: '19px' },
    color: 'var(--chat-text)',
  },
  percent: {
    fontFamily: BODY,
    fontWeight: 600,
    fontSize: '14px',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--chat-mid)',
  },
  chatFirst: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    minHeight: '48px',
    marginTop: { default: '22px', [DESK]: '28px' },
    paddingInline: '24px',
    borderRadius: '999px',
    borderWidth: 0,
    backgroundColor: 'var(--chat-user-bg)',
    color: 'var(--chat-user-text)',
    fontFamily: DISPLAY,
    fontWeight: 600,
    fontSize: '17px',
    cursor: 'pointer',
    boxShadow: 'inset 0 -3px 0 rgba(0, 0, 0, 0.18), 0 10px 22px -12px rgba(43, 33, 64, 0.7)',
    transform: { default: null, ':hover': { default: null, [HOVER]: 'translateY(-1px) scale(1.03)' }, ':active': 'scale(0.95, 0.9)' },
    transitionProperty: 'transform',
    transitionDuration: '240ms',
    transitionTimingFunction: SPRING,
    ...focusRing,
  },
  hint: {
    marginTop: '10px',
    marginBottom: 0,
    fontSize: '14px',
    color: 'var(--chat-mid)',
  },
})

/** On the stage while the visitor chats first: how far Lim has come, then a little cheer when it arrives. */
export const pill = stylex.create({
  root: {
    position: 'absolute',
    zIndex: 2,
    left: 0,
    right: 0,
    marginInline: 'auto',
    width: 'max-content',
    maxWidth: 'calc(100% - 32px)',
    // Where the stage's caption sits: up in the sky on phones, along the floor on a desk.
    top: { default: '62px', [DESK]: 'auto' },
    bottom: { default: 'auto', [DESK]: '26px' },
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    paddingBlock: '7px',
    paddingInline: '14px',
    borderRadius: '999px',
    backgroundColor: 'color-mix(in srgb, var(--chat-card) 86%, transparent)',
    boxShadow: '0 8px 20px -14px rgba(43, 33, 64, 0.55)',
    color: 'var(--chat-text)',
    fontFamily: DISPLAY,
    fontWeight: 500,
    fontSize: { default: '13px', [DESK]: '14.5px' },
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    animationName: { default: contentIn, [RM]: fadeIn },
    animationDuration: '420ms',
    animationTimingFunction: EASE,
    animationFillMode: 'both',
  },
  arrived: {
    animationName: { default: cheer, [RM]: cheerStill },
    animationDuration: '2.6s',
    animationTimingFunction: 'ease-out',
  },
  track: {
    position: 'relative',
    flexShrink: 0,
    width: '46px',
    height: '10px',
    overflow: 'hidden',
    borderRadius: '999px',
    borderWidth: '1.5px',
    borderStyle: 'solid',
    borderColor: 'color-mix(in srgb, var(--chat-text) 45%, transparent)',
    backgroundColor: 'var(--chat-card)',
  },
  fill: {
    position: 'absolute',
    inset: 0,
    borderRadius: '999px',
    backgroundColor: 'var(--chat-accent)',
    transitionProperty: { default: 'transform', [RM]: 'none' },
    transitionDuration: '640ms',
    transitionTimingFunction: FOLLOW,
  },
  percent: { fontFamily: BODY, fontWeight: 600, fontSize: '12.5px', fontVariantNumeric: 'tabular-nums', color: 'var(--chat-mid)' },
})

/** The stage's caption comes back only once the arrival cheer has faded. */
export const captionAfterCheer = stylex.create({ late: { transitionDelay: '2.6s' } })
