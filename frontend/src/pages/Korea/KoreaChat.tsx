import { sx } from '@/styles/merge'
import { koreaChat } from './KoreaChat.stylex'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useLocation } from "react-router-dom"
import { MessageCircleHeart, Send, Sparkles, X } from "lucide-react"
import { useTranscriptAnchor } from "../../hooks/useTranscriptAnchor"
import type { ConciergeSource } from "../../lib/conciergeGrounding"
import { lastMessageIdByRole } from "../../lib/transcriptAnchor"
import { streamKoreaChat, type KoreaChatMessage } from "./koreaChatApi"
import { ConciergeSources } from "./ConciergeSources"
import { ConciergeStreamStatus, ConciergeText } from "./ConciergeText"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  error?: string
  sources?: ConciergeSource[]
}

const TRIP_SUGGESTIONS = [
  "What's the best day for shopping?",
  "Which restaurants need reservations?",
  "When and where is the wedding?",
]

const DAY_SUGGESTIONS = [
  "What's the plan today?",
  "Where should we eat near here?",
  "What's my next reservation?",
]

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Derive the focused day slug from the URL (/korea/day/:slug). */
function useFocusedDaySlug(): string | undefined {
  const { pathname } = useLocation()
  return useMemo(() => {
    const match = pathname.match(/\/korea\/day\/([^/?#]+)/)
    return match ? decodeURIComponent(match[1]) : undefined
  }, [pathname])
}

export function KoreaChat() {
  const reduce = useReducedMotion()
  const slug = useFocusedDaySlug()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)

  const [kbInset, setKbInset] = useState(0)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fabRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const inFlightRef = useRef(false)
  const titleId = useId()
  const lastUserId = lastMessageIdByRole(messages, "user")
  const { anchorRef, spacerRef } = useTranscriptAnchor(scrollRef, lastUserId, streaming, open)

  const suggestions = slug ? DAY_SUGGESTIONS : TRIP_SUGGESTIONS

  // Centralised close: abort any in-flight stream so we don't leave an
  // orphaned (billed) Gemini request running, then hide the panel.
  const handleClose = useCallback(() => {
    abortRef.current?.abort()
    setOpen(false)
  }, [])

  // Focus the input when the panel opens; restore focus to the FAB on close.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), reduce ? 0 : 220)
      return () => clearTimeout(t)
    }
    fabRef.current?.focus()
  }, [open, reduce])

  // Escape closes. Tab is trapped within the dialog so keyboard / screen-reader
  // users can't tab into the page obscured behind the modal sheet.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose()
        return
      }
      if (e.key !== "Tab") return
      const root = dialogRef.current
      if (!root) return
      const focusable = root.querySelectorAll<HTMLElement>(
        'button, [href], textarea, input, select, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, handleClose])

  // Lock body scroll on mobile while the sheet is open so the parchment page
  // doesn't scroll/rubber-band behind it. Desktop keeps its docked-widget feel
  // (the backdrop is click-through there), so we only lock on small screens.
  useEffect(() => {
    if (!open) return
    if (!window.matchMedia("(max-width: 767px)").matches) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Keyboard avoidance: lift the sheet above the on-screen keyboard on mobile
  // using the Visual Viewport API (iOS Safari won't move fixed elements or
  // shrink dvh for the keyboard on its own).
  useEffect(() => {
    const vv = window.visualViewport
    if (!open || !vv) return
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      // Ignore tiny insets (browser chrome jitter); only react to a real keyboard.
      setKbInset(inset > 120 ? inset : 0)
    }
    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update, { passive: true })
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
      setKbInset(0)
    }
  }, [open])

  // Abort any in-flight stream on unmount.
  useEffect(() => () => abortRef.current?.abort(), [])

  const send = useCallback(
    async (text: string) => {
      const prompt = text.trim()
      // Synchronous latch — guards against a double-tap / double-submit firing
      // two requests before React commits the `streaming` state update.
      if (!prompt || inFlightRef.current) return
      inFlightRef.current = true

      const history: KoreaChatMessage[] = messages.map((m) => ({ role: m.role, content: m.content }))
      const userMsg: ChatMessage = { id: newId(), role: "user", content: prompt }
      const assistantId = newId()

      const pending = [userMsg, { id: assistantId, role: "assistant" as const, content: "" }]
      setInput("")

      const controller = new AbortController()
      abortRef.current = controller

      const setAssistant = (content: string) =>
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content } : m)))

      setMessages((prev) => [...prev, ...pending])
      setStreaming(true)
      void (async () => {
        try {
          const { content, error, sources } = await streamKoreaChat(prompt, history, slug, setAssistant, controller.signal)
          if (error) {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content, error } : m)),
            )
          }
          // Defensive fallback: if the stream ended with no text and no error,
          // don't leave the bubble stuck on the typing indicator.
          else if (!content.trim()) {
            setAssistant("I couldn't generate a reply just now. Please try rephrasing.")
          }
          if (sources?.length) {
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, sources } : m)))
          }
        } catch (err) {
          if ((err as Error).name !== "AbortError") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, error: (err as Error).message || "Something went wrong. Please try again." }
                  : m,
              ),
            )
          }
        } finally {
          setStreaming(false)
          inFlightRef.current = false
          abortRef.current = null
        }
      })()
    },
    [messages, slug],
  )

  // Auto-grow the composer up to the CSS max-height, then let it scroll.
  const autoGrow = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(() => {
    if (input === "" && inputRef.current) inputRef.current.style.height = "auto"
  }, [input])

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void send(input)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void send(input)
    }
  }

  const panelMotion = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : {
        initial: { opacity: 0, y: 36, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 24, scale: 0.985 },
        transition: { type: "spring" as const, stiffness: 360, damping: 32 },
      }

  return (
    <>
      {/* Floating CTA — bottom-right, above mobile nav + safe area. */}
      <AnimatePresence>
        {!open && (
          <motion.button
            ref={fabRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open trip concierge chat"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            whileTap={reduce ? undefined : { scale: 0.92 }}
            {...sx(koreaChat.s86a88ffb, 'group')}
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)" }}
          >
            <MessageCircleHeart {...sx(koreaChat.scd5b6bd1)} strokeWidth={2} />
            <span {...sx(koreaChat.sd8031ec6)} aria-hidden />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop — dims on mobile, click-to-close. On desktop the panel
                is a docked widget, so the backdrop is invisible + click-through. */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={handleClose}
              {...sx(koreaChat.sc4cd551f)}
              aria-hidden
            />

            <motion.div
              {...panelMotion}
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              {...sx(koreaChat.se72a75ff)}
              style={kbInset > 0 ? { bottom: kbInset } : undefined}
            >
              {/* Header */}
              <header {...sx(koreaChat.se0b9fbba)}>
                <span {...sx(koreaChat.s2ce874cb)}>
                  <Sparkles {...sx(koreaChat.scd3f3ccd)} strokeWidth={2} />
                </span>
                <div {...sx(koreaChat.se30fd43e)}>
                  <h2 id={titleId} {...sx(koreaChat.s31f8ef11)}>
                    Trip Concierge
                  </h2>
                  <p {...sx(koreaChat.sfa5c979c)}>
                    {slug ? "Knows today's plan · ask anything" : "Korea itinerary · ask anything"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Close chat"
                  {...sx(koreaChat.sd9934eff)}
                >
                  <X {...sx(koreaChat.scd4d544f)} />
                </button>
              </header>

              {/* Transcript */}
              <div
                ref={scrollRef}
                {...sx(koreaChat.se370d945)}
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                {messages.length === 0 ? (
                  <div {...sx(koreaChat.sba17ceb3)}>
                    <span {...sx(koreaChat.s8df27599)}>
                      <MessageCircleHeart {...sx(koreaChat.scd5b6bd1)} />
                    </span>
                    <p {...sx(koreaChat.seb1e643f)}>
                      Your concierge for the Korea trip — restaurants, the day's plan, reservations, and logistics.
                    </p>
                  </div>
                ) : (
                  messages.map((m) =>
                    m.role === "user" ? (
                      <div
                        key={m.id}
                        ref={m.id === lastUserId ? anchorRef : undefined}
                        data-transcript-anchor={m.id === lastUserId ? "latest-user" : undefined}
                        {...sx(koreaChat.s9141e77)}
                      >
                        <div {...sx(koreaChat.s64f97e2c)}>
                          {m.content}
                        </div>
                      </div>
                    ) : (
                      <div key={m.id} {...sx(koreaChat.s154e62fe)}>
                        <div {...sx(koreaChat.s1506f4a5)}>
                          {m.content ? (
                            <ConciergeText text={m.content} />
                          ) : m.error ? null : (
                            <TypingDots reduce={!!reduce} />
                          )}
                          <ConciergeStreamStatus error={m.error} />
                          {m.sources ? <ConciergeSources sources={m.sources} /> : null}
                        </div>
                      </div>
                    ),
                  )
                )}
                {messages.length > 0 ? (
                  <div ref={spacerRef} data-transcript-spacer="" aria-hidden {...sx(koreaChat.sad1ad130)} />
                ) : null}
              </div>

              {/* Suggestions (only before the first message) */}
              {messages.length === 0 && (
                <div {...sx(koreaChat.sd37c241a)}>
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      {...sx(koreaChat.s765d3323)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {/* Composer */}
              <form
                onSubmit={onSubmit}
                {...sx(koreaChat.s5cf1a87)}
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
              >
                <div {...sx(koreaChat.sfcaf4953)}>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value)
                      autoGrow()
                    }}
                    onKeyDown={onKeyDown}
                    rows={1}
                    placeholder="Ask about restaurants, your day, reservations…"
                    {...sx(koreaChat.s49466cc0)}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || streaming}
                    aria-label="Send message"
                    {...sx(koreaChat.sbde55540)}
                  >
                    <Send {...sx(koreaChat.scd3f3ccd)} />
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

function TypingDots({ reduce }: { reduce: boolean }) {
  return (
    <div {...sx(koreaChat.s13e3a78a)} aria-label="Concierge is typing">
      {[0, 1, 2].map((i) =>
        reduce ? (
          <span key={i} {...sx(koreaChat.s7d91c25a)} />
        ) : (
          <motion.span
            key={i}
            {...sx(koreaChat.s1b5ecd73)}
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
          />
        ),
      )}
    </div>
  )
}
