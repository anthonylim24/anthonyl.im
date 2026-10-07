import { sx } from '@/lib/utils'
import { styles } from '../trips.stylex'
import { useEffect, useId, useState, useRef } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronDown, Loader2, Sparkles } from "lucide-react"
import {
  EASE,
  accentChipBtnClass,
  chipBtnClass,
  ghostBtnClass,
  hintClass,
  inputClass,
  labelClass,
  primaryBtnClass,
  railBandClass,
  runTripsViewTransition,
  scrimClass,
  softPanelClass,
  spinnerClass,
  tripsPortalClass,
  typeSectionClass,
} from "../ui"

const SHEET_MQ = "(max-width: 639px)"

type PanelMode = "sheet" | "dialog"

function isSheetViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia(SHEET_MQ).matches
}

/** Run an AI review, optionally with a one-off focus prompt from the
 *  attached disclosure. The prompt opens as a real dialog: opaque sheet,
 *  scrim, and a named Run action. */
export function EnhanceButton({
  label,
  busyLabel,
  busy,
  disabled,
  variant,
  promptPlaceholder,
  onRun,
}: {
  label: string
  busyLabel: string
  busy: boolean
  disabled: boolean
  variant: "solid" | "outline"
  promptPlaceholder: string
  onRun: (prompt?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [mode, setMode] = useState<PanelMode>("dialog")
  const [kbInset, setKbInset] = useState(0)
  const promptId = useId()
  const titleId = useId()
  const reduce = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const disclosureRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const canVt =
    typeof document !== "undefined" && "startViewTransition" in document && !reduce

  const close = (restoreFocus: boolean) => {
    runTripsViewTransition(() => setOpen(false))
    if (restoreFocus) disclosureRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    setMode(isSheetViewport() ? "sheet" : "dialog")
    const onResize = () => setMode(isSheetViewport() ? "sheet" : "dialog")
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [open])

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const focusable = panel?.querySelector<HTMLElement>("textarea, button, input")
    focusable?.focus({ preventScroll: true })
    let closing = false
    const onFocus = (e: FocusEvent) => {
      if (closing) return
      if (!panel || panel.contains(e.target as Node) || rootRef.current?.contains(e.target as Node)) return
      focusable?.focus({ preventScroll: true })
    }
    document.addEventListener("focusin", onFocus)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        close(true)
        return
      }
      if (e.key !== "Tab" || !panel) return
      const nodes = [...panel.querySelectorAll<HTMLElement>("textarea, button, input")]
      if (nodes.length === 0) return
      const first = nodes[0]!
      const last = nodes[nodes.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("focusin", onFocus)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  useEffect(() => {
    const vv = window.visualViewport
    if (!open || !vv || mode !== "sheet") return
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setKbInset(inset > 120 ? inset : 0)
    }
    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update, { passive: true })
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
      setKbInset(0)
    }
  }, [open, mode])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const run = (withPrompt: boolean) => {
    runTripsViewTransition(() => setOpen(false))
    onRun(withPrompt && prompt.trim() ? prompt.trim() : undefined)
  }

  const solid = variant === "solid"
  const base = solid ? primaryBtnClass : busy ? accentChipBtnClass : chipBtnClass
  const iconStyle = solid ? styles.iconSm : styles.icon35
  const sheet = mode === "sheet"

  const panel = (
    <motion.div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      initial={canVt || reduce ? { opacity: 0 } : sheet ? { opacity: 0, y: 24 } : { opacity: 0, y: 8 }}
      animate={canVt || reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={canVt || reduce ? { opacity: 0 } : sheet ? { opacity: 0, y: 16 } : { opacity: 0, y: 6 }}
      transition={{ duration: reduce ? 0.12 : 0.18, ease: EASE }}
      {...sx(sheet ? styles.enhancePanelSheet : styles.enhancePanelDialog, softPanelClass)}
      style={{
        ...(sheet ? { bottom: kbInset > 0 ? kbInset : 0 } : undefined),
        viewTransitionName: "trips-enhance",
      }}
    >
      <h2 id={titleId} {...sx(typeSectionClass)}>
        Focus this review
      </h2>
      <p {...sx(hintClass)}>
        Adds places when a day has room, then explains why. Leave the focus blank for a full pass.
      </p>
      <label {...sx(styles.mt4, labelClass)} htmlFor={promptId}>
        Optional focus
      </label>
      <textarea
        id={promptId}
        value={prompt}
        rows={4}
        placeholder={promptPlaceholder}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(true)
        }}
        {...sx(styles.mt1_5, inputClass)}
      />
      <p {...sx(styles.mt3, hintClass)}>
        {sheet ? "Swipe down or press Escape to close." : "⌘↵ runs the review."}
      </p>
      <div {...sx(styles.enhanceFooter, railBandClass)}>
        <button type="button" onClick={() => close(true)} {...sx(ghostBtnClass)}>
          Cancel
        </button>
        <button type="button" onClick={() => run(true)} {...sx(primaryBtnClass)}>
          <Sparkles {...sx(styles.icon35)} strokeWidth={1.5} aria-hidden />
          Run enhance
        </button>
      </div>
    </motion.div>
  )

  return (
    <div ref={rootRef} {...sx('trip-split', styles.enhanceSplit)}>
      <button type="button" onClick={() => run(false)} disabled={disabled} {...sx(base)}>
        {busy ? (
          <Loader2 {...sx(iconStyle, spinnerClass)} aria-hidden />
        ) : (
          <Sparkles {...sx(iconStyle)} strokeWidth={1.5} aria-hidden />
        )}
        {busy ? busyLabel : label}
      </button>
      <button
        ref={disclosureRef}
        type="button"
        onClick={(e) => {
          if (open) return close(false)
          // Only the button being opened carries the morph name: a page has one
          // Enhance per day, and duplicate names abort every view transition.
          e.currentTarget.style.viewTransitionName = "trips-enhance"
          runTripsViewTransition(() => setOpen(true))
        }}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${label} with a custom focus`}
        {...sx(base)}
        style={{ viewTransitionName: open ? "none" : undefined }}
      >
        <ChevronDown
          {...sx(styles.transitionTransform, iconStyle, open ? styles.rotate180 : null)}
          aria-hidden
        />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <div
                key="enhance-layer"
                {...sx(tripsPortalClass)}
                data-trip-accent={
                  document.querySelector("[data-trip-accent]")?.getAttribute("data-trip-accent") ??
                  undefined
                }
              >
                <div {...sx(sheet ? styles.enhanceContents : styles.enhanceLayerCenter)}>
                  <motion.div
                    key="enhance-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16 }}
                    onClick={() => close(true)}
                    {...sx(scrimClass)}
                    aria-hidden
                  />
                  {panel}
                </div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  )
}
