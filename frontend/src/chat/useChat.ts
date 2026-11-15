import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { errorMessage } from "../effect/errors"
import { invokeDeepseek } from "../lib/apiService"
import { useReloadBlock } from "@/hooks/useReloadBlock"
import { chatReducer, initialChat, isBusy, type ChatEvent, type ChatState } from "./chatMachine"
import { FALLBACK_ERROR, loadChat, saveChat, toHistory, toPrompt } from "./conversation"

export type { ChatMessage, ChatRole } from "./conversation"
export { STORAGE_KEY } from "./conversation"

export type ChatEvents = {
  onSend?: () => void
  /** A chunk of the reply was shown. */
  onChunk?: () => void
  /** `local`: the reply came from `intercept` or a world order, not prose from the model. */
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
  onWorld?: (content: string | null, failed: boolean) => { text: string; ok: boolean }
}

const isAbort = (err: unknown) => err instanceof DOMException && err.name === "AbortError"

const partialOf = (err: unknown): string | null => {
  if (typeof err !== "object" || err === null || !("partialContent" in err)) return null
  const partial = (err as { partialContent: unknown }).partialContent
  return typeof partial === "string" ? partial : null
}

/**
 * Conversation state for the chatbot. The decisions are `chatReducer`'s; this
 * hook does the work (intercept, stream via `invokeDeepseek`, world orders),
 * reports it as events, and fires `events` on the transitions that matter to
 * the mascot (hop on send, mouth flaps per chunk, squish when done, droop on
 * error). The conversation is saved whenever a turn starts or settles, and on
 * `pagehide`, so a reload mid-reply keeps the question and what had arrived.
 */
export function useChat(events: ChatEvents = {}) {
  const [state, setState] = useState<ChatState>(() => initialChat(loadChat()))
  // The reducer runs here, not inside setState, so each transition is known
  // at once (to fire mascot events and persist) and runs exactly once.
  const stateRef = useRef(state)
  const eventsRef = useRef(events)
  const abortRef = useRef<AbortController | null>(null)
  useLayoutEffect(() => {
    eventsRef.current = events
  })

  const dispatch = useCallback((event: ChatEvent) => {
    const prev = stateRef.current
    const next = chatReducer(prev, event)
    if (next === prev) return prev
    stateRef.current = next
    setState(next)
    // A turn started or settled (or the chat was cleared): not on every chunk.
    if (next.messages !== prev.messages && (next.turn.phase === "idle" || prev.turn.phase === "idle")) saveChat(next.messages)
    return next
  }, [])

  // An update must not reload the page under a reply that is still coming.
  useReloadBlock("lim-turn", state.turn.phase !== "idle")

  useEffect(() => {
    const flush = () => saveChat(stateRef.current.messages)
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush()
    }
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", onHidden)
    return () => {
      window.removeEventListener("pagehide", flush)
      document.removeEventListener("visibilitychange", onHidden)
      abortRef.current?.abort()
    }
  }, [])

  /** Ask `text` (or, for a retry, the last question again). */
  const ask = useCallback(
    (text: string, retry: boolean) => {
      if (isBusy(stateRef.current.turn)) return false
      const before = stateRef.current.messages
      const firstReply = !before.some((m) => m.role === "assistant" && m.status === "done")
      const intercept = eventsRef.current.intercept
      const replyId = crypto.randomUUID()
      const started = dispatch({ type: "SEND", text, retry, userId: crypto.randomUUID(), replyId, at: Date.now(), intercept: Boolean(intercept) })
      if (started.turn.phase === "idle") return false
      const question = started.messages[started.messages.length - 2].content
      const history = toHistory(started.messages.slice(0, -2))

      const controller = new AbortController()
      abortRef.current = controller
      eventsRef.current.onSend?.()
      const phase = () => (stateRef.current.turn.phase !== "idle" && stateRef.current.turn.replyId === replyId ? stateRef.current.turn.phase : null)

      const done = (local: boolean) => eventsRef.current.onDone?.(firstReply, local)
      const fail = (err: unknown) => {
        console.error(err)
        const after = dispatch({ type: "FAIL", replyId, error: errorMessage(err) || FALLBACK_ERROR, partial: partialOf(err) })
        if (after.lastOutcome === "failed") eventsRef.current.onError?.()
      }
      /** An order that failed part-way: the show still has to end, and Lim owns up to it. */
      const dropOrder = () => {
        const line = eventsRef.current.onWorld?.(null, true).text ?? ""
        dispatch({ type: "ORDER_RESULT", replyId, text: line, order: "" })
      }

      const answer = async () => {
        let latest = ""
        try {
          await invokeDeepseek(
            question,
            history,
            (content) => {
              if (controller.signal.aborted) return
              latest = content
              const was = phase()
              const now = dispatch({ type: "CHUNK", replyId, content, worldAware: Boolean(eventsRef.current.onWorld), at: Date.now() })
              const is = now.turn.phase
              if (is === "ordering" && was !== "ordering") eventsRef.current.onWorldStart?.()
              if (is === "streaming") eventsRef.current.onChunk?.()
            },
            controller.signal,
            eventsRef.current.world?.() ?? undefined,
          )
        } catch (err) {
          if (isAbort(err) || controller.signal.aborted || phase() === null) return
          if (phase() === "ordering") return dropOrder()
          return fail(err)
        }
        if (phase() === "ordering") {
          const result = eventsRef.current.onWorld!(latest, false)
          // A good order goes back to the model as the order it was; one that came to nothing is left out.
          dispatch({ type: "ORDER_RESULT", replyId, text: result.text, order: result.ok ? latest : "" })
          return done(true)
        }
        if (dispatch({ type: "STREAM_END", replyId, content: latest }).lastOutcome === "answered") done(false)
      }

      void (async () => {
        if (intercept) {
          const handled = await intercept(question, controller.signal).catch(() => null)
          if (controller.signal.aborted || phase() !== "intercepting") return
          if (handled !== null) {
            dispatch({ type: "INTERCEPT_HIT", replyId, text: handled })
            return done(true)
          }
          dispatch({ type: "INTERCEPT_MISS", replyId })
        }
        await answer()
      })().finally(() => {
        if (abortRef.current === controller) abortRef.current = null
      })
      return true
    },
    [dispatch],
  )

  const send = useCallback((raw: string) => {
    const text = toPrompt(raw)
    return text ? ask(text, false) : false
  }, [ask])

  const stop = useCallback(() => {
    const turn = stateRef.current.turn
    if (turn.phase === "idle") return
    const ordering = turn.phase === "ordering"
    abortRef.current?.abort()
    abortRef.current = null
    dispatch({ type: "STOP", replyId: turn.replyId })
    // Stopped by the visitor mid-order: the conjuring ends, with nothing to add.
    if (ordering) eventsRef.current.onWorld?.(null, false)
  }, [dispatch])

  /** Re-ask the last question, replacing its reply (regenerate and retry). */
  const regenerate = useCallback(() => void ask("", true), [ask])

  const newChat = useCallback(() => {
    if (stateRef.current.turn.phase === "ordering") eventsRef.current.onWorld?.(null, false)
    abortRef.current?.abort()
    abortRef.current = null
    dispatch({ type: "RESET" })
  }, [dispatch])

  /** Lim's mood from the last turn has worn off. */
  const calm = useCallback(() => void dispatch({ type: "CALM" }), [dispatch])

  return {
    messages: state.messages,
    turn: state.turn,
    lastOutcome: state.lastOutcome,
    busy: isBusy(state.turn),
    send,
    stop,
    regenerate,
    newChat,
    calm,
  }
}
