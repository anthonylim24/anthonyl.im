import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useLocation } from "react-router-dom"
import { MessageCircleHeart, Send, Sparkles, X } from "lucide-react"
import { streamKoreaChat, type KoreaChatMessage } from "./koreaChatApi"
import { ConciergeText } from "./ConciergeText"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
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
  const pinnedRef = useRef(true)
  const titleId = useId()

  const suggestions = slug ? DAY_SUGGESTIONS : TRIP_SUGGESTIONS

  // Centralised close: abort any in-flight stream so we don't leave an
  // orphaned (billed) Gemini request running, then hide the panel.
  const handleClose = useCallback(() => {
    abortRef.current?.abort()
    setOpen(false)
  }, [])

  // Keep the transcript pinned to the bottom while it's near the bottom —
  // streaming tokens shouldn't yank the view if the user has scrolled up.
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current
    if (el && pinnedRef.current) el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

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
    vv.addEventListener("scroll", update)
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
      setKbInset(0)
    }
  }, [open])

  // Abort any in-flight stream on unmount.
  useEffect(() => () => abortRef.current?.abort(), [])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }, [])

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

      setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", content: "" }])
      setInput("")
      setStreaming(true)
      pinnedRef.current = true

      const controller = new AbortController()
      abortRef.current = controller

      const setAssistant = (content: string) =>
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content } : m)))

      try {
        const { content, error } = await streamKoreaChat(prompt, history, slug, setAssistant, controller.signal)
        if (error) setAssistant(`⚠️ ${error}`)
        // Defensive fallback: if the stream ended with no text and no error,
        // don't leave the bubble stuck on the typing indicator.
        else if (!content.trim()) {
          setAssistant("I couldn't generate a reply just now. Please try rephrasing.")
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setAssistant(
            `⚠️ ${(err as Error).message || "Something went wrong. Please try again."}`,
          )
        }
      } finally {
        setStreaming(false)
        inFlightRef.current = false
        abortRef.current = null
      }
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
            className="group fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-lg shadow-rose-500/30 outline-none ring-rose-300 transition-shadow hover:shadow-xl hover:shadow-rose-500/40 focus-visible:ring-4 dark:from-rose-400 dark:to-amber-400 dark:shadow-rose-400/20"
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)" }}
          >
            <MessageCircleHeart className="h-6 w-6" strokeWidth={2} />
            <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/25" aria-hidden />
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
              className="fixed inset-0 z-[55] bg-stone-950/40 backdrop-blur-[2px] md:bg-transparent md:backdrop-blur-0 md:pointer-events-none"
              aria-hidden
            />

            <motion.div
              {...panelMotion}
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="fixed inset-x-0 bottom-0 z-[60] mx-auto flex h-[86dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-stone-200 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-stone-800 dark:bg-stone-950/95 md:inset-x-auto md:bottom-6 md:right-6 md:h-[600px] md:max-h-[calc(100dvh-3rem)] md:w-[400px] md:rounded-3xl"
              style={kbInset > 0 ? { bottom: kbInset } : undefined}
            >
              {/* Header */}
              <header className="flex items-center gap-3 border-b border-stone-200/80 px-4 py-3 dark:border-stone-800/80">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-amber-500 text-white dark:from-rose-400 dark:to-amber-400">
                  <Sparkles className="h-4 w-4" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id={titleId} className="truncate text-[15px] font-semibold text-stone-900 dark:text-stone-100">
                    Trip Concierge
                  </h2>
                  <p className="truncate text-xs text-stone-500 dark:text-stone-400">
                    {slug ? "Knows today's plan · ask anything" : "Korea itinerary · ask anything"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Close chat"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>

              {/* Transcript */}
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                {messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-400">
                      <MessageCircleHeart className="h-6 w-6" />
                    </span>
                    <p className="max-w-[16rem] text-sm text-stone-500 dark:text-stone-400">
                      Your concierge for the Korea trip — restaurants, the day's plan, reservations, and logistics.
                    </p>
                  </div>
                ) : (
                  messages.map((m) =>
                    m.role === "user" ? (
                      <div key={m.id} className="flex justify-end">
                        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-rose-500 px-3.5 py-2 text-[15px] leading-relaxed text-white shadow-sm dark:bg-rose-500">
                          {m.content}
                        </div>
                      </div>
                    ) : (
                      <div key={m.id} className="flex justify-start">
                        <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-stone-100 px-3.5 py-2.5 text-stone-800 dark:bg-stone-800/80 dark:text-stone-100">
                          {m.content ? (
                            <ConciergeText text={m.content} />
                          ) : (
                            <TypingDots reduce={!!reduce} />
                          )}
                        </div>
                      </div>
                    ),
                  )
                )}
              </div>

              {/* Suggestions (only before the first message) */}
              {messages.length === 0 && (
                <div className="flex flex-wrap gap-2 px-4 pb-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-rose-500/50 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {/* Composer */}
              <form
                onSubmit={onSubmit}
                className="border-t border-stone-200/80 px-3 pt-3 dark:border-stone-800/80"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
              >
                <div className="flex items-end gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 focus-within:border-rose-300 focus-within:ring-2 focus-within:ring-rose-200/60 dark:border-stone-700 dark:bg-stone-900 dark:focus-within:border-rose-500/50 dark:focus-within:ring-rose-500/20">
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
                    className="max-h-28 flex-1 resize-none bg-transparent text-[15px] text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-100 dark:placeholder:text-stone-500"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || streaming}
                    aria-label="Send message"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white transition enabled:hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 dark:bg-rose-500 dark:enabled:hover:bg-rose-400"
                  >
                    <Send className="h-4 w-4" />
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
    <div className="flex items-center gap-1 py-1" aria-label="Concierge is typing">
      {[0, 1, 2].map((i) =>
        reduce ? (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-stone-400 opacity-70 dark:bg-stone-500" />
        ) : (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-stone-400 dark:bg-stone-500"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
          />
        ),
      )}
    </div>
  )
}
