import { sx } from "@/styles/merge"
import type { Sync } from "../editorMachine"
import { saveWords } from "./saveWords"
import { save as s } from "./offline.stylex"

// Whether the traveller's edits are safe: one word and a dot, the reason
// when there is one, and Retry when trying again could help. The status
// line is always in the page so screen readers hear each change.

export interface SaveIndicatorProps {
  sync: Sync
  /** From `useOnline()`. */
  online: boolean
  /** An AI run holds the document: Retry waits. */
  locked: boolean
  onRetry: () => void
  /** "header" hides itself below 1024px, where "bar" (the bottom bar) says it. */
  place: "header" | "bar"
}

export function SaveIndicator({ sync, online, locked, onRetry, place }: SaveIndicatorProps) {
  const { word, detail, tone, retry } = saveWords(sync, online)
  return (
    <span {...sx(s.root, place === "header" ? s.header : s.bar, tone === "error" && s.error)}>
      <span {...sx(s.status)} role="status" aria-live="polite">
        <span
          {...sx(s.dot, tone === "busy" && s.dotBusy, tone === "waiting" && s.dotWaiting, tone === "error" && s.dotError)}
          aria-hidden
        />
        {word}
        {detail && (
          <span {...sx(s.detail)} title={detail}>
            {` · ${detail}`}
          </span>
        )}
      </span>
      {retry && (
        <>
          <span aria-hidden>·</span>
          <button type="button" {...sx(s.retry)} disabled={locked} onClick={onRetry} aria-label="Retry saving">
            Retry
          </button>
        </>
      )}
    </span>
  )
}
