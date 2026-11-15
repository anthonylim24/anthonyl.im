import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useNavigate } from "react-router-dom"
import {
  ArrowUp,
  ArrowUpRight,
  CalendarCheck,
  CalendarPlus,
  Compass,
  LocateFixed,
  Maximize2,
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
import type { ProposalUndoState } from "./ConciergeProposalCard"
import { ConciergePhotoViewer } from "./ConciergePhoto"
import { applyProposal, dayShort, daysFingerprint, insertByTime, restoreSnapshot, snapshotDays, type DaySnapshot } from "./conciergeProposal"
import { clearConversation, loadConversation, saveConversation, type AddedPlace, type ChatMessage } from "./conciergeStore"
import { conciergeSuggestions, type Starter, type StarterKind } from "./conciergeSuggestions"
import { dayHasPlaceNamed, itemFromConciergePlace, removeItem } from "./tripEdits"
import { getTrip, updateTrip } from "./tripsApi"
import { isTripConflict } from "./tripConflict"
import { emitTripChanged, mergeFetchedTrip, useTripChanged } from "./tripsEvents"
import { streamTripChat, type TripChatMessage } from "./tripChatApi"
import { resolveAccent, tripTiming } from "./meta"
import type { Trip, TripAccess } from "./types"
import { a } from "./atlas.stylex"
import { c } from "./chat.stylex"
import { sx } from "@/styles/merge"
import { runTripsViewTransition } from "./viewTransition"

const EASE = [0.16, 1, 0.3, 1] as const

/** The panel settles into place rather than sliding to a stop. */
const ENTER_SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.7 } as const

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

/** One fix, on demand. Resolves null when the browser says no, takes too
 *  long, or `signal` aborts first (an unanswered permission prompt never
 *  calls back, so the abort is the only way out of it). */
function readPosition(signal: AbortSignal, timeoutMs = 8000): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (signal.aborted || typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null)
      return
    }
    signal.addEventListener("abort", () => resolve(null), { once: true })
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 120_000, timeout: timeoutMs },
    )
  })
}

function abortError(): Error {
  return Object.assign(new Error("Aborted"), { name: "AbortError" })
}

/** The one itinerary write in flight: a place card (`id` = card key) or a
 *  change card (`id` = message id). Every write control waits for it. */
interface Mutation {
  kind: "place" | "proposal"
  messageId: string
  id: string
}

/** `working`: the reply is being written. `finishing`: the text is done and
 *  only the follow-up prompts are still on their way. `target` is the reply
 *  being written, which a retry can make an earlier one. */
type RunState = { phase: "idle" } | { phase: "working" | "finishing"; target: string }

const IDLE: RunState = { phase: "idle" }

/** Markdown reply → a sentence a screen reader can say once. */
function spoken(text: string): string {
  return text
    .replace(/[*_`#>]+/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700)
}

/** What Undo on an applied proposal needs: the touched days as they were,
 *  and a fingerprint of them as the apply left them. */
interface ProposalUndo {
  before: DaySnapshot
  dayIds: string[]
  after: string
}

const STALE_UNDO = "Those days have changed since, so Undo would lose the newer edits."

export interface TripChatPanelProps {
  tripId?: string
  dayId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The launcher's button: focus goes back to it after a close. */
  fabRef: RefObject<HTMLButtonElement | null>
}

export function TripChatPanel({ tripId, dayId, open, onOpenChange, fabRef }: TripChatPanelProps) {
  const navigate = useNavigate()
  const getToken = useGetToken()
  const readToken = useLatestCallback(getToken)
  const authReady = useAuthReady()
  const reduce = useReducedMotion()
  const isDesktop = useMinWidth(768)
  // The trip is kept with the route id it was loaded for, so one trip's
  // document is never shown, sent or written under another's route.
  // `access` is null until a fetch has said it; a `trip-changed` doc does not.
  const [loaded, setLoaded] = useState<{ forId: string; trip: Trip; access: TripAccess | null } | null>(null)
  const current = loaded && loaded.forId === tripId ? loaded : null
  const trip = current?.trip ?? null
  const access: TripAccess = current?.access ?? "view"
  const needsFetch = !current || current.access === null
  const [mutation, setMutation] = useState<Mutation | null>(null)
  /** An Add / Apply / Undo that failed. Not the reply's own `error`, and not saved. */
  const [actionError, setActionError] = useState<{ messageId: string; text: string } | null>(null)
  const [skipped, setSkipped] = useState<Record<string, Record<string, string>>>({})
  /** Applied proposals that can still be undone this session, by message id. */
  const [undos, setUndos] = useState<Record<string, ProposalUndo>>({})
  const [photo, setPhoto] = useState<PhotoView | null>(null)
  const [expanded, setExpanded] = useState(false)
  /** Docked beside the page on desktop, the panel is a side region, not a modal. */
  const modal = expanded || !isDesktop
  const [messages, setMessages] = useState<ChatMessage[]>(() => (tripId ? loadConversation(tripId) : []))
  const [input, setInput] = useState("")
  const [runState, setRunState] = useState<RunState>(IDLE)
  const phase = runState.phase
  const [status, setStatus] = useState<ConciergeStatus | null>(null)
  const [shareLocation, setShareLocation] = useState(false)
  const [locationNote, setLocationNote] = useState<string | null>(null)
  const [announce, setAnnounce] = useState("")
  const [viewport, setViewport] = useState<{ inset: number; height: number }>({ inset: 0, height: 0 })

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const runRef = useRef(0)
  const messagesRef = useRef<ChatMessage[]>([])
  const tripIdRef = useRef(tripId)
  /** Itinerary writes run one after another, each reading the document the last one left. */
  const writeChain = useRef<Promise<unknown>>(Promise.resolve())
  const titleId = useId()
  const lastUserId = lastMessageIdByRole(messages, "user")
  const working = phase === "working"
  const { anchorRef, spacerRef } = useTranscriptAnchor(scrollRef, lastUserId, phase, open)

  useLayoutEffect(() => {
    messagesRef.current = messages
    tripIdRef.current = tripId
  })

  /** Keep `next` as the document for route `forId`, unless the route has moved on. */
  const putTrip = useCallback((forId: string, next: Trip, nextAccess?: TripAccess) => {
    if (tripIdRef.current !== forId) return
    setLoaded((prev) => ({
      forId,
      trip: next,
      access: nextAccess ?? (prev?.forId === forId ? prev.access : null),
    }))
  }, [])

  /** Keep a fetched document, unless a write the page announced is newer. */
  const putFetched = useCallback((forId: string, fetched: Trip, nextAccess: TripAccess) => {
    if (tripIdRef.current !== forId) return
    setLoaded((prev) => ({
      forId,
      trip: mergeFetchedTrip(fetched, prev?.forId === forId ? prev.trip : null),
      access: nextAccess,
    }))
  }, [])

  // Read the trip the first time the panel opens on it, not on every page view.
  useEffect(() => {
    if (!tripId || !open || !needsFetch) return
    let cancelled = false
    void getTrip(readToken, tripId)
      .then(({ trip: next, access: nextAccess }) => {
        if (!cancelled) putFetched(tripId, next, nextAccess)
      })
      .catch(() => {
        // The first message fetches again; a page write still arrives by event.
      })
    return () => {
      cancelled = true
    }
  }, [tripId, open, needsFetch, authReady, readToken, putFetched])

  useTripChanged(
    tripId,
    useCallback(
      (next) => {
        if (tripId) putTrip(tripId, next)
      },
      [tripId, putTrip],
    ),
  )

  // The conversation belongs to the trip. A new trip restores its own, adjusted
  // during render so `messages` never pairs with the wrong `tripId` ...
  const [conversationFor, setConversationFor] = useState(tripId)
  if (conversationFor !== tripId) {
    setConversationFor(tripId)
    setRunState(IDLE)
    setStatus(null)
    setInput("")
    setMutation(null)
    setActionError(null)
    setSkipped({})
    setUndos({})
    setMessages(tripId ? loadConversation(tripId) : [])
  }
  // ... and drops whatever the last trip's run was still streaming.
  useEffect(
    () => () => {
      abortRef.current?.abort()
      runRef.current += 1
    },
    [tripId],
  )

  useEffect(() => {
    if (!tripId || phase === "working") return
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
      onOpenChange(false)
      setExpanded(false)
    })
  }, [onOpenChange])

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
  }, [open, reduce, fabRef])

  useEffect(() => {
    if (!open || photo) return
    const onKey = (e: KeyboardEvent) => {
      const root = dialogRef.current
      if (e.key === "Escape") {
        // Docked beside the page, Escape is the panel's only while focus is in it.
        if (!modal && !root?.contains(document.activeElement)) return
        if (expanded) {
          setExpanded(false)
          return
        }
        handleClose()
        return
      }
      // Only a modal panel keeps Tab inside; docked, the page stays reachable.
      if (e.key !== "Tab" || !modal || !root) return
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
  }, [open, expanded, modal, handleClose, photo])

  useEffect(() => {
    if (!open || !modal) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open, modal])

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

      setRunState({ phase: "working", target: assistantId })
      setStatus(null)
      setAnnounce("Concierge is working on it.")
      // Once the words are all here, a close is not a stop.
      let textDone = false

      try {
        let location: { lat: number; lng: number } | undefined
        if (withLocation) {
          setStatus({ kind: "places", label: "Finding where you are" })
          const fix = await readPosition(controller.signal)
          if (!live()) return
          if (controller.signal.aborted) throw abortError()
          if (fix) location = fix
          else setLocationNote("Couldn't get your location, so this answer goes by your plan.")
          setStatus(null)
        }

        let activeTrip = trip
        if (!activeTrip) {
          activeTrip = await getTrip(readToken, tripId).then(
            (fetched) => {
              if (live()) putFetched(tripId, fetched.trip, fetched.access)
              return fetched.trip
            },
            () => null,
          )
          if (!live()) return
          if (controller.signal.aborted) throw abortError()
        }
        const canonicalId = activeTrip?.id ?? tripId
        const focusedDayId = dayId && activeTrip?.days.some((d) => d.id === dayId) ? dayId : undefined

        const result = await streamTripChat(
          {
            tripId: canonicalId,
            prompt,
            messages: toHistory(history),
            dayId: focusedDayId,
            location,
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
              if (next.kind === "done") {
                textDone = true
                setRunState({ phase: "finishing", target: assistantId })
              } else if (next.label) setAnnounce(next.label)
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
          if (!textDone) {
            patchMessage(assistantId, (m) => ({ ...m, stopped: true }))
            setAnnounce("Stopped.")
          }
        } else {
          const message = (err as Error).message || "Something went wrong. Please try again."
          patchMessage(assistantId, (m) => ({ ...m, error: message }))
          setAnnounce(`The concierge hit a problem: ${message}`)
        }
      } finally {
        if (live()) {
          setRunState(IDLE)
          setStatus(null)
          abortRef.current = null
        }
      }
    },
    [tripId, dayId, trip, readToken, patchMessage, putFetched],
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
      setActionError((prev) => (prev?.messageId === assistantId ? null : prev))
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
    setRunState(IDLE)
    setStatus(null)
    setActionError(null)
    setMessages([])
    setSkipped({})
    setUndos({})
    setLocationNote(null)
    if (tripId) clearConversation(tripId)
    setAnnounce("Started a new chat.")
    inputRef.current?.focus()
  }, [tripId])

  const canEdit = access === "edit" || access === "owner"

  /** Read the trip fresh, change its days, save, and tell the page. Writes
   *  queue: each one starts after the last settled, so it reads that result.
   *  The save names the copy it read; if someone wrote in between (the
   *  editor's autosave), read again and re-apply the change, once. */
  const saveDays = useCallback(
    (change: (fresh: Trip) => Trip["days"] | null): Promise<Trip> => {
      const forId = tripId
      const write = async (retried: boolean): Promise<Trip> => {
        if (!forId) throw new Error("No trip is open.")
        const { trip: fresh } = await getTrip(readToken, forId)
        const days = change(fresh)
        if (!days) {
          putTrip(forId, fresh)
          return fresh
        }
        try {
          const next = await updateTrip(readToken, fresh.id, { days, baseUpdatedAt: fresh.updatedAt })
          putTrip(forId, next)
          emitTripChanged(next)
          return next
        } catch (err) {
          if (!retried && isTripConflict(err)) return write(true)
          throw err
        }
      }
      const job = writeChain.current.then(() => write(false))
      writeChain.current = job.catch(() => undefined)
      return job
    },
    [tripId, readToken, putTrip],
  )

  /** One itinerary write at a time: mark it, run it, report a failure on its
   *  reply. Nothing is reported once the route has moved to another trip. */
  const runWrite = useCallback(
    async (mark: Mutation, fallback: string, work: (stale: () => boolean) => Promise<void>) => {
      const forId = tripId
      const stale = () => tripIdRef.current !== forId
      setMutation(mark)
      try {
        await work(stale)
        if (!stale()) setActionError(null)
      } catch (err) {
        if (!stale()) setActionError({ messageId: mark.messageId, text: (err as Error).message || fallback })
      } finally {
        setMutation((now) => (now === mark ? null : now))
      }
    },
    [tripId],
  )

  const addPlace = useCallback(
    (messageId: string, target: ConciergePlace, targetDayId: string) => {
      if (!canEdit) return
      const key = conciergePlaceKey(target)
      return runWrite({ kind: "place", messageId, id: key }, "Could not add that place.", async (stale) => {
        let added: AddedPlace | null = null
        await saveDays((fresh) => {
          const day = fresh.days.find((d) => d.id === targetDayId)
          if (!day) throw new Error("That day is no longer on the trip.")
          const time = target.time && target.dayId === targetDayId ? target.time : undefined
          const existing = day.items.find((i) => dayHasPlaceNamed({ ...day, items: [i] }, target.name))
          if (existing) {
            // Already planned: point at it, and never offer to undo it.
            added = { status: "preexisting", dayId: day.id, itemId: existing.id, time: existing.time }
            return null
          }
          const item = { ...itemFromConciergePlace(target), ...(time ? { time } : {}) }
          added = { status: "added", dayId: day.id, itemId: item.id, time }
          return fresh.days.map((d) => (d.id === day.id ? { ...d, items: insertByTime(d.items, item) } : d))
        })
        if (added && !stale()) {
          const record: AddedPlace = added
          patchMessage(messageId, (m) => ({ ...m, added: { ...m.added, [key]: record } }))
          setAnnounce(
            record.status === "added" ? `Added ${target.name} to the itinerary.` : `${target.name} is already on that day.`,
          )
        }
      })
    },
    [canEdit, saveDays, patchMessage, runWrite],
  )

  const undoAdd = useCallback(
    (messageId: string, target: ConciergePlace) => {
      const key = conciergePlaceKey(target)
      const record = messagesRef.current.find((m) => m.id === messageId)?.added?.[key]
      // Undo only removes what this card added, never a stop that was already there.
      if (!record || record.status !== "added" || !canEdit) return
      return runWrite({ kind: "place", messageId, id: key }, "Could not undo that.", async (stale) => {
        await saveDays((fresh) => removeItem(fresh.days, record.dayId, record.itemId))
        if (stale()) return
        patchMessage(messageId, (m) => {
          const rest = Object.fromEntries(Object.entries(m.added ?? {}).filter(([k]) => k !== key))
          return { ...m, added: rest }
        })
        setAnnounce(`Removed ${target.name} again.`)
      })
    },
    [canEdit, saveDays, patchMessage, runWrite],
  )

  const applyChanges = useCallback(
    (messageId: string, selected: Set<string>) => {
      const message = messagesRef.current.find((m) => m.id === messageId)
      if (!message?.proposal || !canEdit) return
      const proposal = message.proposal
      return runWrite({ kind: "proposal", messageId, id: messageId }, "Could not update the itinerary.", async (stale) => {
        let outcome: ReturnType<typeof applyProposal> | null = null
        let before: Trip["days"] = []
        const saved = await saveDays((fresh) => {
          before = fresh.days
          outcome = applyProposal(fresh.days, proposal, selected)
          return outcome.applied.length ? outcome.days : null
        })
        const result = outcome as ReturnType<typeof applyProposal> | null
        if (!result || stale()) return
        setSkipped((prev) => ({ ...prev, [messageId]: Object.fromEntries(result.skipped.map((s) => [s.id, s.reason])) }))
        if (result.applied.length === 0) {
          setAnnounce("Nothing could be applied: the itinerary has changed since.")
          return
        }
        const undo: ProposalUndo = {
          before: snapshotDays(before, result.touched),
          dayIds: result.touched,
          after: daysFingerprint(saved.days, result.touched),
        }
        setUndos((prev) => ({ ...prev, [messageId]: undo }))
        patchMessage(messageId, (m) => ({ ...m, proposalState: "applied", appliedIds: result.applied }))
        setAnnounce(`Applied: ${proposal.summary}. Undo is available.`)
      })
    },
    [canEdit, saveDays, patchMessage, runWrite],
  )

  const undoChanges = useCallback(
    (messageId: string) => {
      const undo = undos[messageId]
      if (!undo || !canEdit) return
      return runWrite({ kind: "proposal", messageId, id: messageId }, "Could not undo that.", async (stale) => {
        await saveDays((fresh) => {
          // Checked again on the saved document: an edit from another tab counts too.
          if (daysFingerprint(fresh.days, undo.dayIds) !== undo.after) throw new Error(STALE_UNDO)
          return restoreSnapshot(fresh.days, undo.before)
        })
        if (stale()) return
        setUndos((prev) => {
          const rest = Object.fromEntries(Object.entries(prev).filter(([id]) => id !== messageId))
          return rest
        })
        patchMessage(messageId, (m) => ({ ...m, proposalState: "undone", appliedIds: undefined }))
        setAnnounce("Undone. The itinerary is back as it was.")
      })
    },
    [canEdit, undos, saveDays, patchMessage, runWrite],
  )

  /** Undo for each applied proposal, while the days it touched are as it left them. */
  const proposalUndo = useCallback(
    (messageId: string): ProposalUndoState | null => {
      const undo = undos[messageId]
      if (!undo) return null
      if (!trip) return "available"
      return daysFingerprint(trip.days, undo.dayIds) === undo.after ? "available" : "stale"
    },
    [undos, trip],
  )

  /** Open a day, scrolled to a stop when there is one (the workspace reads `#item-<id>`). */
  const goToDay = useCallback(
    (targetDay: string, itemId?: string) => {
      if (!tripId) return
      const hash = itemId ? `#item-${encodeURIComponent(itemId)}` : ""
      navigate(`/trips/${encodeURIComponent(tripId)}/day/${encodeURIComponent(targetDay)}${hash}`)
      setExpanded(false)
      if (!isDesktop) onOpenChange(false)
    },
    [tripId, navigate, isDesktop, onOpenChange],
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
    <>
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
                    role={modal ? "dialog" : "complementary"}
                    aria-modal={modal ? "true" : undefined}
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
                              streaming={runState.phase !== "idle" && m.id === runState.target}
                              status={runState.phase !== "idle" && m.id === runState.target ? status : null}
                              latest={m.id === lastAssistantId}
                              reduce={!!reduce}
                              canEdit={canEdit}
                              writing={mutation !== null}
                              addingKey={mutation?.kind === "place" && mutation.messageId === m.id ? mutation.id : null}
                              proposalBusy={mutation?.kind === "proposal" && mutation.id === m.id}
                              actionError={actionError?.messageId === m.id ? actionError.text : null}
                              onDismissActionError={() => setActionError(null)}
                              proposalUndo={proposalUndo(m.id)}
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
    </>
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
