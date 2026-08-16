import type { ReactNode } from "react"
import { mutedInkClass, softPanelClass, wrapAnywhereClass } from "../ui"

export function StreamingText({
  children,
  streaming,
  followUps = [],
  onFollowUp,
}: {
  children: ReactNode
  streaming?: boolean
  followUps?: string[]
  onFollowUp?: (text: string) => void
}) {
  return (
    <div>
      <div className="text-[15px] leading-relaxed">{children}</div>
      {streaming ? <span className="trip-chat-caret" aria-hidden /> : null}
      {!streaming && followUps.length > 0 && onFollowUp && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Follow-ups">
          {followUps.map((q) => (
            <li key={q}>
              <button
                type="button"
                onClick={() => onFollowUp(q)}
                className="min-h-11 rounded-full border border-stone-200 bg-[var(--trips-surface)] px-3 text-left text-xs font-medium text-stone-600 hover:border-[color:var(--ta-ring)] hover:bg-[color:var(--ta-soft)] dark:border-stone-700 dark:text-stone-300"
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ContextCards({
  chunks,
}: {
  chunks: Array<{ id: string; title: string; body: string; source?: string }>
}) {
  if (chunks.length === 0) return null
  return (
    <ul className="space-y-2" aria-label="Retrieved context">
      {chunks.map((chunk) => (
        <li key={chunk.id} className={`p-3 ${softPanelClass}`}>
          <p className="text-xs font-medium text-stone-800 dark:text-stone-200">{chunk.title}</p>
          <p className={`mt-1 text-sm ${mutedInkClass} ${wrapAnywhereClass}`}>{chunk.body}</p>
          {chunk.source && (
            <p className={`mt-1.5 font-mono-trips text-[10px] uppercase tracking-[0.14em] ${mutedInkClass}`}>
              {chunk.source}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
