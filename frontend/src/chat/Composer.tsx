import { useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react"
import { ArrowUp, Square } from "lucide-react"
import { sx } from "@/styles/merge"
import { chatbot } from "@/styles/chatbot.stylex"
import { layout } from "@/styles/common.stylex"
import { MAX_MESSAGE } from "./conversation"

export type ComposerHandle = {
  clear(): void
  focus(): void
  /** Where the caret is, for Lim to look at. */
  input(): HTMLTextAreaElement | null
}

/** Show what is left once a message gets this close to the cap. */
const COUNT_FROM = MAX_MESSAGE - 1_000
const fmt = new Intl.NumberFormat("en")

/**
 * The message box. It owns what is being typed, so a keystroke re-renders
 * this and nothing else (the transcript stays put). The page hears only what
 * it needs: focus, whether there is any text, and each change for Lim to
 * react to.
 */
export function Composer({
  ref,
  busy,
  roomy,
  initialText,
  onSubmit,
  onStop,
  onFocusChange,
  onHasText,
  onType,
  onCaret,
  toyButton,
  toyPanel,
  shortcuts,
  jump,
}: {
  ref?: Ref<ComposerHandle>
  busy: boolean
  roomy: boolean
  initialText: string
  /** True when the message was taken (the box then clears). */
  onSubmit: (text: string) => boolean
  onStop: () => void
  onFocusChange: (focused: boolean) => void
  onHasText: (hasText: boolean) => void
  onType: (text: string) => void
  onCaret: (el: HTMLTextAreaElement) => void
  toyButton: ReactNode
  toyPanel: ReactNode
  /** Extra keyboard hints for the hint row. */
  shortcuts: ReactNode
  /** "Jump to latest", floated above the box. */
  jump: ReactNode
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(initialText)
  const [sendBeat, setSendBeat] = useState(0)
  const canSend = text.trim().length > 0

  const update = (next: string) => {
    if ((next.trim().length > 0) !== (text.trim().length > 0)) onHasText(next.trim().length > 0)
    setText(next)
  }

  const fit = () => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  useImperativeHandle(ref, () => ({
    clear: () => {
      update("")
      if (inputRef.current) inputRef.current.style.height = "auto"
    },
    focus: () => inputRef.current?.focus(),
    input: () => inputRef.current,
  }))

  const submit = () => {
    if (!onSubmit(text)) return
    update("")
    setSendBeat((n) => n + 1)
    if (inputRef.current) inputRef.current.style.height = "auto"
  }

  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) onStop()
    else submit()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (!busy) submit()
    }
  }

  const caret = () => {
    if (inputRef.current) onCaret(inputRef.current)
  }

  const near = text.length >= COUNT_FROM
  return (
    <form onSubmit={onFormSubmit} {...sx(chatbot.composer)}>
      {jump}
      <div {...sx(chatbot.composerInner)}>
        <label htmlFor="chat-input" {...sx(layout.srOnly)}>
          Ask about Anthony
        </label>
        <div {...sx(chatbot.box)}>
          {toyButton}
          <textarea
            ref={inputRef}
            id="chat-input"
            rows={1}
            value={text}
            maxLength={MAX_MESSAGE}
            aria-describedby={near ? "chat-input-count" : undefined}
            onChange={(e) => {
              update(e.target.value)
              fit()
              caret()
              onType(e.target.value)
            }}
            onKeyDown={onKeyDown}
            onKeyUp={caret}
            onClick={caret}
            onFocus={() => {
              onFocusChange(true)
              caret()
            }}
            onBlur={() => onFocusChange(false)}
            placeholder={roomy ? "Ask about Anthony, or give Lim a toy…" : "Ask about Anthony…"}
            enterKeyHint="send"
            {...sx(chatbot.textarea)}
          />
          <button
            type="submit"
            {...sx(
              chatbot.send,
              sendBeat > 0 && (sendBeat % 2 ? chatbot.sendSquish : chatbot.sendSquishAgain),
              !busy && !canSend && chatbot.sendIdle,
            )}
            aria-label={busy ? "Stop generating" : "Send message"}
            aria-disabled={!busy && !canSend}
          >
            {busy ? <Square size={16} fill="currentColor" aria-hidden="true" /> : <ArrowUp size={20} strokeWidth={2.6} aria-hidden="true" />}
          </button>
        </div>
        {near && (
          <span id="chat-input-count" {...sx(chatbot.counter, text.length >= MAX_MESSAGE && chatbot.counterFull)}>
            {text.length >= MAX_MESSAGE
              ? `That's as long as a message can be (${fmt.format(MAX_MESSAGE)} characters).`
              : `${fmt.format(MAX_MESSAGE - text.length)} characters left`}
          </span>
        )}
        {toyPanel}
        <p {...sx(chatbot.hint)}>
          <span>
            <kbd {...sx(chatbot.kbd)}>Enter</kbd> to send
          </span>
          <span>
            <kbd {...sx(chatbot.kbd)}>Shift</kbd>+<kbd {...sx(chatbot.kbd)}>Enter</kbd> new line
          </span>
          {busy ? (
            <span>
              <kbd {...sx(chatbot.kbd)}>Esc</kbd> to stop
            </span>
          ) : (
            shortcuts
          )}
        </p>
      </div>
    </form>
  )
}
