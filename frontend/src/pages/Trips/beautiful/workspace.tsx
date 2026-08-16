import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import type { Trip, TripSummary } from "../types"
import type { PromptSubmit, WorkspaceTrip } from "./types"

export interface ChatRequest {
  tab: "ask" | "enhance"
  draft: string
  autoSend: boolean
}

interface WorkspaceValue {
  trips: TripSummary[]
  setTrips: (trips: TripSummary[]) => void
  currentTrip: WorkspaceTrip | null
  setCurrentTrip: (trip: WorkspaceTrip | null) => void
  promptHandler: ((submit: PromptSubmit) => void) | null
  setPromptHandler: (handler: ((submit: PromptSubmit) => void) | null) => void
  promptPlaceholder: string
  setPromptPlaceholder: (value: string) => void
  chatRequest: ChatRequest | null
  openChat: (opts?: Partial<ChatRequest>) => void
  closeChat: () => void
  searchOpen: boolean
  openSearch: () => void
  closeSearch: () => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
}

const NOOP: WorkspaceValue = {
  trips: [],
  setTrips: () => {},
  currentTrip: null,
  setCurrentTrip: () => {},
  promptHandler: null,
  setPromptHandler: () => {},
  promptPlaceholder: "Ask about this trip…",
  setPromptPlaceholder: () => {},
  chatRequest: null,
  openChat: () => {},
  closeChat: () => {},
  searchOpen: false,
    openSearch: () => {
      window.dispatchEvent(new Event("trips:open-search"));
    },
  closeSearch: () => {},
  sidebarOpen: false,
  setSidebarOpen: () => {},
}

const WorkspaceContext = createContext<WorkspaceValue>(NOOP)

export function useWorkspace(): WorkspaceValue {
  return useContext(WorkspaceContext)
}

export function TripsWorkspaceProvider({ children }: { children: ReactNode }) {
  const [trips, setTrips] = useState<TripSummary[]>([])
  const [currentTrip, setCurrentTrip] = useState<WorkspaceTrip | null>(null)
  const [promptHandler, setPromptHandlerState] = useState<((submit: PromptSubmit) => void) | null>(null)
  const setPromptHandler = useCallback((handler: ((submit: PromptSubmit) => void) | null) => {
    setPromptHandlerState(() => handler)
  }, [])
  const [promptPlaceholder, setPromptPlaceholder] = useState("Ask about this trip…")
  const [chatRequest, setChatRequest] = useState<ChatRequest | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const openChat = useCallback((opts?: Partial<ChatRequest>) => {
    setChatRequest({
      tab: opts?.tab ?? "ask",
      draft: opts?.draft ?? "",
      autoSend: opts?.autoSend ?? false,
    })
  }, [])

  const value = useMemo<WorkspaceValue>(
    () => ({
      trips,
      setTrips,
      currentTrip,
      setCurrentTrip,
      promptHandler,
      setPromptHandler,
      promptPlaceholder,
      setPromptPlaceholder,
      chatRequest,
      openChat,
      closeChat: () => setChatRequest(null),
      searchOpen,
      openSearch: () => setSearchOpen(true),
      closeSearch: () => setSearchOpen(false),
      sidebarOpen,
      setSidebarOpen,
    }),
    [trips, currentTrip, promptHandler, setPromptHandler, promptPlaceholder, chatRequest, openChat, searchOpen, sidebarOpen],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function toWorkspaceTrip(trip: { id: string; slug?: string; name: string; days: Array<{ id: string; title?: string; date: string }> }): WorkspaceTrip {
  return {
    id: trip.id,
    slug: trip.slug,
    name: trip.name,
    days: trip.days.map((d) => ({ id: d.id, title: d.title, date: d.date })),
  }
}

/** Publish the open trip into the workspace rail and register the prompt bar. */
export function useTripWorkspace(
  trip: Trip | null,
  onPrompt?: (submit: PromptSubmit) => boolean | void,
) {
  const { setCurrentTrip, setPromptHandler, setPromptPlaceholder, openChat } = useWorkspace()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const onPromptRef = useRef(onPrompt)
  onPromptRef.current = onPrompt
  const editing = pathname.endsWith("/edit")

  useEffect(() => {
    if (!trip) {
      setCurrentTrip(null)
      return
    }
    setCurrentTrip(toWorkspaceTrip(trip))
    return () => setCurrentTrip(null)
  }, [trip, setCurrentTrip])

  useEffect(() => {
    if (!trip) {
      setPromptHandler(null)
      return
    }
    const key = trip.slug ?? trip.id
    setPromptPlaceholder(
      editing ? "Enhance this trip, or /generate empty days" : "Ask about this trip, or /enhance a focus",
    )
    setPromptHandler((submit) => {
      if (onPromptRef.current?.(submit) === true) return
      if (submit.command === "map") {
        const day = trip.days.find((d) => d.items.some((i) => i.location?.lat != null && i.location?.lng != null))
        if (day) navigate(`/trips/${key}/day/${day.id}?map=1`)
        return
      }
      if (submit.command === "enhance" || submit.command === "generate") {
        navigate(`/trips/${key}/edit`, { state: { enhancePrompt: submit.text || undefined } })
        return
      }
      openChat({ tab: "ask", draft: submit.text, autoSend: Boolean(submit.text) })
    })
    return () => setPromptHandler(null)
  }, [trip, editing, navigate, openChat, setPromptHandler, setPromptPlaceholder])
}
