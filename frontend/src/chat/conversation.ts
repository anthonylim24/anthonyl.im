/**
 * The conversation as data: message shapes, what is kept in localStorage
 * (and how older saves are read back), and what goes to the model as history.
 * Pure; `useChat` and `chatMachine` build on it.
 */

export type ChatRole = "user" | "assistant"

type MessageBase = {
  id: string
  content: string
  timestamp: number
  /**
   * How this turn goes back to the model as history, when that differs from
   * what is shown: a world order is sent as the order it was (so the model
   * keeps to the format), and "" drops the turn and the question before it
   * (a toy-box reply the model never wrote).
   */
  sent?: string
}

export type UserMessage = MessageBase & { role: "user" }

/** `content` is only ever what Lim wrote; a failure's own line lives in `error`. */
export type ReplyStatus = { status: "streaming" | "done" | "stopped" } | { status: "error"; error: string }

export type AssistantMessage = MessageBase & { role: "assistant" } & ReplyStatus

export type ChatMessage = UserMessage | AssistantMessage

export const STORAGE_KEY = "lim-chat-v1"
const MAX_STORED = 50
export const FALLBACK_ERROR = "The reply didn't come through. Try again."

/** The longest prompt or history message `/api/invoke` accepts (server/src/routes/invoke.ts). */
export const MAX_MESSAGE = 8_000
// The API takes at most 40 earlier messages; toy-world chatter adds up fast, so send the recent ones.
export const HISTORY_MAX = 30

/** Before replies kept their failure apart, it was appended to the text as "⚠️ …". */
const OLD_WARNING = /(?:^|\n\n)⚠️ ([\s\S]*)$/

/** One stored message, cleaned. Null for anything that isn't one. */
function readMessage(raw: unknown): ChatMessage | null {
  if (typeof raw !== "object" || raw === null) return null
  const m = raw as Record<string, unknown>
  if (typeof m.id !== "string" || typeof m.content !== "string") return null
  const base = {
    id: m.id,
    content: m.content,
    timestamp: typeof m.timestamp === "number" ? m.timestamp : 0,
    ...(typeof m.sent === "string" ? { sent: m.sent } : null),
  }
  if (m.role === "user") return { ...base, role: "user" }
  if (m.role !== "assistant") return null
  if (m.status === "error") {
    if (typeof m.error === "string") return { ...base, role: "assistant", status: "error", error: m.error }
    const old = OLD_WARNING.exec(m.content)
    return old
      ? { ...base, role: "assistant", content: m.content.slice(0, old.index).trimEnd(), status: "error", error: old[1].trim() || FALLBACK_ERROR }
      : { ...base, role: "assistant", status: "error", error: FALLBACK_ERROR }
  }
  // A reload mid-stream leaves a half reply; keep it, but as stopped.
  const status = m.status === "done" ? "done" : m.status === "streaming" || m.status === "stopped" ? "stopped" : "done"
  return { ...base, role: "assistant", status }
}

/** The saved conversation, from storage's raw string. Never throws. */
export function readStored(raw: string | null): ChatMessage[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(readMessage).filter((m): m is ChatMessage => m !== null)
  } catch {
    return []
  }
}

/** What is written to storage: the recent messages, with a reply still being written kept as stopped. */
export function toStored(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .slice(-MAX_STORED)
    .map((m) => (m.role === "assistant" && m.status === "streaming" ? { ...m, status: "stopped" as const } : m))
}

export function loadChat(): ChatMessage[] {
  try {
    return readStored(localStorage.getItem(STORAGE_KEY))
  } catch {
    return []
  }
}

export function saveChat(messages: ChatMessage[]) {
  try {
    if (messages.length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(toStored(messages)))
  } catch {
    /* private mode / quota: the chat still works, it just won't persist */
  }
}

/** Never cut between the two halves of a surrogate pair (an emoji, say). */
const isLowSurrogate = (text: string, i: number) => {
  const code = text.charCodeAt(i)
  return code >= 0xdc00 && code <= 0xdfff
}

/**
 * A history turn cut to fit the server's cap. A question keeps its start
 * (where the ask usually is); a reply keeps its end (what the next question
 * follows on from). The result is at most `max` UTF-16 units, which is what
 * the server's zod `.max()` counts.
 */
export function clampTurn(text: string, role: ChatRole, max = MAX_MESSAGE): string {
  if (text.length <= max) return text
  if (role === "user") {
    let end = max - 1
    if (isLowSurrogate(text, end)) end--
    return `${text.slice(0, end)}…`
  }
  let start = text.length - (max - 1)
  if (isLowSurrogate(text, start)) start++
  return `…${text.slice(start)}`
}

/** The conversation as the model sees it before a new question. */
export function toHistory(messages: ChatMessage[]): { role: ChatRole; content: string }[] {
  const turns: { role: ChatRole; content: string }[] = []
  for (const m of messages) {
    if ((m.role === "assistant" && m.status === "error") || !m.content.trim()) continue
    if (m.sent === "") {
      // Lim's own reply to a toy-box order: neither it nor the order is the model's business.
      if (turns[turns.length - 1]?.role === "user") turns.pop()
      continue
    }
    turns.push({ role: m.role, content: clampTurn(m.sent ?? m.content, m.role) })
  }
  // Recent turns only, starting on a question, never two questions in a row (a dropped pair can leave both).
  const recent = turns.slice(-HISTORY_MAX)
  while (recent[0]?.role === "assistant") recent.shift()
  // The new question follows, so the history must not end on an unanswered one.
  while (recent[recent.length - 1]?.role === "user") recent.pop()
  return recent.filter((turn, i) => !(turn.role === "user" && recent[i + 1]?.role === "user"))
}

/** A question as it is sent: trimmed and within the cap. Empty when there is nothing to ask. */
export const toPrompt = (raw: string) => clampTurn(raw.trim(), "user")
