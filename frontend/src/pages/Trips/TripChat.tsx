import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useLocation, useNavigate } from "react-router-dom"
import { Maximize2, MessageCircleHeart, Minimize2, Send, Sparkles, X } from "lucide-react"
import {
  conciergePlaceKey,
  type ConciergeMove,
  type ConciergePlace,
  type ConciergeSource,
} from "../../lib/conciergeGrounding"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { useAuthReady, useGetToken } from "@/lib/safeAuth"
import { ConciergeSources } from "../Korea/ConciergeSources"
import { ConciergeText } from "../Korea/ConciergeText"
import { ConciergeMoveCards } from "./ConciergeMoveCards"
import { ConciergePhotoViewer } from "./ConciergePhoto"
import { ConciergePlaceCards } from "./ConciergePlaceCards"
import { findMentionedStops, resolveMoves, stopToConciergePlace, type ResolvedMove } from "./conciergeMoves"
import { conciergeSuggestions } from "./conciergeSuggestions"
import { addItem, dayHasPlaceNamed, itemFromConciergePlace, moveItemToDay, removeItem, updateItem } from "./tripEdits"
import { getTrip, updateTrip } from "./tripsApi"
import { emitTripChanged, useTripChanged } from "./tripsEvents"
import { streamTripChat, type TripChatMessage } from "./tripChatApi"
import { resolveAccent } from "./theme"
import type { Trip, TripAccess } from "./types"
import { ENTER_SPRING, EASE, focusRingClass, mutedInkClass } from "./ui"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  places?: ConciergePlace[]
  moves?: ConciergeMove[]
  sources?: ConciergeSource[]
  addedKeys?: string[]
  removedKeys?: string[]
  appliedMoveKeys?: string[]
  dismissedMoveKeys?: string[]
}

interface PhotoView {
  name: string
  city?: string
  lat?: number
  lng?: number
  url?: string | null
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const PANEL_SHELL =
  "trip-chat-panel fixed inset-x-0 bottom-0 z-[60] mx-auto flex w-full flex-col overflow-hidden rounded-t-3xl border border-stone-200 bg-[var(--trips-surface)] shadow-2xl dark:border-stone-800 md:inset-x-auto md:rounded-3xl"

const PANEL_COMPACT =
  `${PANEL_SHELL} h-[min(86dvh,40rem)] md:bottom-6 md:right-6 md:h-[min(600px,calc(100dvh-3rem))] md:w-[min(400px,calc(100vw-2rem))]`

/** Size comes from CSS breakpoints so a phone is fullscreen even if JS media is stale. */
const PANEL_EXPANDED = `${PANEL_SHELL} trip-chat-panel-expanded`

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

const HEADER_ICON_BTN =
  `flex h-11 w-11 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100 ${focusRingClass}`

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
  const navigate = useNavigate()
  const getToken = useGetToken()
  const readToken = useLatestCallback(getToken)
  const authReady = useAuthReady()
  const reduce = useReducedMotion()
  const isDesktop = useMinWidth(768)
  const [trip, setTrip] = useState<Trip | null>(null)
  const [access, setAccess] = useState<TripAccess>("view")
  const [addingKey, setAddingKey] = useState<string | null>(null)
  const [busyMoveKey, setBusyMoveKey] = useState<string | null>(null)
  const [movingItemId, setMovingItemId] = useState<string | null>(null)
  const [photo, setPhoto] = useState<PhotoView | null>(null)
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

  useEffect(() => {
    if (!tripId) {
      setTrip(null)
      setAccess("view")
      return
    }
    let cancelled = false
    void getTrip(readToken, tripId)
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
  }, [tripId, authReady])

  useTripChanged(
    tripId,
    useCallback((next) => {
      setTrip(next)
    }, []),
  )

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
    ? focusedDay.title?.trim()
      ? `Knows ${focusedDay.title}`
      : "Knows today's plan"
    : trip
      ? trip.destinations.slice(0, 2).join(" · ") || trip.name
      : "Ask about this trip"

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
    if (!open || photo) return
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
  }, [open, expanded, handleClose, photo])

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
    async (text: string) => {
      const prompt = text.trim()
      if (!prompt || !tripId || inFlightRef.current) return
      inFlightRef.current = true

      const history: TripChatMessage[] = messages.map((m) => ({ role: m.role, content: m.content }))
      const userMsg: ChatMessage = { id: newId(), role: "user", content: prompt }
      const assistantId = newId()

      const pending = [userMsg, { id: assistantId, role: "assistant" as const, content: "" }]
      setInput("")
      pinnedRef.current = true

      const controller = new AbortController()
      abortRef.current = controller

      const setAssistant = (content: string) =>
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content } : m)))

      setMessages((prev) => [...prev, ...pending])
      setStreaming(true)
      void (async () => {
        let activeTrip = trip
        if (!activeTrip) {
          try {
            const loaded = await getTrip(readToken, tripId)
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
          const { content, error, places, moves, sources } = await streamTripChat(
            canonicalId,
            prompt,
            history,
            focusedDayId,
            readToken,
            setAssistant,
            controller.signal,
            activeTrip ?? undefined,
          )
          if (error) setAssistant(`⚠️ ${error}`)
          else if (!content.trim() && !places?.length && !moves?.length) {
            setAssistant("I couldn't generate a reply just now. Please try rephrasing.")
          }
          if (places?.length || moves?.length || sources?.length) {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, places, moves, sources } : m)),
            )
          }
        } catch (err) {
          if ((err as Error).name !== "AbortError") {
            setAssistant(`⚠️ ${(err as Error).message || "Something went wrong. Please try again."}`)
          }
        } finally {
          setStreaming(false)
          inFlightRef.current = false
          abortRef.current = null
        }
      })()
    },
    [messages, tripId, dayId, trip, readToken],
  )

  const canEdit = access === "edit" || access === "owner"

  const persistTripDays = useCallback(
    async (mutate: (fresh: Trip) => Trip["days"]) => {
      if (!tripId) throw new Error("No trip is open.")
      const { trip: fresh } = await getTrip(readToken, tripId)
      const next = await updateTrip(readToken, fresh.id, { days: mutate(fresh) })
      setTrip(next)
      emitTripChanged(next)
      return next
    },
    [tripId, readToken],
  )

  const addPlace = useCallback(
    async (place: ConciergePlace, targetDayId: string) => {
      if (!tripId || !canEdit) return
      const key = conciergePlaceKey(place)
      setAddingKey(key)
      try {
        const { trip: fresh } = await getTrip(readToken, tripId)
        const day = fresh.days.find((d) => d.id === targetDayId)
        if (!day) throw new Error("That day is no longer on the trip.")
        if (dayHasPlaceNamed(day, place.name)) {
          setTrip(fresh)
          setMessages((prev) =>
            prev.map((m) =>
              m.places?.some((p) => conciergePlaceKey(p) === key)
                ? { ...m, addedKeys: [...new Set([...(m.addedKeys ?? []), key])] }
                : m,
            ),
          )
          return
        }
        const next = await updateTrip(readToken, fresh.id, {
          days: addItem(fresh.days, targetDayId, itemFromConciergePlace(place)),
        })
        setTrip(next)
        emitTripChanged(next)
        setMessages((prev) =>
          prev.map((m) =>
            m.places?.some((p) => conciergePlaceKey(p) === key)
              ? { ...m, addedKeys: [...new Set([...(m.addedKeys ?? []), key])] }
              : m,
          ),
        )
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.places?.some((p) => conciergePlaceKey(p) === key)
              ? { ...m, content: `${m.content}\n\n⚠️ ${(err as Error).message || "Could not add that place."}` }
              : m,
          ),
        )
      } finally {
        setAddingKey(null)
      }
    },
    [tripId, canEdit, readToken],
  )

  const patchMessage = useCallback((match: (m: ChatMessage) => boolean, patch: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => prev.map((m) => (match(m) ? patch(m) : m)))
  }, [])

  const removePlace = useCallback(
    async (place: ConciergePlace) => {
      if (!tripId || !canEdit || !place.itemId || !place.dayId) return
      const itemId = place.itemId
      try {
        await persistTripDays((fresh) => removeItem(fresh.days, place.dayId!, itemId))
        patchMessage(
          (m) => Boolean(m.places?.some((p) => p.itemId === itemId) || m.moves?.some((mv) => mv.name === place.name)),
          (m) => ({ ...m, removedKeys: [...new Set([...(m.removedKeys ?? []), itemId])] }),
        )
      } catch (err) {
        patchMessage(
          (m) => Boolean(m.places?.some((p) => p.itemId === itemId)),
          (m) => ({ ...m, content: `${m.content}\n\n⚠️ ${(err as Error).message || "Could not remove that place."}` }),
        )
      }
    },
    [tripId, canEdit, persistTripDays, patchMessage],
  )

  const movePlace = useCallback(
    async (place: ConciergePlace, toDayId: string) => {
      if (!tripId || !canEdit || !place.itemId || !place.dayId || place.dayId === toDayId) return
      setMovingItemId(place.itemId)
      try {
        await persistTripDays((fresh) => moveItemToDay(fresh.days, place.dayId!, place.itemId!, toDayId))
      } catch (err) {
        patchMessage(
          (m) => Boolean(m.places?.some((p) => p.itemId === place.itemId)),
          (m) => ({ ...m, content: `${m.content}\n\n⚠️ ${(err as Error).message || "Could not move that place."}` }),
        )
      } finally {
        setMovingItemId(null)
      }
    },
    [tripId, canEdit, persistTripDays, patchMessage],
  )

  const applyMove = useCallback(
    async (messageId: string, resolved: ResolvedMove) => {
      if (!tripId || !canEdit) return
      setBusyMoveKey(resolved.key)
      try {
        await persistTripDays((fresh) => {
          if (resolved.move.type === "remove") {
            return removeItem(fresh.days, resolved.stop.day.id, resolved.stop.item.id)
          }
          if (resolved.move.type === "move" && resolved.toDay) {
            return moveItemToDay(fresh.days, resolved.stop.day.id, resolved.stop.item.id, resolved.toDay.id)
          }
          if (resolved.move.type === "set_time" && resolved.move.time) {
            return updateItem(fresh.days, resolved.stop.day.id, resolved.stop.item.id, { time: resolved.move.time })
          }
          return fresh.days
        })
        patchMessage(
          (m) => m.id === messageId,
          (m) => ({
            ...m,
            appliedMoveKeys: [...new Set([...(m.appliedMoveKeys ?? []), resolved.key])],
            removedKeys:
              resolved.move.type === "remove"
                ? [...new Set([...(m.removedKeys ?? []), resolved.stop.item.id])]
                : m.removedKeys,
          }),
        )
      } catch (err) {
        patchMessage(
          (m) => m.id === messageId,
          (m) => ({ ...m, content: `${m.content}\n\n⚠️ ${(err as Error).message || "Could not update the itinerary."}` }),
        )
      } finally {
        setBusyMoveKey(null)
      }
    },
    [tripId, canEdit, persistTripDays, patchMessage],
  )

  const openPhotos = useCallback(
    (place: ConciergePlace) => {
      setPhoto({
        name: place.name,
        city: trip?.days.find((d) => d.id === place.dayId)?.city ?? trip?.destinations[0],
        lat: place.lat,
        lng: place.lng,
      })
    },
    [trip],
  )

  const openMap = useCallback(
    (place: ConciergePlace) => {
      if (!tripId) return
      const targetDay = place.dayId && trip?.days.some((d) => d.id === place.dayId) ? place.dayId : dayId
      if (!targetDay) return
      const params = new URLSearchParams({ map: "1" })
      if (place.itemId) params.set("focus", place.itemId)
      navigate(`/trips/${encodeURIComponent(tripId)}/day/${encodeURIComponent(targetDay)}?${params}`)
      setExpanded(false)
      if (!isDesktop) setOpen(false)
    },
    [tripId, trip, dayId, navigate, isDesktop],
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

  let lastAssistantId: string | undefined
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant") {
      lastAssistantId = messages[i]!.id
      break
    }
  }

  const accent = resolveAccent(trip?.appearance?.accent)
  const panelClass = expanded ? PANEL_EXPANDED : PANEL_COMPACT
  const panelStyle: CSSProperties = {
    ...(kbInset > 0 && !expanded ? { bottom: kbInset } : {}),
    ...(expanded
      ? { ["--trip-chat-kb" as string]: kbInset > 0 ? `${kbInset}px` : "0px" }
      : {}),
  }

  const panelMotion =
    reduce || expanded
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
      : {
          initial: { opacity: 0, y: 28, scale: 0.98 },
          animate: { opacity: 1, y: 0, scale: 1 },
          exit: { opacity: 0, y: 18, scale: 0.985 },
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
            transition={reduce ? { duration: 0.15 } : { type: "spring", stiffness: 400, damping: 28 }}
            className={`fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--trips-accent)] text-white shadow-lg outline-none hover:bg-[color:var(--trips-accent-hover)] ${focusRingClass} dark:text-stone-950`}
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)" }}
          >
            <MessageCircleHeart className="h-6 w-6" strokeWidth={2} />
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
              transition={{ duration: 0.18, ease: EASE }}
              onClick={handleClose}
              className={
                expanded
                  ? "fixed inset-0 z-[55] bg-stone-950/40"
                  : "fixed inset-0 z-[55] bg-stone-950/40 md:pointer-events-none md:bg-transparent"
              }
              aria-hidden
            />

            <motion.div
              {...panelMotion}
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              data-expanded={expanded ? "true" : "false"}
              className={panelClass}
              style={panelStyle}
            >
              <header className="flex shrink-0 items-center gap-3 border-b border-stone-200/80 px-4 py-3 dark:border-stone-800/80">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--ta-soft)] text-[color:var(--ta)]">
                  <Sparkles className="h-4 w-4" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id={titleId} className="truncate text-[15px] font-semibold text-stone-900 dark:text-stone-100">
                    Trip Concierge
                  </h2>
                  <p className={`truncate text-xs ${mutedInkClass}`}>{subtitle}</p>
                </div>
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={toggleExpanded}
                    aria-label={expanded ? "Shrink chat" : "Expand chat"}
                    aria-pressed={expanded}
                    title={expanded ? "Shrink chat" : "Expand chat"}
                    className={HEADER_ICON_BTN}
                  >
                    {expanded ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    aria-label="Close chat"
                    className={HEADER_ICON_BTN}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </header>

              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                {messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--ta-soft)] text-[color:var(--ta)]">
                      <MessageCircleHeart className="h-6 w-6" />
                    </span>
                    <p className={`max-w-[18rem] text-sm ${mutedInkClass}`}>
                      {trip
                        ? `Your concierge for ${trip.name}. Ask about the plan, or a place to add.`
                        : "Your concierge for this itinerary. Ask about the plan, reservations, or where to eat."}
                    </p>
                  </div>
                ) : (
                  messages.map((m) =>
                    m.role === "user" ? (
                      <div key={m.id} className="flex justify-end">
                        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[color:var(--trips-accent)] px-3.5 py-2 text-[15px] leading-relaxed text-white shadow-sm dark:text-stone-950">
                          {m.content}
                        </div>
                      </div>
                    ) : (
                      <AssistantBubble
                        key={m.id}
                        message={m}
                        trip={trip}
                        dayId={dayId}
                        streaming={streaming && m.id === lastAssistantId}
                        reduce={!!reduce}
                        addingKey={addingKey}
                        movingItemId={movingItemId}
                        busyMoveKey={busyMoveKey}
                        canEdit={canEdit}
                        onAdd={(place, targetDayId) => void addPlace(place, targetDayId)}
                        onRemove={(place) => void removePlace(place)}
                        onMove={(place, toDayId) => void movePlace(place, toDayId)}
                        onPhotos={openPhotos}
                        onMap={openMap}
                        onConfirmMove={(resolved) => void applyMove(m.id, resolved)}
                        onDismissMove={(key) =>
                          setMessages((prev) =>
                            prev.map((msg) =>
                              msg.id === m.id
                                ? { ...msg, dismissedMoveKeys: [...new Set([...(msg.dismissedMoveKeys ?? []), key])] }
                                : msg,
                            ),
                          )
                        }
                      />
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
                      className={`min-h-11 rounded-full border border-stone-200 bg-[var(--trips-surface)] px-3 py-1.5 text-left text-xs font-medium text-stone-600 transition hover:border-[color:var(--ta-ring)] hover:bg-[color:var(--ta-soft)] hover:text-[color:var(--ta-strong)] dark:border-stone-700 dark:text-stone-300 ${focusRingClass}`}
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
                className="border-t border-stone-200/80 px-3 pt-3 dark:border-stone-800/80"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
              >
                <div className="flex items-end gap-2 rounded-2xl border border-stone-200 bg-stone-50/90 px-3 py-2 focus-within:border-[color:var(--trips-accent)] focus-within:ring-2 focus-within:ring-[color:var(--trips-focus)] dark:border-stone-700 dark:bg-stone-900">
                  <textarea
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
                    className={`min-h-7 flex-1 resize-none bg-transparent py-0.5 text-[16px] leading-6 text-stone-900 outline-none placeholder:text-stone-400 sm:text-[15px] dark:text-stone-100 dark:placeholder:text-stone-400 ${expanded ? "max-h-48" : "max-h-28"}`}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || streaming}
                    aria-label="Send message"
                    className={`relative mb-px flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--trips-accent)] text-white transition before:absolute before:-inset-2 before:content-[''] enabled:hover:bg-[color:var(--trips-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40 dark:text-stone-950 ${focusRingClass}`}
                  >
                    <Send className="h-3.5 w-3.5" strokeWidth={2} />
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
      {photo ? (
        <ConciergePhotoViewer
          name={photo.name}
          city={photo.city}
          lat={photo.lat}
          lng={photo.lng}
          initialUrl={photo.url}
          onClose={() => setPhoto(null)}
        />
      ) : null}
    </div>
  )
}

function AssistantBubble({
  message: m,
  trip,
  dayId,
  streaming,
  reduce,
  addingKey,
  movingItemId,
  busyMoveKey,
  canEdit,
  onAdd,
  onRemove,
  onMove,
  onPhotos,
  onMap,
  onConfirmMove,
  onDismissMove,
}: {
  message: ChatMessage
  trip: Trip | null
  dayId?: string
  streaming: boolean
  reduce: boolean
  addingKey: string | null
  movingItemId: string | null
  busyMoveKey: string | null
  canEdit: boolean
  onAdd: (place: ConciergePlace, dayId: string) => void
  onRemove: (place: ConciergePlace) => void
  onMove: (place: ConciergePlace, toDayId: string) => void
  onPhotos: (place: ConciergePlace) => void
  onMap: (place: ConciergePlace) => void
  onConfirmMove: (move: ResolvedMove) => void
  onDismissMove: (key: string) => void
}) {
  const mentioned = useMemo(() => {
    if (!trip || !m.content) return []
    const exclude = (m.places ?? []).map((p) => p.name)
    return findMentionedStops(m.content, trip, exclude).map(stopToConciergePlace)
  }, [trip, m.content, m.places])
  const resolvedMoves = useMemo(
    () => (trip && m.moves?.length ? resolveMoves(trip, m.moves) : []),
    [trip, m.moves],
  )

  return (
    <div className="flex justify-start">
      <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-stone-100 px-3.5 py-2.5 text-stone-800 dark:bg-stone-800/80 dark:text-stone-100">
        {m.content ? (
          <div>
            <ConciergeText
              text={m.content}
              bulletClass="bg-[color:var(--ta)]"
              numberClass="text-[color:var(--ta)]"
            />
            {streaming ? <span className="trip-chat-caret" aria-hidden /> : null}
          </div>
        ) : streaming ? (
          <div>
            <p className={`text-sm ${mutedInkClass}`}>Looking this up…</p>
            <TypingDots reduce={reduce} />
          </div>
        ) : m.places?.length || m.moves?.length || m.sources?.length ? null : (
          <TypingDots reduce={reduce} />
        )}
        {m.places && trip ? (
          <ConciergePlaceCards
            places={m.places}
            days={trip.days}
            defaultDayId={dayId}
            city={trip.destinations[0]}
            addedKeys={new Set(m.addedKeys)}
            addingKey={addingKey}
            movingItemId={movingItemId}
            canEdit={canEdit}
            variant="suggest"
            onAdd={onAdd}
            onPhotos={onPhotos}
            onMap={onMap}
          />
        ) : null}
        {mentioned.length > 0 && trip ? (
          <ConciergePlaceCards
            places={mentioned}
            days={trip.days}
            defaultDayId={dayId}
            city={trip.destinations[0]}
            addedKeys={new Set()}
            removedKeys={new Set(m.removedKeys)}
            addingKey={null}
            movingItemId={movingItemId}
            canEdit={canEdit}
            variant="itinerary"
            onRemove={onRemove}
            onMove={onMove}
            onPhotos={onPhotos}
            onMap={onMap}
          />
        ) : null}
        {resolvedMoves.length > 0 ? (
          <ConciergeMoveCards
            moves={resolvedMoves}
            appliedKeys={new Set(m.appliedMoveKeys)}
            dismissedKeys={new Set(m.dismissedMoveKeys)}
            busyKey={busyMoveKey}
            canEdit={canEdit}
            onConfirm={onConfirmMove}
            onDismiss={onDismissMove}
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
