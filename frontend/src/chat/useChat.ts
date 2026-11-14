import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { formatConciergeError } from "../effect/chatErrors"
import { TimeoutError, errorMessage } from "../effect/errors"
import { invokeDeepseek } from "../lib/apiService"
import { hasWorldOrder, isWorldReply, maybeWorldReply } from "./world/worldApi"

export type ChatRole = "user" | "assistant"
export type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  timestamp: number
  /** Assistant replies only. */
  status?: "streaming" | "done" | "stopped" | "error"
  /**
   * How this turn goes back to the model as history, when that differs from
   * what is shown: a world order is sent as the order it was (so the model
   * keeps to the format), and "" drops the turn and the question before it
   * (a toy-box reply the model never wrote).
   */
  sent?: string
}
/** thinking = waiting for the first token; streaming = tokens arriving. */
export type ChatStatus = "idle" | "thinking" | "streaming"

export type ChatEvents = {
  onSend?: () => void
  onChunk?: () => void
  /** `local`: the reply came from `intercept`, not the model. */
  onDone?: (firstReply: boolean, local: boolean) => void
  onError?: () => void
  /**
   * A chance to answer without the model (Lim's toy world). Resolve with the
   * reply to show, or null to let the question go through as usual.
   */
  intercept?: (text: string, signal: AbortSignal) => Promise<string | null>
  /** Lim's toy world as it is now, sent with the question so the model can answer an order for it. Null when it isn't up. */
  world?: () => unknown
  /** The reply turned out to be a world order: it is being written (and is not shown as text). */
  onWorldStart?: () => void
  /**
   * The world order is complete (`content`), or was cut short (null), in
   * which case `failed` tells a failure from a Stop. Returns the line to show
   * in its place.
   */
  onWorld?: (content: string | null, failed: boolean) => string
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

// The API takes at most 40 earlier messages; toy-world chatter adds up fast, so send the recent ones.
const HISTORY_MAX = 30
const toHistory = (messages: ChatMessage[]) => {
  const turns: { role: ChatRole; content: string }[] = []
  for (const m of messages) {
    if (m.status === "error" || !m.content.trim()) continue
    if (m.sent === "") {
      // Lim's own reply to a toy-box order: neither it nor the order is the model's business.
      if (turns[turns.length - 1]?.role === "user") turns.pop()
      continue
    }
    turns.push({ role: m.role, content: m.sent ?? m.content })
  }
  return turns.slice(-HISTORY_MAX)
}

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

  /** Patch one reply by id; a reply that is gone (New chat) is left alone. */
  const patchReply = (id: string, patch: Partial<ChatMessage>) =>
    setMessages((prev) => (prev.some((m) => m.id === id) ? prev.map((m) => (m.id === id ? { ...m, ...patch } : m)) : prev))

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
    let wasLocal = false
    // A reply that opens with the world marker is an order for Lim's toy
    // world, not prose: it is held back, and handed over when it is complete.
    let order: "no" | "writing" | "done" = "no"
    const finishOrder = (content: string) => {
      order = "done"
      const raw = content
      latest = eventsRef.current.onWorld!(content, false)
      wasLocal = true
      if (abortRef.current === controller) patchReply(reply.id, { content: latest, sent: raw })
    }
    const answer = () =>
      invokeDeepseek(
        text,
        toHistory(base),
        (content) => {
          if (controller.signal.aborted) return
          latest = content
          if (eventsRef.current.onWorld) {
            // "@" could still become the marker: show nothing until it is clear which.
            if (maybeWorldReply(content)) return
            if (isWorldReply(content)) {
              if (order === "no") {
                order = "writing"
                eventsRef.current.onWorldStart?.()
              }
              return
            }
          }
          patchReply(reply.id, { content })
          setStatus("streaming")
          eventsRef.current.onChunk?.()
        },
        controller.signal,
        eventsRef.current.world?.() ?? undefined,
      ).then(() => {
        if (order === "writing") return finishOrder(latest)
        // The model wrapped the order in a fence or prefaced it: still an order.
        if (eventsRef.current.onWorld && hasWorldOrder(latest)) return finishOrder(latest)
        // Only ever the start of a marker ("@"): it was the whole answer.
        if (maybeWorldReply(latest)) patchReply(reply.id, { content: latest })
      })
    /** Cut short mid-order: the show still has to end. */
    const dropOrder = (failed: boolean) => {
      if (order !== "writing") return
      order = "done"
      latest = eventsRef.current.onWorld!(null, failed)
    }
    const intercept = eventsRef.current.intercept
    const work = intercept
      ? intercept(text, controller.signal)
          .catch(() => null)
          .then((handled) => {
            if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError")
            if (handled === null) return answer()
            latest = handled
            wasLocal = true
            patchReply(reply.id, { content: handled, sent: "" })
          })
      : answer()
    void work
      .then(() => {
        // Settled after New chat (or a newer send): this request no longer owns the chat.
        if (abortRef.current !== controller) return
        patchReply(reply.id, { status: "done" })
        eventsRef.current.onDone?.(firstReply, wasLocal)
      })
      .catch((err: unknown) => {
        const ordering = order === "writing"
        dropOrder(!controller.signal.aborted)
        if (ordering && !controller.signal.aborted && abortRef.current === controller) {
          // An order that failed is Lim's to own up to, not a chat error.
          patchReply(reply.id, { content: latest, status: "done" })
          return
        }
        if (controller.signal.aborted) {
          patchReply(reply.id, { content: latest, status: "stopped" })
          return
        }
        if (abortRef.current !== controller) return
        console.error(err)
        const partial = err instanceof TimeoutError ? err.partialContent : undefined
        patchReply(reply.id, { content: formatConciergeError(partial ?? latest, errorMessage(err) || FALLBACK_ERROR), status: "error" })
        eventsRef.current.onError?.()
      })
      .finally(() => {
        if (abortRef.current !== controller) return
        abortRef.current = null
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
