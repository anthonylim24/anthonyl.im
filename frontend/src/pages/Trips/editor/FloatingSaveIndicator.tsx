import { useEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { CheckCircle2, Loader2, Undo2, X } from "lucide-react"
import { ACCENT } from "../theme"
import { ENTER_SPRING, EXIT_FADE, focusRingClass, spinnerClass, wrapAnywhereClass } from "../ui"

export type SaveState = "saved" | "saving" | "dirty" | "error"

/** Both docked surfaces arrive on the same spring and leave on the same short
 *  fade, so the stack reads as one object however it is stacked. */
function dockMotion(reduce: boolean) {
  return {
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, transition: EXIT_FADE },
    transition: reduce ? EXIT_FADE : ENTER_SPRING,
  }
}

/** Bottom-right stack: undo toast above the save pill, both non-blocking. */
export function EditorDock({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
      {children}
    </div>
  )
}

const pillClass =
  "flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium shadow-lg backdrop-blur"

/** Appears while edits are unsaved or in flight, lingers on "Saved" for a
 *  moment, then fades away. */
export function FloatingSaveIndicator({ saveState }: { saveState: SaveState }) {
  const reduce = useReducedMotion()
  const [showSaved, setShowSaved] = useState(false)
  const prev = useRef(saveState)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    if (saveState === "saved" && (prev.current === "saving" || prev.current === "dirty")) {
      setShowSaved(true)
      timer = setTimeout(() => setShowSaved(false), 1800)
    }
    prev.current = saveState
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [saveState])

  const visible = saveState !== "saved" || showSaved
  return (
    <div role="status" aria-live="polite">
      <AnimatePresence>
        {visible && (
          <motion.div
            {...dockMotion(!!reduce)}
            className={`${pillClass} ${
              saveState === "error"
                ? "border-red-200 bg-red-50/95 text-red-800 dark:border-red-900/50 dark:bg-red-950/90 dark:text-red-300"
                : "border-stone-200 bg-white/95 text-stone-600 dark:border-stone-700 dark:bg-stone-900/95 dark:text-stone-300"
            }`}
          >
            {saveState === "error" ? (
              <>
                <X className="h-3.5 w-3.5 text-red-600" aria-hidden />
                Couldn’t save. Retries on your next edit.
              </>
            ) : saveState === "saved" ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                All changes saved
              </>
            ) : (
              <>
                <Loader2 className={`h-3.5 w-3.5 ${spinnerClass} ${ACCENT.text}`} aria-hidden />
                {saveState === "saving" ? "Saving…" : "Unsaved changes…"}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export interface PendingUndo {
  /** Bumps per deletion so a second delete restarts the toast. */
  key: number
  title: string
}

/** Wrapper id so the page can tell whether focus is still parked in the toast
 *  when the undo window closes. */
export const UNDO_TOAST_ID = "trip-undo-toast"

/** Outcome / error copy after enhance. Lives in the dock so it never
 *  inserts a banner above the itinerary and jumps the viewport. */
export function EditorNotice({ notice, onDismiss }: { notice: string | null; onDismiss: () => void }) {
  const reduce = useReducedMotion()
  return (
    <div role="status" aria-live="polite">
      <AnimatePresence>
        {notice && (
          <motion.div
            key={notice}
            {...dockMotion(!!reduce)}
            className={`${pillClass} pointer-events-auto max-w-[min(24rem,calc(100vw-2.5rem))] items-start border-stone-300 bg-white/95 py-2.5 text-stone-700 dark:border-stone-700 dark:bg-stone-900/95 dark:text-stone-200`}
          >
            <span className={`min-w-0 text-left leading-snug ${wrapAnywhereClass}`}>{notice}</span>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss notice"
              className={`-mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-stone-500 transition hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100 ${focusRingClass}`}
            >
              <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Six-second reprieve after a delete — the editor's only undo affordance.
 *  Takes focus on appearing, because the delete button that had focus is the
 *  control that just unmounted. */
export function UndoToast({ undo, onUndo }: { undo: PendingUndo | null; onUndo: () => void }) {
  const reduce = useReducedMotion()
  return (
    <div id={UNDO_TOAST_ID} role="status" aria-live="polite">
      <AnimatePresence>
        {undo && (
          <motion.div
            key={undo.key}
            {...dockMotion(!!reduce)}
            className={`${pillClass} pointer-events-auto border-stone-300 bg-white/95 text-stone-700 dark:border-stone-700 dark:bg-stone-900/95 dark:text-stone-200`}
          >
            <span className="max-w-[14rem] truncate">
              Deleted {undo.title ? `“${undo.title}”` : "this item"}
            </span>
            <button
              type="button"
              autoFocus
              onClick={onUndo}
              className={`-my-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 font-semibold text-[color:var(--ta)] transition hover:text-[color:var(--ta-strong)] ${focusRingClass}`}
            >
              <Undo2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
