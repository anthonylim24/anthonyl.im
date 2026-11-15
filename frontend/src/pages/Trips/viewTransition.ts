type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> }
}

/** Same-document View Transition, or a synchronous update when unsupported or reduced. */
export function runTripsViewTransition(update: () => void): void {
  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const doc = document as ViewTransitionDocument
  if (reduced || typeof doc.startViewTransition !== "function") {
    update()
    return
  }
  void doc.startViewTransition(update).finished.catch(() => undefined)
}
