/**
 * One turn of the conversation as a pure state machine. `useChat` performs
 * the work (intercept, stream, world order) and reports what happened as
 * events; this decides what that means for the transcript. Every event names
 * the reply it is about, so a request that no longer owns the chat (Stop,
 * New chat, a newer send) cannot change it.
 */
import { orderState } from "./world/worldApi"
import type { AssistantMessage, ChatMessage } from "./conversation"
import type { LimMood } from "./scene/limScene"

export type Turn =
  | { phase: "idle" }
  /** A chance to answer without the model (Lim's toy world) is being taken. */
  | { phase: "intercepting"; replyId: string }
  /** Asked; nothing shown yet. */
  | { phase: "waiting"; replyId: string }
  /** What has arrived ("@", an opening fence) could still become a world order: shown once it is clear. */
  | { phase: "undecided"; replyId: string; buffered: string }
  | { phase: "streaming"; replyId: string }
  /** The reply is a world order (`@@world …`): it is held back and handed over whole. */
  | { phase: "ordering"; replyId: string; startedAt: number }

/** How the last turn ended; drives Lim's mood once idle. */
export type Outcome = "none" | "answered" | "local" | "failed" | "stopped"

export type ChatState = { messages: ChatMessage[]; turn: Turn; lastOutcome: Outcome }

export type ChatEvent =
  /** `retry` re-asks the last question in place of its reply. */
  | { type: "SEND"; text: string; retry: boolean; userId: string; replyId: string; at: number; intercept: boolean }
  | { type: "INTERCEPT_HIT"; replyId: string; text: string }
  | { type: "INTERCEPT_MISS"; replyId: string }
  /** `content` is the whole reply so far. `worldAware`: the page can take a world order. */
  | { type: "CHUNK"; replyId: string; content: string; worldAware: boolean; at: number }
  | { type: "STREAM_END"; replyId: string; content: string }
  /** A world order was acted on (or came to nothing): `text` is Lim's line, `order` what goes back to the model ("" for none). */
  | { type: "ORDER_RESULT"; replyId: string; text: string; order: string }
  | { type: "FAIL"; replyId: string; error: string; partial: string | null }
  | { type: "STOP"; replyId: string }
  | { type: "RESET" }
  /** Lim's mood from the last turn has worn off (a cheer is over, or the visitor is typing again). */
  | { type: "CALM" }

export const initialChat = (messages: ChatMessage[]): ChatState => ({ messages, turn: { phase: "idle" }, lastOutcome: "none" })

/** The conversation a new question is asked on top of: all of it, or for a retry everything before the last question. */
export function baseFor(messages: ChatMessage[], retry: boolean): { base: ChatMessage[]; text: string | null } {
  if (!retry) return { base: messages, text: null }
  let i = messages.length - 1
  while (i >= 0 && messages[i].role !== "user") i--
  return i < 0 ? { base: messages, text: null } : { base: messages.slice(0, i), text: messages[i].content }
}

const replyIdOf = (turn: Turn) => (turn.phase === "idle" ? null : turn.replyId)

/** Replace one reply; the other messages keep their identity (so memoised rows don't re-render). */
const patch = (messages: ChatMessage[], id: string, next: (m: AssistantMessage) => AssistantMessage) =>
  messages.map((m) => (m.id === id && m.role === "assistant" ? next(m) : m))

const settle = (state: ChatState, id: string, next: (m: AssistantMessage) => AssistantMessage, lastOutcome: Outcome): ChatState => ({
  messages: patch(state.messages, id, next),
  turn: { phase: "idle" },
  lastOutcome,
})

/** What a reply shows so far: an undecided reply's buffer is not on screen yet, but it is what was said. */
const said = (turn: Turn, m: AssistantMessage) => (turn.phase === "undecided" ? turn.buffered : m.content)

export function chatReducer(state: ChatState, event: ChatEvent): ChatState {
  const { turn } = state
  switch (event.type) {
    case "RESET":
      return initialChat([])
    case "CALM":
      return state.lastOutcome === "none" ? state : { ...state, lastOutcome: "none" }
    case "SEND": {
      if (turn.phase !== "idle") return state
      const { base, text: retried } = baseFor(state.messages, event.retry)
      const text = event.retry ? retried : event.text
      if (!text) return state
      const user: ChatMessage = { id: event.userId, role: "user", content: text, timestamp: event.at }
      const reply: ChatMessage = { id: event.replyId, role: "assistant", content: "", timestamp: event.at, status: "streaming" }
      return {
        messages: [...base, user, reply],
        turn: event.intercept ? { phase: "intercepting", replyId: event.replyId } : { phase: "waiting", replyId: event.replyId },
        lastOutcome: "none",
      }
    }
  }

  if (event.replyId !== replyIdOf(turn)) return state
  const id = event.replyId

  switch (event.type) {
    case "INTERCEPT_HIT":
      if (turn.phase !== "intercepting") return state
      return settle(state, id, (m) => ({ ...m, content: event.text, sent: "", status: "done" }), "local")
    case "INTERCEPT_MISS":
      return turn.phase === "intercepting" ? { ...state, turn: { phase: "waiting", replyId: id } } : state
    case "CHUNK": {
      if (turn.phase === "intercepting" || turn.phase === "ordering") return state
      const kind = event.worldAware ? orderState(event.content) : "no"
      if (kind === "maybe") return { ...state, turn: { phase: "undecided", replyId: id, buffered: event.content } }
      if (kind === "yes") {
        // Anything shown before the marker turned up (a preface) goes.
        return { messages: patch(state.messages, id, (m) => ({ ...m, content: "" })), turn: { phase: "ordering", replyId: id, startedAt: event.at }, lastOutcome: state.lastOutcome }
      }
      return { messages: patch(state.messages, id, (m) => ({ ...m, content: event.content })), turn: { phase: "streaming", replyId: id }, lastOutcome: state.lastOutcome }
    }
    case "STREAM_END":
      // An order ends with ORDER_RESULT, once the page has acted on it.
      if (turn.phase === "intercepting" || turn.phase === "ordering") return state
      // Undecided to the end: "@" or a fence was the whole answer.
      return settle(state, id, (m) => ({ ...m, content: event.content, status: "done" }), "answered")
    case "ORDER_RESULT":
      if (turn.phase !== "ordering") return state
      return settle(state, id, (m) => ({ ...m, content: event.text, sent: event.order, status: "done" }), "local")
    case "FAIL":
      // An order that failed is Lim's to own up to (ORDER_RESULT), not a chat error.
      if (turn.phase === "ordering") return state
      return settle(state, id, (m) => ({ ...m, content: event.partial ?? said(turn, m), status: "error", error: event.error }), "failed")
    case "STOP":
      // Stopped mid-order: no half-written order is left on screen.
      return settle(state, id, (m) => ({ ...m, content: turn.phase === "ordering" ? "" : said(turn, m), status: "stopped" }), "stopped")
  }
}

/** Waiting on something: the composer's button stops instead of sends. */
export const isBusy = (turn: Turn) => turn.phase !== "idle"

/** Lim's face: the turn under way, else how the last one ended, else whether the visitor is typing. */
export function moodFor(turn: Turn, lastOutcome: Outcome, typing: boolean): LimMood {
  if (turn.phase === "streaming") return "talking"
  if (turn.phase !== "idle") return "thinking"
  if (lastOutcome === "failed") return "sad"
  if (lastOutcome === "answered") return "happy"
  return typing ? "typing" : "idle"
}

/** What Lim is up to while the model invents something for its world (it can take a while). */
export const MAKING = [
  "Rummaging in the toy box…",
  "Squishing it into shape…",
  "Adding a pinch of sparkle…",
  "Picking the nicest colours…",
  "Blowing on it to dry…",
  "Nearly there…",
  "This one's tricky…",
  "Still squishing…",
  "Worth the wait, promise…",
]
export const MAKING_STEP_MS = 2_200

/** The progress line for an order being written, `now` ms into the turn; once the list runs out, the last three cycle. */
export function makingLine(turn: Turn, now: number): string | null {
  if (turn.phase !== "ordering") return null
  const n = Math.max(0, Math.floor((now - turn.startedAt) / MAKING_STEP_MS))
  return MAKING[n < MAKING.length ? n : MAKING.length - 3 + ((n - MAKING.length) % 3)]
}
