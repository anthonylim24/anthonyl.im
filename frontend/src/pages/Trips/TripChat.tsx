import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useLocation, useNavigate } from "react-router-dom"
import {
  ArrowUp,
  ArrowUpRight,
  CalendarCheck,
  CalendarPlus,
  Compass,
  LocateFixed,
  Maximize2,
  MessageCircle,
  Minimize2,
  Route,
  SquarePen,
  Sun,
  Ticket,
  Utensils,
  X,
  type LucideIcon,
} from "lucide-react"
import { conciergePlaceKey, type ConciergePlace, type ConciergeStatus } from "../../lib/conciergeGrounding"
import { lastMessageIdByRole } from "../../lib/transcriptAnchor"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { useTranscriptAnchor } from "@/hooks/useTranscriptAnchor"
import { useAuthReady, useGetToken } from "@/lib/safeAuth"
import { AssistantMessage } from "./ConciergeMessage"
import { ConciergePhotoViewer } from "./ConciergePhoto"
import type { AddedPlace } from "./ConciergePlaceCards"
import { applyProposal, dayShort, insertByTime, restoreSnapshot, snapshotDays, type DaySnapshot } from "./conciergeProposal"
import { clearConversation, loadConversation, saveConversation, type ChatMessage } from "./conciergeStore"
import { conciergeSuggestions, type Starter, type StarterKind } from "./conciergeSuggestions"
import { dayHasPlaceNamed, itemFromConciergePlace, removeItem } from "./tripEdits"
import { getTrip, updateTrip } from "./tripsApi"
import { emitTripChanged, useTripChanged } from "./tripsEvents"
import { streamTripChat, type TripChatMessage } from "./tripChatApi"
import { resolveAccent, tripTiming } from "./meta"
import type { Trip, TripAccess } from "./types"
import { a } from "./atlas.stylex"
import { c } from "./chat.stylex"
import { sx } from "@/styles/merge"

const EASE = [0.16, 1, 0.3, 1] as const

/** The panel settles into place rather than sliding to a stop. */
const ENTER_SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.7 } as const

const FAB_SPRING = { type: "spring", stiffness: 400, damping: 28 } as const

const STARTER_ICON: Record<StarterKind, LucideIcon> = {
  today: Sun,
  near: LocateFixed,
  plan: CalendarPlus,
  meal: Utensils,
  gap: CalendarCheck,
  booking: Ticket,
  route: Route,
  idea: Compass,
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> }
}

/** Same-document View Transition, or a synchronous update when unsupported. */
function runTripsViewTransition(update: () => void): void {
  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const doc = document as ViewTransitionDocument
  if (reduced || typeof doc.startViewTransition !== "function") {
    update()
    return
  }
  void doc.startViewTransition(update).finished.catch(() => undefined)
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

/** Earlier turns as the server wants them: text plus the cards and change
 *  cards the traveller saw, so "the second one" can be resolved. */
export function toHistory(messages: ChatMessage[]): TripChatMessage[] {
  return messages
    .filter((m) => m.content.trim() || m.proposal)
    .map((m) => {
      const turn: TripChatMessage = { role: m.role, content: m.content }
      if (m.places?.length) {
        turn.places = m.places.slice(0, 8).map((p) => ({
          ...(p.ref ? { ref: p.ref } : {}),
          name: p.name,
          ...(p.address ? { address: p.address } : {}),
          ...(p.lat != null ? { lat: p.lat } : {}),
          ...(p.lng != null ? { lng: p.lng } : {}),
          ...(p.category ? { category: p.category } : {}),
          ...(p.placeId ? { placeId: p.placeId } : {}),
          ...(p.mapsUrl ? { mapsUrl: p.mapsUrl } : {}),
          ...(p.dayId ? { dayId: p.dayId } : {}),
          ...(p.time ? { time: p.time } : {}),
        }))
      }
      if (m.proposal) turn.proposal = { summary: m.proposal.summary, state: m.proposalState ?? "pending" }
      return turn
    })
}

/** One fix, on demand. Resolves null when the browser says no or takes too long. */
function readPosition(timeoutMs = 8000): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 120_000, timeout: timeoutMs },
    )
  })
}

/** Markdown reply → a sentence a screen reader can say once. */
function spoken(text: string): string {
  return text
    .replace(/[*_`#>]+/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700)
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
  const [busyProposal, setBusyProposal] = useState<string | null>(null)
  const [skipped, setSkipped] = useState<Record<string, Record<string, string>>>({})
  const [undoable, setUndoable] = useState<Set<string>>(() => new Set())
  const [photo, setPhoto] = useState<PhotoView | null>(null)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  /** `working`: the reply is being written. `finishing`: the text is done and
   *  only the follow-up prompts are still on their way. */
  const [phase, setPhase] = useState<"idle" | "working" | "finishing">("idle")
  const [status, setStatus] = useState<ConciergeStatus | null>(null)
  const [shareLocation, setShareLocation] = useState(false)
  const [locationNote, setLocationNote] = useState<string | null>(null)
  const [announce, setAnnounce] = useState("")
  const [viewport, setViewport] = useState<{ inset: number; height: number }>({ inset: 0, height: 0 })

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fabRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const runRef = useRef(0)
  const messagesRef = useRef<ChatMessage[]>([])
  const snapshots = useRef(new Map<string, DaySnapshot>())
  const titleId = useId()
  const lastUserId = lastMessageIdByRole(messages, "user")
  const working = phase === "working"
  const { anchorRef, spacerRef } = useTranscriptAnchor(scrollRef, lastUserId, phase, open)

  messagesRef.current = messages

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

  // The conversation belongs to the trip: restore it, and keep it saved.
  const loadedFor = useRef<string | undefined>(undefined)
  useEffect(() => {
    abortRef.current?.abort()
    runRef.current += 1
    setPhase("idle")
    setStatus(null)
    setInput("")
    setSkipped({})
    setUndoable(new Set())
    snapshots.current.clear()
    loadedFor.current = tripId
    setMessages(tripId ? loadConversation(tripId) : [])
  }, [tripId])

  useEffect(() => {
    if (!tripId || loadedFor.current !== tripId || phase === "working") return
    saveConversation(tripId, messages)
  }, [tripId, messages, phase])

  const starters = useMemo(() => (trip ? conciergeSuggestions(trip, dayId) : []), [trip, dayId])

  const focusedDay = dayId && trip ? trip.days.find((d) => d.id === dayId) : undefined
  const place = trip?.destinations[0] ?? trip?.name
  const eyebrow = trip
    ? [focusedDay ? `Viewing ${dayShort(focusedDay)}` : tripTiming(trip).label, focusedDay ? null : place].filter(Boolean).join(" · ")
    : "Ask about this trip"

  const handleClose = useCallback(() => {
    abortRef.current?.abort()
    runTripsViewTransition(() => {
      setOpen(false)
      setExpanded(false)
    })
  }, [])

  const handleOpen = useCallback(() => {
    runTripsViewTransition(() => setOpen(true))
  }, [])

  const toggleExpanded = useCallback(() => {
    setExpanded((current) => !current)
  }, [])

  // Hand focus back to the FAB only after a close, never on page load.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (!open) {
      if (wasOpen.current) fabRef.current?.focus()
      wasOpen.current = false
      return
    }
    wasOpen.current = true
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
        'button:not(:disabled), [href], textarea, input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
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

  // Keep the composer above the on-screen keyboard, and the sheet inside
  // what is left of the screen.
  useEffect(() => {
    const vv = window.visualViewport
    if (!open || !vv) return
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setViewport(inset > 120 ? { inset, height: vv.height } : { inset: 0, height: 0 })
    }
    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update, { passive: true })
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
      setViewport({ inset: 0, height: 0 })
    }
  }, [open])

  useEffect(() => () => abortRef.current?.abort(), [])

  const patchMessage = useCallback((id: string, patch: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? patch(m) : m)))
  }, [])

  /** Stream a reply into `assistantId`, given the turns before the prompt. */
  const run = useCallback(
    async (prompt: string, history: ChatMessage[], assistantId: string, withLocation: boolean) => {
      if (!tripId) return
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const runId = ++runRef.current
      const live = () => runRef.current === runId

      setPhase("working")
      setStatus(null)
      setAnnounce("Concierge is working on it.")

      let location: { lat: number; lng: number } | undefined
      if (withLocation) {
        setStatus({ kind: "places", label: "Finding where you are" })
        const fix = await readPosition()
        if (!live()) return
        if (fix) location = fix
        else setLocationNote("Couldn't get your location, so this answer goes by your plan.")
        setStatus(null)
      }

      let activeTrip = trip
      if (!activeTrip) {
        try {
          const loaded = await getTrip(readToken, tripId)
          activeTrip = loaded.trip
          if (live()) {
            setTrip(activeTrip)
            setAccess(loaded.access)
          }
        } catch {
          activeTrip = null
        }
      }
      const canonicalId = activeTrip?.id ?? tripId
      const focusedDayId = dayId && activeTrip?.days.some((d) => d.id === dayId) ? dayId : undefined

      try {
        const result = await streamTripChat(
          {
            tripId: canonicalId,
            prompt,
            messages: toHistory(history),
            dayId: focusedDayId,
            location,
            trip: activeTrip ?? undefined,
            signal: controller.signal,
          },
          readToken,
          {
            onText: (content) => {
              if (live()) patchMessage(assistantId, (m) => ({ ...m, content }))
            },
            onStatus: (next) => {
              if (!live()) return
              setStatus(next)
              if (next.kind === "done") setPhase("finishing")
              else if (next.label) setAnnounce(next.label)
            },
            onPlaces: (places) => {
              if (live()) patchMessage(assistantId, (m) => ({ ...m, places }))
            },
            onProposal: (proposal) => {
              if (live()) patchMessage(assistantId, (m) => ({ ...m, proposal, proposalState: "pending" }))
            },
            onSources: (sources) => {
              if (live()) patchMessage(assistantId, (m) => ({ ...m, sources }))
            },
            onFollowups: (followups) => {
              if (live()) patchMessage(assistantId, (m) => ({ ...m, followups }))
            },
          },
        )
        if (!live()) return
        const empty = !result.content.trim() && !result.places?.length && !result.proposal
        patchMessage(assistantId, (m) => ({
          ...m,
          content: empty && !result.error ? "I couldn't put an answer together just now." : result.content || m.content,
          places: result.places ?? m.places,
          proposal: result.proposal ?? m.proposal,
          proposalState: result.proposal ? (m.proposalState ?? "pending") : m.proposalState,
          sources: result.sources ?? m.sources,
          followups: result.followups ?? m.followups,
          error: result.error ?? (empty ? "Nothing came back." : undefined),
        }))
        setAnnounce(result.error ? `The concierge hit a problem: ${result.error}` : `Concierge: ${spoken(result.content)}`)
      } catch (err) {
        if (!live()) return
        if (controller.signal.aborted || (err as Error).name === "AbortError") {
          patchMessage(assistantId, (m) => ({ ...m, stopped: true }))
          setAnnounce("Stopped.")
        } else {
          const message = (err as Error).message || "Something went wrong. Please try again."
          patchMessage(assistantId, (m) => ({ ...m, error: message }))
          setAnnounce(`The concierge hit a problem: ${message}`)
        }
      } finally {
        if (live()) {
          setPhase("idle")
          setStatus(null)
          abortRef.current = null
        }
      }
    },
    [tripId, dayId, trip, readToken, patchMessage],
  )

  const send = useCallback(
    (text: string, opts: { location?: boolean } = {}) => {
      const prompt = text.trim()
      if (!prompt || !tripId || phase === "working") return
      const withLocation = opts.location ?? shareLocation
      const history = messagesRef.current
      const userMsg: ChatMessage = { id: newId(), role: "user", content: prompt, ...(withLocation ? { sharedLocation: true } : {}) }
      const assistant: ChatMessage = { id: newId(), role: "assistant", content: "" }
      setMessages([...history, userMsg, assistant])
      setInput("")
      setShareLocation(false)
      setLocationNote(null)
      void run(prompt, history, assistant.id, withLocation)
    },
    [tripId, phase, shareLocation, run],
  )

  /** Ask again for a reply that failed or was stopped. */
  const retry = useCallback(
    (assistantId: string) => {
      const all = messagesRef.current
      const at = all.findIndex((m) => m.id === assistantId)
      const question = at > 0 ? all[at - 1] : undefined
      if (!question || question.role !== "user" || phase === "working") return
      const history = all.slice(0, at - 1)
      const fresh: ChatMessage = { id: assistantId, role: "assistant", content: "" }
      setMessages([...history, question, fresh, ...all.slice(at + 1)])
      void run(question.content, history, assistantId, Boolean(question.sharedLocation))
    },
    [phase, run],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const newChat = useCallback(() => {
    abortRef.current?.abort()
    runRef.current += 1
    setPhase("idle")
    setStatus(null)
    setMessages([])
    setSkipped({})
    setUndoable(new Set())
    snapshots.current.clear()
    setLocationNote(null)
    if (tripId) clearConversation(tripId)
    setAnnounce("Started a new chat.")
    inputRef.current?.focus()
  }, [tripId])

  const canEdit = access === "edit" || access === "owner"

  /** Read the trip fresh, change its days, save, and tell the page. */
  const saveDays = useCallback(
    async (mutate: (fresh: Trip) => Trip["days"] | null) => {
      if (!tripId) throw new Error("No trip is open.")
      const { trip: fresh } = await getTrip(readToken, tripId)
      const days = mutate(fresh)
      if (!days) {
        setTrip(fresh)
        return fresh
      }
      const next = await updateTrip(readToken, fresh.id, { days })
      setTrip(next)
      emitTripChanged(next)
      return next
    },
    [tripId, readToken],
  )

  const addPlace = useCallback(
    async (messageId: string, target: ConciergePlace, targetDayId: string) => {
      if (!canEdit) return
      const key = conciergePlaceKey(target)
      setAddingKey(key)
      try {
        let added: AddedPlace | null = null
        await saveDays((fresh) => {
          const day = fresh.days.find((d) => d.id === targetDayId)
          if (!day) throw new Error("That day is no longer on the trip.")
          const time = target.time && target.dayId === targetDayId ? target.time : undefined
          const existing = day.items.find((i) => dayHasPlaceNamed({ ...day, items: [i] }, target.name))
          if (existing) {
            added = { dayId: day.id, itemId: existing.id, time: existing.time }
            return null
          }
          const item = { ...itemFromConciergePlace(target), ...(time ? { time } : {}) }
          added = { dayId: day.id, itemId: item.id, time }
          return fresh.days.map((d) => (d.id === day.id ? { ...d, items: insertByTime(d.items, item) } : d))
        })
        if (added) {
          const record: AddedPlace = added
          patchMessage(messageId, (m) => ({ ...m, added: { ...m.added, [key]: record } }))
          setAnnounce(`Added ${target.name} to the itinerary.`)
        }
      } catch (err) {
        patchMessage(messageId, (m) => ({ ...m, error: (err as Error).message || "Could not add that place." }))
      } finally {
        setAddingKey(null)
      }
    },
    [canEdit, saveDays, patchMessage],
  )

  const undoAdd = useCallback(
    async (messageId: string, target: ConciergePlace) => {
      const key = conciergePlaceKey(target)
      const record = messagesRef.current.find((m) => m.id === messageId)?.added?.[key]
      if (!record || !canEdit) return
      setAddingKey(key)
      try {
        await saveDays((fresh) => removeItem(fresh.days, record.dayId, record.itemId))
        patchMessage(messageId, (m) => {
          const { [key]: _removed, ...rest } = m.added ?? {}
          return { ...m, added: rest }
        })
        setAnnounce(`Removed ${target.name} again.`)
      } catch (err) {
        patchMessage(messageId, (m) => ({ ...m, error: (err as Error).message || "Could not undo that." }))
      } finally {
        setAddingKey(null)
      }
    },
    [canEdit, saveDays, patchMessage],
  )

  const applyChanges = useCallback(
    async (messageId: string, selected: Set<string>) => {
      const message = messagesRef.current.find((m) => m.id === messageId)
      if (!message?.proposal || !canEdit) return
      const proposal = message.proposal
      setBusyProposal(messageId)
      try {
        let outcome: ReturnType<typeof applyProposal> | null = null
        let before: Trip["days"] = []
        await saveDays((fresh) => {
          before = fresh.days
          outcome = applyProposal(fresh.days, proposal, selected)
          return outcome.applied.length ? outcome.days : null
        })
        const result = outcome as ReturnType<typeof applyProposal> | null
        if (!result) return
        setSkipped((prev) => ({ ...prev, [messageId]: Object.fromEntries(result.skipped.map((s) => [s.id, s.reason])) }))
        if (result.applied.length === 0) {
          setAnnounce("Nothing could be applied: the itinerary has changed since.")
          return
        }
        snapshots.current.set(messageId, snapshotDays(before, result.touched))
        setUndoable((prev) => new Set(prev).add(messageId))
        patchMessage(messageId, (m) => ({ ...m, proposalState: "applied", appliedIds: result.applied, error: undefined }))
        setAnnounce(`Applied: ${proposal.summary}. Undo is available.`)
      } catch (err) {
        patchMessage(messageId, (m) => ({ ...m, error: (err as Error).message || "Could not update the itinerary." }))
      } finally {
        setBusyProposal(null)
      }
    },
    [canEdit, saveDays, patchMessage],
  )

  const undoChanges = useCallback(
    async (messageId: string) => {
      const snapshot = snapshots.current.get(messageId)
      if (!snapshot || !canEdit) return
      setBusyProposal(messageId)
      try {
        await saveDays((fresh) => restoreSnapshot(fresh.days, snapshot))
        snapshots.current.delete(messageId)
        setUndoable((prev) => {
          const next = new Set(prev)
          next.delete(messageId)
          return next
        })
        patchMessage(messageId, (m) => ({ ...m, proposalState: "undone", appliedIds: undefined }))
        setAnnounce("Undone. The itinerary is back as it was.")
      } catch (err) {
        patchMessage(messageId, (m) => ({ ...m, error: (err as Error).message || "Could not undo that." }))
      } finally {
        setBusyProposal(null)
      }
    },
    [canEdit, saveDays, patchMessage],
  )

  const goToDay = useCallback(
    (targetDay: string, itemId?: string) => {
      if (!tripId) return
      const params = new URLSearchParams()
      if (itemId) {
        params.set("map", "1")
        params.set("focus", itemId)
      }
      const query = params.toString()
      navigate(`/trips/${encodeURIComponent(tripId)}/day/${encodeURIComponent(targetDay)}${query ? `?${query}` : ""}`)
      setExpanded(false)
      if (!isDesktop) setOpen(false)
    },
    [tripId, navigate, isDesktop],
  )

  const openPhotos = useCallback(
    (target: ConciergePlace, url: string | null) => {
      setPhoto({
        name: target.name,
        city: trip?.days.find((d) => d.id === target.dayId)?.city ?? trip?.destinations[0],
        lat: target.lat,
        lng: target.lng,
        url,
      })
    },
    [trip],
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

  const lastAssistantId = lastMessageIdByRole(messages, "assistant")

  const accent = resolveAccent(trip?.appearance?.accent)
  const panelSx = expanded
    ? sx("trip-chat-panel", "trip-chat-panel-expanded", c.panel)
    : sx("trip-chat-panel", c.panel, c.panelDocked)
  const panelStyle: CSSProperties = {
    ...(viewport.inset > 0 && !expanded
      ? { bottom: viewport.inset, maxHeight: Math.max(240, viewport.height - 8) }
      : {}),
    ...(expanded ? { ["--trip-chat-kb" as string]: viewport.inset > 0 ? `${viewport.inset}px` : "0px" } : {}),
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
      <motion.button
        ref={fabRef}
        type="button"
        onClick={handleOpen}
        aria-label="Open trip concierge chat"
        aria-hidden={open || undefined}
        tabIndex={open ? -1 : undefined}
        initial={false}
        animate={open ? { opacity: 0, scale: reduce ? 1 : 0.86 } : { opacity: 1, scale: 1 }}
        whileHover={reduce || open ? undefined : { scale: 1.06 }}
        whileTap={reduce || open ? undefined : { scale: 0.94 }}
        transition={reduce ? { duration: 0.15 } : FAB_SPRING}
        {...sx(c.fab, open ? c.fabHidden : undefined)}
        style={{
          // Shared morph with the panel. Name clears while open so the new
          // View Transition snapshot never has two `trips-concierge` nodes
          // (FAB stays mounted; EnhanceButton uses the same handoff).
          viewTransitionName: open || reduce ? "none" : "trips-concierge",
        }}
      >
        <MessageCircle {...sx(c.icon22)} strokeWidth={1.75} aria-hidden />
      </motion.button>

      {typeof document !== "undefined" &&
        createPortal(
          <div {...sx("trips", "trip-chat-portal")} data-trip-accent={accent}>
            <AnimatePresence>
              {open && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18, ease: EASE }}
                    onClick={handleClose}
                    {...sx(c.scrim, expanded ? undefined : c.scrimDocked)}
                    aria-hidden
                  />

                  <motion.div
                    {...panelMotion}
                    ref={dialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                    data-expanded={expanded ? "true" : "false"}
                    {...panelSx}
                    style={{
                      ...panelStyle,
                      // Name only while open. On close, open flips first so the
                      // exiting panel does not share the name with the restored FAB.
                      viewTransitionName: open && !reduce ? "trips-concierge" : "none",
                    }}
                  >
                    <header {...sx(c.header)}>
                      <div {...sx(c.headerBody)}>
                        <p {...sx(a.eyebrow, a.truncate)}>{eyebrow}</p>
                        {/* Reads "Concierge"; the dialog is still named "Trip Concierge". */}
                        <h2 id={titleId} {...sx(c.title)}>
                          <span {...sx(a.srOnly)}>Trip </span>Concierge
                        </h2>
                      </div>
                      <div {...sx(c.headerActions)}>
                        {messages.length > 0 ? (
                          <button type="button" onClick={newChat} aria-label="New chat" title="New chat" {...sx(a.iconBtn)}>
                            <SquarePen {...sx(c.icon18)} strokeWidth={1.75} aria-hidden />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={toggleExpanded}
                          aria-label={expanded ? "Shrink chat" : "Expand chat"}
                          aria-pressed={expanded}
                          title={expanded ? "Shrink chat" : "Expand chat"}
                          {...sx(a.iconBtn)}
                        >
                          {expanded ? (
                            <Minimize2 {...sx(c.icon18)} strokeWidth={1.75} aria-hidden />
                          ) : (
                            <Maximize2 {...sx(c.icon18)} strokeWidth={1.75} aria-hidden />
                          )}
                        </button>
                        <button type="button" onClick={handleClose} aria-label="Close chat" {...sx(a.iconBtn)}>
                          <X {...sx(c.icon18)} strokeWidth={1.75} aria-hidden />
                        </button>
                      </div>
                    </header>

                    <div ref={scrollRef} {...sx(c.scroll)} style={{ WebkitOverflowScrolling: "touch" }}>
                      {messages.length === 0 ? (
                        <EmptyState
                          place={place}
                          starters={starters}
                          reduce={!!reduce}
                          onPick={(starter) => send(starter.prompt, { location: Boolean(starter.location) })}
                        />
                      ) : (
                        messages.map((m) =>
                          m.role === "user" ? (
                            <div
                              key={m.id}
                              ref={m.id === lastUserId ? anchorRef : undefined}
                              data-transcript-anchor={m.id === lastUserId ? "latest-user" : undefined}
                              {...sx(c.userRow)}
                            >
                              <div {...sx(c.userCol)}>
                                <div {...sx(c.userBubble)}>{m.content}</div>
                                {m.sharedLocation ? (
                                  <p {...sx(c.userMeta)}>
                                    <LocateFixed {...sx(c.icon12)} strokeWidth={1.75} aria-hidden />
                                    Sent with your location
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          ) : (
                            <AssistantMessage
                              key={m.id}
                              message={m}
                              trip={trip}
                              dayId={dayId}
                              streaming={phase !== "idle" && m.id === lastAssistantId}
                              status={m.id === lastAssistantId ? status : null}
                              latest={m.id === lastAssistantId}
                              reduce={!!reduce}
                              canEdit={canEdit}
                              addingKey={addingKey}
                              proposalBusy={busyProposal === m.id}
                              canUndoProposal={undoable.has(m.id)}
                              skipped={skipped[m.id]}
                              onAdd={(target, targetDayId) => void addPlace(m.id, target, targetDayId)}
                              onUndoAdd={(target) => void undoAdd(m.id, target)}
                              onShow={(added) => goToDay(added.dayId, added.itemId)}
                              onPhotos={openPhotos}
                              onApply={(selected) => void applyChanges(m.id, selected)}
                              onDismiss={() => patchMessage(m.id, (msg) => ({ ...msg, proposalState: "dismissed" }))}
                              onUndo={() => void undoChanges(m.id)}
                              onViewDay={(() => {
                                const first = m.proposal?.changes[0]
                                if (!first) return undefined
                                const target = first.op === "move" ? first.toDayId : first.dayId
                                return target === dayId ? undefined : () => goToDay(target)
                              })()}
                              onRetry={() => retry(m.id)}
                              onFollowup={(text) => send(text)}
                            />
                          ),
                        )
                      )}
                      {messages.length > 0 ? (
                        <div ref={spacerRef} data-transcript-spacer="" aria-hidden {...sx(c.spacer)} />
                      ) : null}
                    </div>

                    {/* Spoken once per event; the streamed text itself stays quiet. */}
                    <p role="status" aria-live="polite" {...sx(a.srOnly)}>
                      {announce}
                    </p>

                    <div {...sx(c.footer)}>
                      {shareLocation || locationNote ? (
                        <p {...sx(c.composerNote, shareLocation ? c.composerNoteOn : undefined)}>
                          <LocateFixed {...sx(c.icon12)} strokeWidth={1.75} aria-hidden />
                          {shareLocation ? "Your location goes with the next message only. It is not saved." : locationNote}
                        </p>
                      ) : null}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          send(input)
                        }}
                        {...sx(c.form)}
                      >
                        <div {...sx(c.composer)}>
                          <button
                            type="button"
                            onClick={() => {
                              setShareLocation((on) => !on)
                              setLocationNote(null)
                              inputRef.current?.focus()
                            }}
                            aria-pressed={shareLocation}
                            aria-label="Share my location with the next message"
                            title={shareLocation ? "Location will be sent with the next message" : "Use my location for the next message"}
                            {...sx(c.tool, shareLocation ? c.toolOn : undefined)}
                          >
                            <LocateFixed {...sx(c.icon18)} strokeWidth={1.75} aria-hidden />
                          </button>
                          <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => {
                              setInput(e.target.value)
                              autoGrow()
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                                e.preventDefault()
                                send(input)
                              }
                            }}
                            rows={1}
                            aria-label="Message the concierge"
                            placeholder={shareLocation ? "What's near me…" : "Ask about this trip…"}
                            {...sx("trips-composer-input", c.input, expanded ? c.inputExpanded : c.inputDocked)}
                          />
                          {working ? (
                            <button type="button" onClick={stop} aria-label="Stop the reply" title="Stop" {...sx(c.send)}>
                              <span {...sx(c.stopGlyph)} aria-hidden />
                            </button>
                          ) : (
                            <button type="submit" disabled={!input.trim()} aria-label="Send message" {...sx(c.send)}>
                              <ArrowUp {...sx(c.icon18)} strokeWidth={2} aria-hidden />
                            </button>
                          )}
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

function EmptyState({
  place,
  starters,
  reduce,
  onPick,
}: {
  place?: string
  starters: Starter[]
  reduce: boolean
  onPick: (starter: Starter) => void
}) {
  return (
    <div {...sx(c.empty)}>
      <h3 {...sx(c.emptyTitle)}>
        Ask about <em {...sx(c.emptyEm)}>{place ?? "this trip"}</em>.
      </h3>
      <p {...sx(c.emptyCopy)}>
        I know your plan, check live hours and routes, and line up changes for you to apply.
      </p>
      {starters.length > 0 ? (
        <ul {...sx(c.starters)} aria-label="Suggested questions">
          {starters.map((starter, i) => {
            const Icon = STARTER_ICON[starter.kind]
            return (
              <motion.li
                key={starter.prompt}
                {...sx(c.starterItem)}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: EASE, delay: reduce ? 0 : 0.06 + i * 0.045 }}
              >
                <button type="button" onClick={() => onPick(starter)} {...sx(c.starter)}>
                  <Icon {...sx(c.starterIcon)} strokeWidth={1.75} aria-hidden />
                  <span {...sx(c.starterLabel)}>{starter.label}</span>
                  <ArrowUpRight {...sx(c.starterGo)} strokeWidth={1.75} aria-hidden />
                </button>
              </motion.li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
