import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Mic, Send, Slash } from "lucide-react"
import { focusRingClass, mutedInkClass, wrapAnywhereClass } from "../ui"
import type { PromptAttachment, PromptCommand, PromptSubmit } from "./types"

const COMMANDS: Array<{ id: PromptCommand; token: string; hint: string }> = [
  { id: "ask", token: "/ask", hint: "Ask the concierge" },
  { id: "enhance", token: "/enhance", hint: "Review the itinerary" },
  { id: "generate", token: "/generate", hint: "Draft empty days" },
  { id: "map", token: "/map", hint: "Open Map Mode" },
  { id: "add", token: "/add", hint: "Add a place" },
  { id: "blank", token: "/blank", hint: "Skip AI and start empty" },
]

function parseCommand(raw: string): { command: PromptCommand; text: string } {
  const trimmed = raw.trim()
  for (const cmd of COMMANDS) {
    if (trimmed === cmd.token || trimmed.startsWith(`${cmd.token} `)) {
      return { command: cmd.id, text: trimmed.slice(cmd.token.length).trim() }
    }
  }
  return { command: "prompt", text: trimmed }
}

type SpeechCtor = new () => {
  lang: string
  interimResults: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

function speechCtor(): SpeechCtor | null {
  const w = window as Window & { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function PromptBar({
  placeholder,
  label,
  disabled = false,
  submitLabel = "Send",
  attachments = [],
  onRemoveAttachment,
  mentionOptions = [],
  value: controlled,
  onChange,
  onSubmit,
}: {
  placeholder: string
  label?: string
  disabled?: boolean
  submitLabel?: string
  attachments?: PromptAttachment[]
  onRemoveAttachment?: (id: string) => void
  mentionOptions?: PromptAttachment[]
  value?: string
  onChange?: (value: string) => void
  onSubmit: (submit: PromptSubmit) => void
}) {
  const [uncontrolled, setUncontrolled] = useState("")
  const value = controlled ?? uncontrolled
  const setValue = (next: string) => {
    onChange?.(next)
    if (controlled === undefined) setUncontrolled(next)
  }
  const [listening, setListening] = useState(false)
  const [menu, setMenu] = useState<"slash" | "at" | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recRef = useRef<{ stop: () => void } | null>(null)
  const id = useId()
  const canDictate = typeof window !== "undefined" && speechCtor() !== null

  const slashOpen = menu === "slash"
  const atOpen = menu === "at"
  const filteredMentions = useMemo(() => {
    const q = value.split("@").pop()?.toLowerCase() ?? ""
    return mentionOptions.filter((m) => !q || m.label.toLowerCase().includes(q)).slice(0, 6)
  }, [mentionOptions, value])

  useEffect(() => () => recRef.current?.stop(), [])

  const submit = (raw = value) => {
    const parsed = parseCommand(raw)
    if (!parsed.text && (parsed.command === "ask" || parsed.command === "prompt") && attachments.length === 0) return
    onSubmit({ ...parsed, attachments })
    if (controlled === undefined) setValue("")
    setMenu(null)
  }

  const toggleDictation = () => {
    if (listening) {
      recRef.current?.stop()
      setListening(false)
      return
    }
    const Ctor = speechCtor()
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = "en-US"
    rec.interimResults = false
    rec.onresult = (event) => {
      const spoken = event.results[0]?.[0]?.transcript
      if (spoken) setValue(value ? `${value} ${spoken}` : spoken)
    }
    rec.onend = () => setListening(false)
    recRef.current = rec
    rec.start()
    setListening(true)
  }

  return (
    <div className="rounded-2xl border border-stone-200/90 bg-[var(--trips-surface)] p-2 shadow-sm dark:border-stone-800">
      {attachments.length > 0 && (
        <ul className="mb-1.5 flex flex-wrap gap-1.5 px-1" aria-label="Attached sources">
          {attachments.map((att) => (
            <li key={att.id}>
              <button
                type="button"
                onClick={() => onRemoveAttachment?.(att.id)}
                className={`rounded-md border border-[color:var(--ta-ring)] bg-[color:var(--ta-soft)] px-2 py-1 text-[11px] text-[color:var(--ta)] ${focusRingClass}`}
              >
                @{att.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-1.5">
        <label className="sr-only" htmlFor={id}>
          {label ?? placeholder}
        </label>
        <textarea
          id={id}
          ref={inputRef}
          rows={1}
          disabled={disabled}
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            const next = e.target.value
            setValue(next)
            if (next.endsWith("/")) setMenu("slash")
            else if (next.endsWith("@") && mentionOptions.length > 0) setMenu("at")
            else setMenu(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
            if (e.key === "Escape") setMenu(null)
          }}
          className="min-h-11 max-h-32 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-100"
        />
        {canDictate && (
          <button
            type="button"
            disabled={disabled}
            onClick={toggleDictation}
            aria-pressed={listening}
            aria-label={listening ? "Stop dictation" : "Dictate"}
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${focusRingClass} ${
              listening ? "text-[color:var(--ta)]" : mutedInkClass
            }`}
          >
            <Mic className="h-4 w-4" strokeWidth={1.5} />
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => submit()}
          aria-label={submitLabel}
          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[color:var(--trips-accent)] text-white ${focusRingClass} disabled:opacity-40 dark:text-stone-950`}
        >
          <Send className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
      {slashOpen && (
        <ul className="mt-1 border-t border-stone-200/80 pt-1 dark:border-stone-800" role="listbox" aria-label="Commands">
          {COMMANDS.map((cmd) => (
            <li key={cmd.id}>
              <button
                type="button"
                onClick={() => {
                  setValue(`${cmd.token} `)
                  setMenu(null)
                  inputRef.current?.focus()
                }}
                className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm ${focusRingClass} hover:bg-stone-100 dark:hover:bg-stone-800`}
              >
                <Slash className={`h-3.5 w-3.5 ${mutedInkClass}`} strokeWidth={1.5} aria-hidden />
                <span className="font-mono-trips text-xs">{cmd.token}</span>
                <span className={mutedInkClass}>{cmd.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {atOpen && filteredMentions.length > 0 && (
        <ul className="mt-1 border-t border-stone-200/80 pt-1 dark:border-stone-800" role="listbox" aria-label="Mentions">
          {filteredMentions.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  setValue(value.replace(/@[^@]*$/, `@${m.label} `))
                  setMenu(null)
                  inputRef.current?.focus()
                }}
                className={`flex min-h-11 w-full items-center rounded-lg px-2 text-left text-sm ${focusRingClass} hover:bg-stone-100 dark:hover:bg-stone-800`}
              >
                <span className={wrapAnywhereClass}>@{m.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const ACTIONS = [
  { id: "enhance", label: "Enhance" },
  { id: "explain", label: "Explain" },
  { id: "shorten", label: "Shorten" },
] as const

export function SelectionActions({
  text,
  onAction,
  onDismiss,
}: {
  text: string
  onAction: (action: (typeof ACTIONS)[number]["id"], text: string) => void
  onDismiss: () => void
}) {
  if (!text.trim()) return null
  return (
    <div
      role="toolbar"
      aria-label="Selection actions"
      className="flex flex-wrap items-center gap-1 rounded-xl border border-stone-200 bg-[var(--trips-surface)] p-1 shadow-sm dark:border-stone-700"
    >
      <p className={`max-w-[16rem] truncate px-2 text-xs ${mutedInkClass}`}>{text}</p>
      {ACTIONS.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => onAction(action.id, text)}
          className={`min-h-11 rounded-lg px-3 text-xs font-medium text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800 ${focusRingClass}`}
        >
          {action.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onDismiss}
        className={`min-h-11 rounded-lg px-3 text-xs ${mutedInkClass} ${focusRingClass}`}
      >
        Dismiss
      </button>
    </div>
  )
}
