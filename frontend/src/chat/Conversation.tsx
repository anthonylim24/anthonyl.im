import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CHAT_KNOWN_TOPICS } from './copy'
import type { ChatMessage } from './useChatSession'

const MessageContent = lazy(() => import('../components/message-content'))

const MARKDOWN_VARS = {
  '--chat-text': 'var(--ch-ink)',
  '--chat-bright': 'var(--ch-ink)',
  '--chat-mid': 'var(--ch-ink-muted)',
  '--chat-code-bg': 'var(--ch-raised)',
  '--chat-code-text': 'var(--ch-ink)',
  '--chat-line': 'var(--ch-line)',
} as CSSProperties

interface ConversationProps {
  messages: ChatMessage[]
  isLoading: boolean
  error: boolean
  onRetry: () => void
}

export function Conversation({ messages, isLoading, error, onRetry }: ConversationProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldStick = useRef(true)
  const [showLatest, setShowLatest] = useState(false)

  const scrollToLatest = useCallback((instant = false) => {
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: instant ? 'instant' : 'smooth',
      })
    })
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight
    shouldStick.current = gap < 150
    setShowLatest(gap > 200)
  }, [])

  useEffect(() => {
    if (shouldStick.current) scrollToLatest()
  }, [messages, isLoading, error, scrollToLatest])

  const last = messages[messages.length - 1]
  const lastAssistantStreaming = Boolean(
    isLoading && last?.role === 'assistant',
  )

  const isEmpty = messages.length === 0 && !isLoading && !error

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-6 lg:px-8 lg:py-10"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* The transcript sits on the composer and grows upward, so a short
            conversation does not leave a hole between the first answer and the
            input the reader is about to use. */}
        <div
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          className="mt-auto flex flex-col gap-5"
        >
          {messages.map((message, index) => {
            const isUser = message.role === 'user'
            const isLastAssistant = !isUser && index === messages.length - 1
            if (!message.content && !(isLastAssistant && isLoading)) return null

            return (
              <div
                key={message.id}
                className={cn('chat-message animate-message-in', isUser && 'flex justify-end')}
              >
                {isUser ? (
                  <p className="max-w-[min(40rem,85%)] rounded-[var(--ch-r-panel)] bg-[var(--ch-accent)] px-4 py-2.5 text-[15px] leading-relaxed text-[color:var(--ch-accent-ink)]">
                    {message.content}
                  </p>
                ) : (
                  <div className="max-w-[min(48rem,92%)]" style={MARKDOWN_VARS}>
                    {message.content ? (
                      <Suspense fallback={<MessageSkeleton />}>
                        <MessageContent
                          content={message.content}
                          isStreaming={isLastAssistant && lastAssistantStreaming}
                        />
                      </Suspense>
                    ) : (
                      <StreamingIndicator />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {isEmpty ? <EmptyTranscript /> : null}

        {error ? (
          <div
            role="alert"
            className="mt-5 flex flex-wrap items-center gap-3 rounded-[var(--ch-r-panel)] bg-[var(--ch-danger-soft)] px-4 py-3 text-sm text-[color:var(--ch-danger)]"
          >
            <p>The reply did not come through.</p>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--ch-r-control)] border border-[color:var(--ch-line-strong)] bg-[var(--ch-raised)] px-3 text-sm text-[color:var(--ch-ink)] transition-transform duration-150 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ch-focus)]"
            >
              Try again
            </button>
          </div>
        ) : null}
      </div>

      {showLatest ? (
        <button
          type="button"
          onClick={() => {
            shouldStick.current = true
            scrollToLatest()
          }}
          aria-label="Scroll to latest"
          className="absolute right-4 bottom-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--ch-raised)] text-[color:var(--ch-ink)] shadow-[var(--ch-shadow)] ring-1 ring-[color:var(--ch-line)] transition-transform duration-150 animate-scale-in active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ch-focus)]"
        >
          <ChevronDown strokeWidth={1.5} className="h-5 w-5" />
        </button>
      ) : null}
    </div>
  )
}

function EmptyTranscript() {
  return (
    <div className="mt-auto max-w-[42ch] pb-2">
      <p className="text-sm text-[color:var(--ch-ink-muted)]">This assistant knows</p>
      <dl className="mt-3 space-y-2">
        {CHAT_KNOWN_TOPICS.map(([term, detail]) => (
          <div key={term} className="flex flex-wrap items-baseline gap-x-2">
            <dt className="text-[15px] text-[color:var(--ch-ink)]">{term}</dt>
            <dd className="text-[15px] text-[color:var(--ch-ink-muted)]">{detail}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function StreamingIndicator() {
  return (
    <p className="chat-mono text-sm text-[color:var(--ch-ink-muted)]" aria-live="polite">
      Writing
    </p>
  )
}

function MessageSkeleton() {
  return (
    <div className="chat-message space-y-2" aria-hidden="true">
      <div className="h-3 w-3/4 rounded-[var(--ch-r-control)] bg-[var(--ch-accent-soft)] animate-pulse" />
      <div className="h-3 w-1/2 rounded-[var(--ch-r-control)] bg-[var(--ch-accent-soft)] animate-pulse" />
    </div>
  )
}
