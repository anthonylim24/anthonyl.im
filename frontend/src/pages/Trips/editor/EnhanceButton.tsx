import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronDown, Loader2, Sparkles } from "lucide-react"
import {
  EASE,
  accentChipBtnClass,
  chipBtnClass,
  inputClass,
  labelClass,
  mutedInkClass,
  primaryBtnClass,
  softPanelClass,
  spinnerClass,
} from "../ui"

const SHEET_MQ = "(max-width: 639px)"
const GUTTER = 8
const DESKTOP_WIDTH = 320

type PanelMode = "sheet" | "anchored"
type PanelPos = { top: number; left: number; width: number; placement: "below" | "above" }

/** Keep the custom-focus panel inside the viewport. Used on desktop; phones
 *  get a bottom sheet instead. */
export function clampEnhancePanel(
  trigger: { top: number; bottom: number; right: number },
  panelHeight: number,
  viewport: { width: number; height: number },
  opts?: { gutter?: number; maxWidth?: number },
): PanelPos {
  const gutter = opts?.gutter ?? GUTTER
  const width = Math.min(opts?.maxWidth ?? DESKTOP_WIDTH, viewport.width - gutter * 2)
  const spaceBelow = viewport.height - trigger.bottom
  const spaceAbove = trigger.top
  const placement: "below" | "above" =
    spaceBelow < panelHeight + gutter && spaceAbove > spaceBelow ? "above" : "below"
  const top =
    placement === "below"
      ? Math.min(trigger.bottom + gutter, viewport.height - panelHeight - gutter)
      : Math.max(gutter, trigger.top - gutter - panelHeight)
  const left = Math.max(gutter, Math.min(trigger.right - width, viewport.width - width - gutter))
  return { top, left, width, placement }
}

function isSheetViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia(SHEET_MQ).matches
}

/** Run an AI review, optionally with a one-off focus prompt from the
 *  attached disclosure. The prompt panel is portaled so it never clips
 *  inside a card, and on phones it becomes a bottom sheet instead of a
 *  20rem popover that can hang off the screen. */
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
  const [mode, setMode] = useState<PanelMode>("anchored")
  const [pos, setPos] = useState<PanelPos | null>(null)
  const [kbInset, setKbInset] = useState(0)
  const promptId = useId()
  const reduce = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const disclosureRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = (restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) disclosureRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node
      if (rootRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("touchstart", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("touchstart", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const update = () => {
      const sheet = isSheetViewport()
      setMode(sheet ? "sheet" : "anchored")
      if (sheet) {
        setPos(null)
        return
      }
      const trigger = rootRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const measured = panelRef.current?.offsetHeight ?? 0
      const height = measured > 0 ? measured : 180
      setPos(
        clampEnhancePanel(rect, height, { width: window.innerWidth, height: window.innerHeight }),
      )
    }
    update()
    const raf = requestAnimationFrame(update)
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [open, prompt])

  useEffect(() => {
    const vv = window.visualViewport
    if (!open || !vv || mode !== "sheet") return
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setKbInset(inset > 120 ? inset : 0)
    }
    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
      setKbInset(0)
    }
  }, [open, mode])

  useEffect(() => {
    if (!open || mode !== "sheet") return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open, mode])

  const run = (withPrompt: boolean) => {
    setOpen(false)
    onRun(withPrompt && prompt.trim() ? prompt.trim() : undefined)
  }

  const solid = variant === "solid"
  const base = solid ? primaryBtnClass : busy ? accentChipBtnClass : chipBtnClass
  const iconSize = solid ? "h-4 w-4" : "h-3.5 w-3.5"
  const sheet = mode === "sheet"

  const panel = (
    <motion.div
      ref={panelRef}
      role="dialog"
      aria-label={`${label} focus`}
      initial={reduce ? { opacity: 0 } : sheet ? { opacity: 0, y: 24 } : { opacity: 0, y: -6, scale: 0.98 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : sheet ? { opacity: 0, y: 16 } : { opacity: 0 }}
      transition={{ duration: reduce ? 0.12 : 0.16, ease: EASE }}
      className={
        sheet
          ? `fixed inset-x-0 z-[70] mx-auto w-full max-w-lg rounded-t-2xl border border-stone-200/80 bg-[var(--trips-surface)] p-4 shadow-2xl dark:border-stone-800 ${softPanelClass}`
          : `fixed z-[70] p-3 shadow-xl shadow-stone-950/10 dark:shadow-black/40 ${softPanelClass}`
      }
      style={
        sheet
          ? { bottom: kbInset > 0 ? kbInset : 0 }
          : pos
            ? { top: pos.top, left: pos.left, width: pos.width }
            : { top: -9999, left: -9999, width: DESKTOP_WIDTH, visibility: "hidden" }
      }
    >
      <label className={labelClass} htmlFor={promptId}>
        Focus for this review
      </label>
      <textarea
        id={promptId}
        value={prompt}
        rows={3}
        autoFocus
        placeholder={promptPlaceholder}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(true)
        }}
        className={`mt-1.5 ${inputClass}`}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={`text-[11px] ${mutedInkClass}`}>
          {sheet ? "Leave blank for a full pass." : "⌘↵ to run"}
        </span>
        <button type="button" onClick={() => run(true)} className={primaryBtnClass}>
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          {label}
        </button>
      </div>
    </motion.div>
  )

  return (
    <div ref={rootRef} className="trip-split relative inline-flex">
      <button type="button" onClick={() => run(false)} disabled={disabled} className={base}>
        {busy ? (
          <Loader2 className={`${iconSize} ${spinnerClass}`} aria-hidden />
        ) : (
          <Sparkles className={iconSize} strokeWidth={1.5} aria-hidden />
        )}
        {busy ? busyLabel : label}
      </button>
      <button
        ref={disclosureRef}
        type="button"
        onClick={() => (open ? close(false) : setOpen(true))}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${label} with a custom focus`}
        className={base}
      >
        <ChevronDown className={`${iconSize} transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <>
                {sheet && (
                  <motion.div
                    key="enhance-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16 }}
                    onClick={() => close(false)}
                    className="fixed inset-0 z-[65] bg-stone-950/40"
                    aria-hidden
                  />
                )}
                {panel}
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  )
}
