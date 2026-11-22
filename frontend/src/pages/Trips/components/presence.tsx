import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type AnimationEvent, type ReactNode } from "react"

// Overlays leave the way they came instead of vanishing in one frame. Two
// pieces, for the two ways an overlay is put on screen:
//
// - `Presence` wraps a caller that mounts a dialog only while something is
//   set (`{shareId && <ShareDialog …/>}`). It keeps the dialog mounted with
//   the last value while the kit dialog inside animates out, and tells that
//   dialog it is closing even though the caller still passes `open`.
// - `useLeaving` is for an element a component shows itself (a menu, the
//   calendar): it stays mounted, inert, until its own exit animation ends.
//
// The exit animations live in index.css (Trips blocks), keyed on
// `data-state="closed"`, transform and opacity only.

/** Longest exit (the 220 ms phone sheet) plus slack for a busy main thread. */
const EXIT_DEADLINE_MS = 600

interface Closing {
  /** True once the caller let go: the dialog inside should animate out. */
  closing: boolean
  /** The dialog inside has finished leaving (its content unmounted). */
  exited: () => void
}

const ClosingContext = createContext<Closing | null>(null)

/** Whether the surrounding `Presence` is closing what it holds. */
export function useClosing(): boolean {
  return useContext(ClosingContext)?.closing ?? false
}

/**
 * Rendered inside a dialog's Content, which Radix keeps mounted until its
 * closing animation ends: its unmount is the end of a `Presence` exit.
 */
export function ExitSignal() {
  const exited = useContext(ClosingContext)?.exited
  useEffect(() => () => exited?.(), [exited])
  return null
}

/**
 * Renders `children(value)` while `when` is set, and for the length of the
 * exit after it is cleared, with the value it last had. `when` must be stable
 * between renders (state, an id, a boolean): a new object every render reads
 * as a new overlay each time.
 */
export function Presence<T>({ when, children }: { when: T | null | undefined | false; children: (value: T) => ReactNode }) {
  const [seen, setSeen] = useState(when)
  /** The value shown while leaving; null when nothing is leaving. */
  const [leaving, setLeaving] = useState<{ value: T } | null>(null)
  if (when !== seen) {
    setSeen(when)
    setLeaving(!when && seen ? { value: seen } : null)
  }

  const exited = useCallback(() => setLeaving(null), [])
  // A dialog that never mounted (its chunk still loading) reports nothing.
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(exited, EXIT_DEADLINE_MS)
    return () => clearTimeout(timer)
  }, [leaving, exited])

  const closing = !when && leaving !== null
  const context = useMemo(() => ({ closing, exited }), [closing, exited])
  const value = when || leaving?.value
  if (!value) return null
  return <ClosingContext.Provider value={context}>{children(value)}</ClosingContext.Provider>
}

/** Whether `node` has an exit animation to wait for (none under test DOMs). */
function animates(node: HTMLElement | null): boolean {
  if (!node || typeof getComputedStyle !== "function") return false
  const name = getComputedStyle(node).animationName
  return Boolean(name) && name !== "none"
}

/**
 * Keeps an element mounted after `open` turns false until its exit
 * animation ends. Spread `bind` on the element: it marks the closing state
 * (`data-state="closed"`, which index.css animates), makes the element inert
 * so no focus or click lands on it, and hides it from assistive tech at once.
 */
export function useLeaving<E extends HTMLElement = HTMLDivElement>(open: boolean) {
  const [seen, setSeen] = useState(open)
  const [leaving, setLeaving] = useState(false)
  if (open !== seen) {
    setSeen(open)
    setLeaving(!open)
  }
  const ref = useRef<E | null>(null)

  useEffect(() => {
    if (!leaving) return
    // The animation ends it; this is the backstop, or the whole of it when
    // nothing animates.
    const timer = setTimeout(() => setLeaving(false), animates(ref.current) ? EXIT_DEADLINE_MS : 0)
    return () => clearTimeout(timer)
  }, [leaving])

  const onAnimationEnd = useCallback(
    (event: AnimationEvent<E>) => {
      if (leaving && event.target === event.currentTarget) setLeaving(false)
    },
    [leaving],
  )

  return {
    present: open || leaving,
    bind: {
      ref,
      "data-state": open ? "open" : "closed",
      inert: !open,
      "aria-hidden": open ? undefined : true,
      onAnimationEnd,
    } as const,
  }
}
