import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { formatConciergeError } from "../effect/chatErrors"
import { TimeoutError, errorMessage } from "../effect/errors"
import { invokeDeepseek } from "../lib/apiService"

export type ChatRole = "user" | "assistant"
export type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  timestamp: number
  /** Assistant replies only. */
  status?: "streaming" | "done" | "stopped" | "error"
}
/** thinking = waiting for the first token; streaming = tokens arriving. */
export type ChatStatus = "idle" | "thinking" | "streaming"

export type ChatEvents = {
  onSend?: () => void
  onChunk?: () => void
  onDone?: (firstReply: boolean) => void
  onError?: () => void
}

export const STORAGE_KEY = "lim-chat-v1"
const MAX_STORED = 50
const FALLBACK_ERROR = "The reply didn't come through. Try again."

function load(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (m): m is ChatMessage =>
          m && typeof m.id === "string" && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"),
      )
      // A reload mid-stream leaves a half reply; keep it, but as stopped.
      .map((m) => (m.status === "streaming" ? { ...m, status: "stopped" as const } : m))
  } catch {
    return []
  }
}

function save(messages: ChatMessage[]) {
  try {
    if (messages.length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)))
  } catch {
    /* private mode / quota: the chat still works, it just won't persist */
  }
}

const toHistory = (messages: ChatMessage[]) =>
  messages.filter((m) => m.status !== "error" && m.content.trim()).map((m) => ({ role: m.role, content: m.content }))

/**
 * Conversation state for the chatbot: streaming via `invokeDeepseek`, stop,
 * retry/regenerate, new chat, and localStorage persistence. `events` feed the
 * mascot (hop on send, mouth flaps per chunk, squish when done, droop on error).
 */
export function useChat(events: ChatEvents = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>(load)
  const [status, setStatus] = useState<ChatStatus>("idle")
  const eventsRef = useRef(events)
  const abortRef = useRef<AbortController | null>(null)
  const messagesRef = useRef(messages)
  useLayoutEffect(() => {
    eventsRef.current = events
    messagesRef.current = messages
  })

  useEffect(() => {
    if (status === "idle") save(messages)
  }, [messages, status])

  useEffect(() => () => abortRef.current?.abort(), [])

  const patchLast = (patch: Partial<ChatMessage>) =>
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last?.role !== "assistant") return prev
      return [...prev.slice(0, -1), { ...last, ...patch }]
    })

  /** Ask `text` on top of `base` (the conversation before this turn). */
  const ask = useCallback((text: string, base: ChatMessage[]) => {
    const now = Date.now()
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text, timestamp: now }
    const reply: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "", timestamp: now, status: "streaming" }
    const firstReply = !base.some((m) => m.role === "assistant" && m.status === "done")
    const controller = new AbortController()
    abortRef.current = controller
    setMessages([...base, userMsg, reply])
    setStatus("thinking")
    eventsRef.current.onSend?.()

    let latest = ""
    void invokeDeepseek(
      text,
      toHistory(base),
      (content) => {
        if (controller.signal.aborted) return
        latest = content
        patchLast({ content })
        setStatus("streaming")
        eventsRef.current.onChunk?.()
      },
      controller.signal,
    )
      .then(() => {
        patchLast({ status: "done" })
        eventsRef.current.onDone?.(firstReply)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          patchLast({ content: latest, status: "stopped" })
          return
        }
        console.error(err)
        const partial = err instanceof TimeoutError ? err.partialContent : undefined
        patchLast({ content: formatConciergeError(partial ?? latest, errorMessage(err) || FALLBACK_ERROR), status: "error" })
        eventsRef.current.onError?.()
      })
      .finally(() => {
        if (abortRef.current === controller) abortRef.current = null
        setStatus("idle")
      })
  }, [])

  const busy = status !== "idle"

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim()
      if (!text || abortRef.current) return false
      ask(text, messagesRef.current)
      return true
    },
    [ask],
  )

  const stop = useCallback(() => abortRef.current?.abort(), [])

  /** Re-ask the last question, replacing its reply (regenerate and retry). */
  const regenerate = useCallback(() => {
    if (abortRef.current) return
    const list = messagesRef.current
    let i = list.length - 1
    while (i >= 0 && list[i].role !== "user") i--
    if (i < 0) return
    ask(list[i].content, list.slice(0, i))
  }, [ask])

  const newChat = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setMessages([])
    setStatus("idle")
  }, [])

  return { messages, status, busy, send, stop, regenerate, newChat }
}
