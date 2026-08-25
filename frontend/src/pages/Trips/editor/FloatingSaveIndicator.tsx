import { useEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { CheckCircle2, Loader2, Undo2, X } from "lucide-react"
import { ACCENT } from "../theme"
import { ENTER_SPRING, EXIT_FADE, focusRingClass, iconBtnClass, spinnerClass, toastClass, wrapAnywhereClass } from "../ui"
import { sx } from '@/lib/utils'
import { styles } from '../trips.stylex'

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
    <div {...sx(styles.editorDockRoot)}>
      {children}
    </div>
  )
}

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
            {...sx(styles.savePillBase, toastClass, saveState === "error" ? styles.savePillError : undefined)}
          >
            {saveState === "error" ? (
              <>
                <X {...sx(styles.iconXs, styles.iconRed)} aria-hidden />
                Couldn’t save. Retries on your next edit.
              </>
            ) : saveState === "saved" ? (
              <>
                <CheckCircle2 {...sx(styles.iconXs, styles.iconEmerald)} aria-hidden />
                All changes saved
              </>
            ) : (
              <>
                <Loader2 {...sx(styles.iconXs, spinnerClass, ACCENT.text)} aria-hidden />
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
            {...sx(styles.savePillBase, toastClass, styles.noticePillWide)}
          >
            <span {...sx(styles.minW0, styles.leadingSnug, wrapAnywhereClass)}>{notice}</span>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss notice"
              {...sx(styles.negMx2, iconBtnClass)}
            >
              <X {...sx(styles.iconSm)} strokeWidth={1.5} aria-hidden />
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
            {...sx(styles.savePillBase, toastClass, styles.noticePillInk)}
          >
            <span {...sx(styles.undoTextTruncate)}>
              Deleted {undo.title ? `“${undo.title}”` : "this item"}
            </span>
            <button
              type="button"
              autoFocus
              onClick={onUndo}
              {...sx(styles.undoBtn, focusRingClass)}
            >
              <Undo2 {...sx(styles.iconXs)} strokeWidth={1.5} aria-hidden />
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
