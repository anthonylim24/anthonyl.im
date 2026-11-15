import type {
  ConciergePlace,
  ConciergeProposal,
  ConciergeSource,
} from "../../lib/conciergeGrounding"
import type { ProposalState } from "./tripChatApi"

// The conversation is kept per trip in localStorage (the chatbot's
// `lim-chat-v1` pattern), so closing the panel or reloading the page does not
// lose the thread. "New chat" clears it. Nothing here is sent anywhere.

export const CONCIERGE_STORE_KEY = "trips-concierge-v1"
const MAX_MESSAGES = 40

/** A place card's link to the itinerary. `added`: this card put the stop
 *  there, so Undo may take it out. `preexisting`: the stop was already on
 *  that day; the card points at it and must never remove it. */
export interface AddedPlace {
  status: "added" | "preexisting"
  dayId: string
  itemId: string
  time?: string
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  places?: ConciergePlace[]
  sources?: ConciergeSource[]
  proposal?: ConciergeProposal
  proposalState?: ProposalState
  /** Change ids that took effect when the proposal was applied. */
  appliedIds?: string[]
  /** Place cards linked to the itinerary from this reply, by card key. */
  added?: Record<string, AddedPlace>
  followups?: string[]
  error?: string
  /** The traveller stopped the reply. */
  stopped?: boolean
  /** The traveller's position went with this message. */
  sharedLocation?: boolean
}

const keyFor = (tripId: string) => `${CONCIERGE_STORE_KEY}:${tripId}`

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false
  const m = value as Record<string, unknown>
  return typeof m.id === "string" && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
}

/** Records saved before `status` existed were all written by Add. */
function cleanAdded(added: unknown): Record<string, AddedPlace> | undefined {
  if (!added || typeof added !== "object") return undefined
  const out: Record<string, AddedPlace> = {}
  for (const [key, value] of Object.entries(added as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue
    const r = value as Record<string, unknown>
    if (typeof r.dayId !== "string" || typeof r.itemId !== "string") continue
    out[key] = {
      status: r.status === "preexisting" ? "preexisting" : "added",
      dayId: r.dayId,
      itemId: r.itemId,
      ...(typeof r.time === "string" ? { time: r.time } : {}),
    }
  }
  return out
}

export function loadConversation(tripId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(keyFor(tripId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isMessage)
      .slice(-MAX_MESSAGES)
      .map((m) => (m.added ? { ...m, added: cleanAdded(m.added) } : m))
  } catch {
    return []
  }
}

export function saveConversation(tripId: string, messages: ChatMessage[]): void {
  try {
    // Replies that never produced anything are not worth keeping.
    const kept = messages
      .filter((m) => m.role === "user" || m.content.trim() || m.proposal || m.places?.length)
      .slice(-MAX_MESSAGES)
    if (kept.length === 0) localStorage.removeItem(keyFor(tripId))
    else localStorage.setItem(keyFor(tripId), JSON.stringify(kept))
  } catch {
    // Private mode or a full quota: the chat still works for this session.
  }
}

export function clearConversation(tripId: string): void {
  try {
    localStorage.removeItem(keyFor(tripId))
  } catch {
    // ignore
  }
}
