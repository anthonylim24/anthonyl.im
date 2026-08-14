import { useCallback, useRef, useState } from 'react'
import { Leaf, Send, Sun, Moon, Eraser } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CHAT_EMAIL,
  CHAT_LINKEDIN_HREF,
} from './IdentityRail'
import type { ResolvedTheme } from './useChatAppearance'

export const CHAT_PLACEHOLDER = "Ask about Anthony's work"
export const CHAT_SUGGESTIONS = [
  'What does Anthony build at DoorDash?',
  'Which stacks does he work in?',
  'Where has he worked before?',
  'How do I reach him?',
] as const
export const CHAT_DISCLAIMER =
  "Answers come from a model briefed on Anthony's background. Verify anything important."

interface ComposerProps {
  hasMessages: boolean
  isLoading: boolean
  showContacts: boolean
  theme: ResolvedTheme
  ambience: boolean
  onSend: (text: string) => void
  onToggleTheme: () => void
  onToggleAmbience: () => void
  onClear?: () => void
}

const controlClass =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-[var(--ch-r-control)] px-3 text-sm text-[color:var(--ch-ink)] transition-transform duration-150 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ch-focus)]'

const suggestionClass =
  'min-h-11 rounded-[var(--ch-r-control)] border border-[color:var(--ch-line)] bg-[var(--ch-surface)] px-3 py-2.5 text-left text-sm leading-snug text-[color:var(--ch-ink)] transition-transform duration-150 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ch-focus)] disabled:cursor-not-allowed disabled:opacity-50'

const contactClass =
  'inline-flex min-h-11 items-center text-sm text-[color:var(--ch-accent)] underline-offset-4 transition-transform duration-150 hover:underline active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ch-focus)]'

export function Composer({
  hasMessages,
  isLoading,
  showContacts,
  theme,
  ambience,
  onSend,
  onToggleTheme,
  onToggleAmbience,
  onClear,
}: ComposerProps) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const resize = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [])

  const submit = useCallback(
    (text?: string) => {
      const value = (text ?? input).trim()
      if (!value || isLoading) return
      onSend(value)
      if (!text) {
        setInput('')
        if (inputRef.current) inputRef.current.style.height = 'auto'
      }
    },
    [input, isLoading, onSend],
  )

  return (
    <div className={cn('shrink-0 px-4 pt-2 lg:px-8', 'max-md:pb-safe md:pb-6')}>
      {hasMessages ? (
        <div className="scroll-snap-x no-scrollbar mb-3 flex gap-2">
          {CHAT_SUGGESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              disabled={isLoading}
              onClick={() => submit(question)}
              className={cn(suggestionClass, 'shrink-0 snap-start')}
            >
              {question}
            </button>
          ))}
        </div>
      ) : (
        <div className="mb-4 grid grid-cols-2 gap-2">
          {CHAT_SUGGESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              disabled={isLoading}
              onClick={() => submit(question)}
              className={suggestionClass}
            >
              {question}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <div className="flex items-end gap-2 rounded-[var(--ch-r-panel)] border border-[color:var(--ch-line)] bg-[var(--ch-surface)] px-3 py-2 shadow-[var(--ch-shadow)]">
          <label htmlFor="chat-composer" className="sr-only">
            {CHAT_PLACEHOLDER}
          </label>
          <textarea
            id="chat-composer"
            ref={inputRef}
            value={input}
            rows={1}
            disabled={isLoading}
            placeholder={CHAT_PLACEHOLDER}
            onChange={(event) => {
              setInput(event.target.value)
              resize()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
            className="max-h-[120px] min-h-11 flex-1 resize-none bg-transparent py-2 text-base leading-relaxed text-[color:var(--ch-ink)] placeholder:text-[color:var(--ch-ink-muted)] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ch-focus)] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            aria-label="Send"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--ch-r-control)] bg-[var(--ch-accent)] text-[color:var(--ch-accent-ink)] transition-transform duration-150 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ch-focus)] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Send strokeWidth={1.5} className="h-4 w-4" />
          </button>
        </div>
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1">
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
          aria-pressed={theme === 'dark'}
          aria-keyshortcuts="d"
          className={controlClass}
        >
          {theme === 'dark' ? (
            <Sun strokeWidth={1.5} className="h-4 w-4" />
          ) : (
            <Moon strokeWidth={1.5} className="h-4 w-4" />
          )}
          <span className="chat-mono">Theme</span>
        </button>
        <button
          type="button"
          onClick={onToggleAmbience}
          aria-label="Ambience"
          aria-pressed={ambience}
          aria-keyshortcuts="a"
          className={controlClass}
        >
          <Leaf strokeWidth={1.5} className="h-4 w-4" />
          <span className="chat-mono">Ambience</span>
        </button>
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear conversation"
            className={controlClass}
          >
            <Eraser strokeWidth={1.5} className="h-4 w-4" />
            <span className="chat-mono">Clear</span>
          </button>
        ) : null}
      </div>

      {showContacts ? (
        <p className="mt-1 text-sm text-[color:var(--ch-ink)]">
          <a
            className={contactClass}
            href={CHAT_LINKEDIN_HREF}
            target="_blank"
            rel="noopener noreferrer"
          >
            LinkedIn
          </a>
          <span aria-hidden="true" className="px-2 text-[color:var(--ch-ink-faint)]">
            ·
          </span>
          <a className={contactClass} href={`mailto:${CHAT_EMAIL}`}>
            {CHAT_EMAIL}
          </a>
        </p>
      ) : null}

      <p className="mt-1 text-sm leading-relaxed text-[color:var(--ch-ink-muted)]">
        {CHAT_DISCLAIMER}
      </p>
    </div>
  )
}
