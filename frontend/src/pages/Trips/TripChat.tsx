import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useLocation } from "react-router-dom"
import { Maximize2, MessageCircle, Minimize2, Send, X } from "lucide-react"
import { conciergePlaceKey, type ConciergePlace, type ConciergeSource } from "../../lib/conciergeGrounding"
import { useGetToken } from "@/lib/safeAuth"
import { ConciergeSources } from "../Korea/ConciergeSources"
import { ConciergeText } from "../Korea/ConciergeText"
import { ConciergePlaceCards } from "./ConciergePlaceCards"
import { conciergeSuggestions } from "./conciergeSuggestions"
import { addItem, dayHasPlaceNamed, itemFromConciergePlace } from "./tripEdits"
import { getTrip, updateTrip } from "./tripsApi"
import { emitTripChanged } from "./tripsEvents"
import { streamTripChat, type TripChatMessage } from "./tripChatApi"
import { resolveAccent } from "./theme"
import type { Trip, TripAccess } from "./types"
import {
  DISPLAY,
  ENTER_SPRING,
  EXIT_FADE,
  alertErrorClass,
  chipBtnClass,
  displayCardClass,
  fieldShellClass,
  focusRingClass,
  ghostOnTintBtnClass,
  iconBtnClass,
  inkClass,
  labelClass,
  mutedInkClass,
  skeletonClass,
} from "./ui"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  places?: ConciergePlace[]
  sources?: ConciergeSource[]
  addedKeys?: string[]
  error?: string
  placeError?: { key: string; message: string }
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const PANEL_SHELL =
  "trip-chat-panel fixed inset-x-0 bottom-0 z-[60] mx-auto flex w-full flex-col overflow-hidden rounded-t-[var(--tr-r-panel)] border border-[color:var(--tr-line)] bg-[var(--tr-surface)] shadow-[var(--tr-shadow)] md:inset-x-auto md:rounded-[var(--tr-r-panel)]"

const PANEL_COMPACT =
  `${PANEL_SHELL} h-[min(86dvh,40rem)] md:bottom-6 md:right-6 md:h-[min(600px,calc(100dvh-3rem))] md:w-[min(400px,calc(100vw-2rem))]`

const PANEL_EXPANDED_MOBILE =
  `${PANEL_SHELL} trip-chat-panel-expanded h-[min(92dvh,calc(100svh-0.75rem))]`

/** No height utility - desktop size is an inline inset so Tailwind cannot clip the composer. */
const PANEL_EXPANDED_DESKTOP = `${PANEL_SHELL} trip-chat-panel-expanded`

const EXPANDED_DESKTOP_STYLE: CSSProperties = {
  top: 16,
  right: 16,
  bottom: 16,
  left: "auto",
  width: "min(36rem, calc(100vw - 2rem))",
  height: "auto",
  maxHeight: "none",
}

const LAUNCHER_CLASS =
  `fixed right-4 z-40 inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full bg-[color:var(--ta)] px-0 text-[color:var(--ta-ink)] shadow-[var(--tr-shadow)] outline-none hover:bg-[color:var(--ta-strong)] active:translate-y-px motion-reduce:active:translate-y-0 md:px-4 ${focusRingClass}`

const SCRIM =
  "bg-[color-mix(in_srgb,var(--tr-ink)_40%,transparent)]"

function useMinWidth(px: number): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${px}px)`)
    const sync = () => setMatches(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [px])
  return matches
}

/** Concierge lives on the trip dossier and day pages, not the index, create, or editor. */
export function useTripChatRoute(): { tripId?: string; dayId?: string } {
  const { pathname } = useLocation()
  return useMemo(() => {
    const day = pathname.match(/^\/trips\/([^/]+)\/day\/([^/?#]+)/)
    if (day) {
      return { tripId: decodeURIComponent(day[1]), dayId: decodeURIComponent(day[2]) }
    }
    const overview = pathname.match(/^\/trips\/([^/]+)\/?$/)
    if (overview && overview[1] !== "new") {
      return { tripId: decodeURIComponent(overview[1]) }
    }
    return {}
  }, [pathname])
}

export function TripChat() {
  const { tripId, dayId } = useTripChatRoute()
  const getToken = useGetToken()
  const reduce = useReducedMotion()
  const isDesktop = useMinWidth(768)
  const [trip, setTrip] = useState<Trip | null>(null)
  const [access, setAccess] = useState<TripAccess>("view")
  const [addingKey, setAddingKey] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
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
  const subtitleId = useId()
  const composerId = useId()

  useEffect(() => {
    if (!tripId) {
      setTrip(null)
      setAccess("view")
      return
    }
    let cancelled = false
    void getTrip(getToken, tripId)
      .then(({ trip: next, access: nextAccess }) => {
        if (!cancelled) {
          setTrip(next)
          setAccess(nextAccess)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTrip(null)
          setAccess("view")
        }
      })
    return () => {
      cancelled = true
    }
  }, [tripId, getToken])

  useEffect(() => {
    setMessages([])
    setInput("")
  }, [tripId])

  const suggestions = useMemo(
    () => (trip ? conciergeSuggestions(trip, dayId) : []),
    [trip, dayId],
  )

  const focusedDay = dayId && trip ? trip.days.find((d) => d.id === dayId) : undefined
  const subtitle = focusedDay
    ? focusedDay.title?.trim() || "Today's plan"
    : trip
      ? trip.destinations.slice(0, 2).join(" · ") || trip.name
      : "This trip"

  const handleClose = useCallback(() => {
    abortRef.current?.abort()
    setOpen(false)
    setExpanded(false)
  }, [])

  const toggleExpanded = useCallback(() => {
    setExpanded((current) => !current)
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current
    if (el && pinnedRef.current) el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (!open) {
      fabRef.current?.focus()
      return
    }
    const t = setTimeout(() => inputRef.current?.focus(), reduce ? 0 : 220)
    return () => clearTimeout(t)
  }, [open, reduce])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (expanded) {
          setExpanded(false)
          return
        }
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
  }, [open, expanded, handleClose])

  useEffect(() => {
    if (!open) return
    const lockPage = expanded || !isDesktop
    if (!lockPage) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open, expanded, isDesktop])

  useEffect(() => {
    const vv = window.visualViewport
    if (!open || !vv) return
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
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

  useEffect(() => () => abortRef.current?.abort(), [])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }, [])

  const send = useCallback(
    async (text: string, opts?: { retryOf?: string }) => {
      const prompt = text.trim()
      if (!prompt || !tripId || inFlightRef.current) return
      inFlightRef.current = true

      const history: TripChatMessage[] = messages
        .filter((m) => m.id !== opts?.retryOf)
        .map((m) => ({ role: m.role, content: m.content }))
      const userMsg: ChatMessage = { id: newId(), role: "user", content: prompt }
      const assistantId = newId()

      setMessages((prev) => {
        const base = opts?.retryOf ? prev.filter((m) => m.id !== opts.retryOf) : prev
        if (opts?.retryOf) {
          return [...base, { id: assistantId, role: "assistant", content: "" }]
        }
        return [...base, userMsg, { id: assistantId, role: "assistant", content: "" }]
      })
      if (!opts?.retryOf) setInput("")
      setStreaming(true)
      pinnedRef.current = true

      const controller = new AbortController()
      abortRef.current = controller

      const setAssistant = (content: string) =>
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content, error: undefined } : m)))

      let activeTrip = trip
      if (!activeTrip) {
        try {
          const loaded = await getTrip(getToken, tripId)
          activeTrip = loaded.trip
          setTrip(activeTrip)
          setAccess(loaded.access)
        } catch {
          activeTrip = null
        }
      }

      const canonicalId = activeTrip?.id ?? tripId
      const focusedDayId =
        dayId && activeTrip?.days.some((d) => d.id === dayId) ? dayId : undefined

      try {
        const { content, error, places, sources } = await streamTripChat(
          canonicalId,
          prompt,
          history,
          focusedDayId,
          getToken,
          setAssistant,
          controller.signal,
          activeTrip ?? undefined,
        )
        if (error) {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content, error } : m)),
          )
        } else if (!content.trim() && !places?.length) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, error: "The concierge could not generate a reply. Try again." }
                : m,
            ),
          )
        } else if (content) {
          setAssistant(content)
        }
        if (places?.length || sources?.length) {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, places, sources } : m)),
          )
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
    },
    [messages, tripId, dayId, trip, getToken],
  )

  const retryReply = useCallback(
    (assistantId: string) => {
      const idx = messages.findIndex((m) => m.id === assistantId)
      const prior = idx > 0 ? messages[idx - 1] : undefined
      if (!prior || prior.role !== "user") return
      void send(prior.content, { retryOf: assistantId })
    },
    [messages, send],
  )

  const canEdit = access === "edit" || access === "owner"

  const addPlace = useCallback(
    async (place: ConciergePlace, targetDayId: string) => {
      if (!tripId || !canEdit) return
      const key = conciergePlaceKey(place)
      setAddingKey(key)
      try {
        const { trip: fresh } = await getTrip(getToken, tripId)
        const day = fresh.days.find((d) => d.id === targetDayId)
        if (!day) throw new Error("That day is no longer on the trip.")
        if (dayHasPlaceNamed(day, place.name)) {
          setTrip(fresh)
          setMessages((prev) =>
            prev.map((m) =>
              m.places?.some((p) => conciergePlaceKey(p) === key)
                ? {
                    ...m,
                    addedKeys: [...new Set([...(m.addedKeys ?? []), key])],
                    placeError: m.placeError?.key === key ? undefined : m.placeError,
                  }
                : m,
            ),
          )
          return
        }
        const next = await updateTrip(getToken, fresh.id, {
          days: addItem(fresh.days, targetDayId, itemFromConciergePlace(place)),
        })
        setTrip(next)
        emitTripChanged(next)
        setMessages((prev) =>
          prev.map((m) =>
            m.places?.some((p) => conciergePlaceKey(p) === key)
              ? {
                  ...m,
                  addedKeys: [...new Set([...(m.addedKeys ?? []), key])],
                  placeError: m.placeError?.key === key ? undefined : m.placeError,
                }
              : m,
          ),
        )
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.places?.some((p) => conciergePlaceKey(p) === key)
              ? {
                  ...m,
                  placeError: {
                    key,
                    message: (err as Error).message || "Could not add that place.",
                  },
                }
              : m,
          ),
        )
      } finally {
        setAddingKey(null)
      }
    },
    [tripId, canEdit, getToken],
  )

  const autoGrow = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(() => {
    if (input === "" && inputRef.current) inputRef.current.style.height = "auto"
  }, [input])

  if (!tripId) return null

  const accent = resolveAccent(trip?.appearance?.accent)
  const panelClassName = expanded
    ? isDesktop
      ? PANEL_EXPANDED_DESKTOP
      : PANEL_EXPANDED_MOBILE
    : PANEL_COMPACT
  const panelStyle: CSSProperties = {
    ...(kbInset > 0 ? { bottom: kbInset } : {}),
    ...(expanded && isDesktop
      ? { ...EXPANDED_DESKTOP_STYLE, bottom: kbInset > 0 ? kbInset : 16 }
      : {}),
  }

  const panelMotion =
    reduce || expanded
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: EXIT_FADE }
      : {
          initial: { opacity: 0, y: 28, scale: 0.98 },
          animate: { opacity: 1, y: 0, scale: 1 },
          exit: { opacity: 0 },
          transition: ENTER_SPRING,
        }

  return (
    <div data-trip-accent={accent}>
      <AnimatePresence>
        {!open && (
          <motion.button
            ref={fabRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open trip concierge chat"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.86 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.86 }}
            transition={reduce ? EXIT_FADE : ENTER_SPRING}
            className={LAUNCHER_CLASS}
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)" }}
          >
            <MessageCircle className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            <span className="hidden text-sm font-semibold md:inline">Ask concierge</span>
          </motion.button>
        )}
      </AnimatePresence>

      {typeof document !== "undefined" &&
        createPortal(
          <div className="trips trip-chat-portal" data-trip-accent={accent}>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={EXIT_FADE}
              onClick={handleClose}
              className={
                expanded
                  ? `fixed inset-0 z-[55] ${SCRIM}`
                  : `fixed inset-0 z-[55] ${SCRIM} md:pointer-events-none md:bg-transparent`
              }
              aria-hidden
            />

            <motion.div
              {...panelMotion}
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={subtitleId}
              data-expanded={expanded ? "true" : "false"}
              className={panelClassName}
              style={panelStyle}
            >
              <header className="flex shrink-0 items-center gap-2 border-b border-[color:var(--tr-line)] px-4 py-2">
                <div className="min-w-0 flex-1">
                  <h2 id={titleId} className={`truncate text-[15px] font-semibold ${inkClass}`}>
                    Trip Concierge
                  </h2>
                  <p id={subtitleId} className={`truncate text-xs ${mutedInkClass}`}>
                    {subtitle}
                  </p>
                </div>
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={toggleExpanded}
                    aria-label={expanded ? "Shrink chat" : "Expand chat"}
                    aria-pressed={expanded}
                    title={expanded ? "Shrink chat" : "Expand chat"}
                    className={iconBtnClass}
                  >
                    {expanded ? (
                      <Minimize2 className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                    ) : (
                      <Maximize2 className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    aria-label="Close chat"
                    className={iconBtnClass}
                  >
                    <X className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                  </button>
                </div>
              </header>

              <div
                ref={scrollRef}
                onScroll={handleScroll}
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                aria-busy={streaming}
                className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                {messages.length === 0 ? (
                  <div className="flex h-full flex-col justify-end gap-3">
                    <p className={displayCardClass} style={DISPLAY}>
                      {trip?.name ?? "This trip"}
                    </p>
                    <p className={`max-w-[36ch] text-sm leading-relaxed ${mutedInkClass}`}>
                      {trip
                        ? "The concierge has this trip's days, reservations, and saved places. Ask about the plan or a place to add."
                        : "The concierge has this itinerary. Ask about the plan, a reservation, or a place to add."}
                    </p>
                  </div>
                ) : (
                  messages.map((m) =>
                    m.role === "user" ? (
                      <div key={m.id} className="flex justify-end">
                        <p className="max-w-[85%] rounded-[var(--tr-r-control)] bg-[color:var(--ta-soft)] px-3.5 py-2 text-[15px] leading-relaxed text-[color:var(--tr-ink)]">
                          {m.content}
                        </p>
                      </div>
                    ) : (
                      <div key={m.id} className="flex justify-start">
                        <div className={`max-w-[88%] ${inkClass}`}>
                          {m.content ? (
                            <ConciergeText
                              text={m.content}
                              bulletClass="bg-[color:var(--ta)]"
                              numberClass="text-[color:var(--ta)]"
                            />
                          ) : m.error ? null : (
                            <StreamingReply />
                          )}
                          {m.error ? (
                            <div className={`mt-2 ${alertErrorClass}`} role="alert">
                              <p>{m.error}</p>
                              <button
                                type="button"
                                onClick={() => void retryReply(m.id)}
                                disabled={streaming}
                                className={`${ghostOnTintBtnClass} mt-2`}
                              >
                                Try again
                              </button>
                            </div>
                          ) : null}
                          {m.places && trip ? (
                            <ConciergePlaceCards
                              places={m.places}
                              days={trip.days}
                              defaultDayId={dayId}
                              addedKeys={new Set(m.addedKeys)}
                              addingKey={addingKey}
                              canEdit={canEdit}
                              errorKey={m.placeError?.key}
                              errorMessage={m.placeError?.message}
                              onAdd={(place, targetDayId) => void addPlace(place, targetDayId)}
                            />
                          ) : null}
                          {m.sources ? (
                            <ConciergeSources
                              sources={m.sources}
                              linkClass="break-words underline decoration-[color:var(--ta-ring)] underline-offset-2 decoration-1 transition hover:text-[color:var(--ta-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--trips-focus)]"
                            />
                          ) : null}
                        </div>
                      </div>
                    ),
                  )
                )}
              </div>

              <div className="shrink-0">
              {messages.length === 0 && suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 px-4 pb-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      className={`${chipBtnClass} text-left`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void send(input)
                }}
                className="border-t border-[color:var(--tr-line)] px-3 pt-3"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
              >
                <label htmlFor={composerId} className={labelClass}>
                  Message
                </label>
                <div className={`${fieldShellClass} mt-1.5 items-end py-1.5`}>
                  <textarea
                    id={composerId}
                    ref={inputRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value)
                      autoGrow()
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        void send(input)
                      }
                    }}
                    rows={1}
                    placeholder="Ask about this trip…"
                    className={`min-h-11 flex-1 resize-none bg-transparent py-2 text-[16px] text-[color:var(--tr-ink)] outline-none placeholder:text-[color:var(--tr-ink-muted)] sm:text-[15px] ${expanded ? "max-h-48" : "max-h-28"}`}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || streaming}
                    aria-label="Send message"
                    className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--tr-r-control)] bg-[color:var(--ta)] text-[color:var(--ta-ink)] transition hover:bg-[color:var(--ta-strong)] active:translate-y-px motion-reduce:active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 ${focusRingClass}`}
                  >
                    <Send className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  </button>
                </div>
              </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
          </div>,
          document.body,
        )}
    </div>
  )
}

function StreamingReply() {
  return (
    <div className="space-y-2 py-1" role="status" aria-label="Writing a reply">
      <div className={`h-3 w-[88%] ${skeletonClass}`} />
      <div className={`h-3 w-[64%] ${skeletonClass}`} />
      <div className={`h-3 w-[76%] ${skeletonClass}`} />
    </div>
  )
}
