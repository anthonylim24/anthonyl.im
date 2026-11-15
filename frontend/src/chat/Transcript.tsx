import { lazy, memo, Suspense } from "react"
import { Check, Copy, RotateCcw } from "lucide-react"
import { sx } from "@/styles/merge"
import { chatbot } from "@/styles/chatbot.stylex"
import { layout } from "@/styles/common.stylex"
import { LimArt } from "./LimArt"
import type { Suggestion } from "./suggestions"
import type { AssistantMessage as Reply, ChatMessage } from "./conversation"

const MessageContent = lazy(() => import("../components/message-content"))

const CHIP_TINTS = [chatbot.chip1, chatbot.chip2, chatbot.chip3, chatbot.chip4]

function ThinkingDots() {
  return (
    <span {...sx(chatbot.thinking)}>
      {["#FF7E6B", "#B9A6FF", "#7FD6B5"].map((color, i) => (
        <span key={color} {...sx(chatbot.thinkingDot)} style={{ backgroundColor: color, animationDelay: `${i * 140}ms` }} />
      ))}
      <span {...sx(layout.srOnly)}>Lim is thinking</span>
    </span>
  )
}

const UserMessage = memo(function UserMessage({ content }: { content: string }) {
  return (
    <div {...sx(chatbot.row, chatbot.rowUser)}>
      <div {...sx(chatbot.userBubble)}>
        <span {...sx(layout.srOnly)}>You: </span>
        {content}
      </div>
    </div>
  )
})

/**
 * One reply. Memoised with id-based callbacks, so while one reply streams the
 * others (and their markdown) are not rendered again.
 */
const AssistantMessage = memo(function AssistantMessage({
  message,
  last,
  copied,
  onCopy,
  onRegenerate,
  waiting,
}: {
  message: Reply
  last: boolean
  copied: boolean
  onCopy: (id: string) => void
  onRegenerate: () => void
  /** A progress line to show instead of the dots while this reply is being made. */
  waiting: string | null
}) {
  const { content } = message
  const failed = message.status === "error"
  const streaming = message.status === "streaming"
  return (
    <div {...sx(chatbot.row, chatbot.rowAssistant)}>
      <LimArt mood={failed ? "sad" : "idle"} {...sx(chatbot.avatar)} />
      <div {...sx(chatbot.assistantCol)}>
        <div {...sx(chatbot.card, failed && !content && chatbot.cardError)}>
          <span {...sx(layout.srOnly)}>Lim: </span>
          {content ? (
            <Suspense fallback={<p>{content}</p>}>
              <MessageContent content={content} isStreaming={streaming} />
            </Suspense>
          ) : streaming ? (
            waiting ? (
              <span key={waiting} {...sx(chatbot.making)}>
                {waiting}
              </span>
            ) : (
              <ThinkingDots />
            )
          ) : failed ? null : (
            <p>I stopped before saying anything.</p>
          )}
          {message.status === "error" && (
            <>
              <p {...sx(chatbot.errorNote, !content && chatbot.errorNoteAlone)}>{message.error}</p>
              {last && (
                <button type="button" onClick={onRegenerate} {...sx(chatbot.retry)}>
                  <RotateCcw size={16} aria-hidden="true" /> Try again
                </button>
              )}
            </>
          )}
        </div>
        {!streaming && !failed && (
          <div {...sx(chatbot.actions, !last && chatbot.actionsEarlier)}>
            {message.status === "stopped" && <span {...sx(chatbot.tag)}>Stopped</span>}
            {content && (
              <button type="button" onClick={() => onCopy(message.id)} {...sx(chatbot.action)} aria-label={copied ? "Copied" : "Copy reply"}>
                {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                {copied ? "Copied" : "Copy"}
              </button>
            )}
            {last && (
              <button type="button" onClick={onRegenerate} {...sx(chatbot.action)}>
                <RotateCcw size={15} aria-hidden="true" /> Regenerate
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

/**
 * The conversation. Memoised: typing in the composer, a notice or Lim's mood
 * changing never re-renders it; a streaming chunk re-renders only its reply.
 */
export const Transcript = memo(function Transcript({
  messages,
  making,
  copiedId,
  onCopy,
  onRegenerate,
  followUps,
  onAsk,
  onLook,
}: {
  messages: ChatMessage[]
  /** What Lim is up to while it makes something for its world, or null. */
  making: string | null
  copiedId: string | null
  onCopy: (id: string) => void
  onRegenerate: () => void
  followUps: Suggestion[]
  onAsk: (text: string) => void
  /** Lim looks at a chip being hovered or focused. */
  onLook: (el: Element) => void
}) {
  return (
    <>
      {messages.map((m, i) => {
        const last = i === messages.length - 1
        return m.role === "user" ? (
          <UserMessage key={m.id} content={m.content} />
        ) : (
          <AssistantMessage
            key={m.id}
            message={m}
            last={last}
            copied={copiedId === m.id}
            onCopy={onCopy}
            onRegenerate={onRegenerate}
            waiting={last ? making : null}
          />
        )
      })}
      {followUps.length > 0 && (
        <div role="group" aria-label="Ask next" {...sx(chatbot.followUps)}>
          {followUps.map(({ text, short, Icon }, i) => (
            <button
              key={text}
              type="button"
              aria-label={text}
              onClick={() => onAsk(text)}
              onPointerEnter={(e) => onLook(e.currentTarget)}
              onFocus={(e) => onLook(e.currentTarget)}
              {...sx(chatbot.chip, CHIP_TINTS[(i + 1) % CHIP_TINTS.length], chatbot.followChip)}
              style={{ animationDelay: `${120 + i * 40}ms` }}
            >
              <Icon size={16} strokeWidth={2.2} aria-hidden="true" />
              <span {...sx(chatbot.long)}>{text}</span>
              <span {...sx(chatbot.short)}>{short}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
})
