import { useEffect, useId, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ChevronDown, Loader2, Sparkles } from "lucide-react"
import {
  EASE,
  accentChipBtnClass,
  chipBtnClass,
  inputClass,
  labelClass,
  primaryBtnClass,
  softPanelClass,
} from "../ui"

/** Run an AI review, optionally with a one-off focus prompt from the
 *  attached disclosure. */
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
  const promptId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
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

  const run = (withPrompt: boolean) => {
    setOpen(false)
    onRun(withPrompt && prompt.trim() ? prompt.trim() : undefined)
  }

  const solid = variant === "solid"
  const base = solid ? primaryBtnClass : busy ? accentChipBtnClass : chipBtnClass
  const iconSize = solid ? "h-4 w-4" : "h-3.5 w-3.5"

  return (
    <div ref={rootRef} className="trip-split relative inline-flex">
      <button type="button" onClick={() => run(false)} disabled={disabled} className={base}>
        {busy ? (
          <Loader2 className={`${iconSize} animate-spin motion-reduce:animate-none`} aria-hidden />
        ) : (
          <Sparkles className={iconSize} strokeWidth={1.5} aria-hidden />
        )}
        {busy ? busyLabel : label}
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${label} with a custom focus`}
        className={base}
      >
        <ChevronDown className={`${iconSize} transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label={`${label} focus`}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: EASE }}
            className={`absolute right-0 top-[calc(100%+0.5rem)] z-40 w-[20rem] p-3 shadow-xl shadow-stone-950/10 dark:shadow-black/40 ${softPanelClass}`}
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
              <span className="text-[11px] text-stone-500 dark:text-stone-400">⌘↵ to run</span>
              <button type="button" onClick={() => run(true)} className={primaryBtnClass}>
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                {label}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
