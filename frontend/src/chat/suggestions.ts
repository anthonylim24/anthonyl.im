import { Code, Heart, Mail, Rocket, Sparkles, Wrench, type LucideIcon } from "lucide-react"
import type { Turn } from "./chatMachine"
import { MAX_MESSAGE, type ChatMessage } from "./conversation"

export type Suggestion = { text: string; short: string; Icon: LucideIcon }

/** The opening questions; what is left of them comes back as follow-ups. */
export const SUGGESTIONS: Suggestion[] = [
  { text: "What is Anthony's background?", short: "Background", Icon: Sparkles },
  { text: "What are his technical skills?", short: "Skills", Icon: Wrench },
  { text: "How can I contact him?", short: "Contact", Icon: Mail },
  { text: "What is he building right now?", short: "Building now", Icon: Rocket },
  { text: "What did he build on this site?", short: "This site", Icon: Heart },
  { text: "Can you help me with a coding question?", short: "Coding help", Icon: Code },
]

const FOLLOW_UPS = 3

/**
 * Up to three opening questions not asked yet, offered under the last reply
 * once it has settled well. None while a turn is under way, after a failure
 * or a Stop (Retry / the composer are the next step then), or once all have
 * been asked.
 */
export function followUps(messages: ChatMessage[], turn: Turn): Suggestion[] {
  if (turn.phase !== "idle") return []
  const last = messages[messages.length - 1]
  if (!last || last.role !== "assistant" || last.status !== "done" || !last.content.trim()) return []
  const asked = new Set(messages.filter((m) => m.role === "user").map((m) => m.content.trim().toLowerCase()))
  return SUGGESTIONS.filter((s) => !asked.has(s.text.toLowerCase())).slice(0, FOLLOW_UPS)
}

/** `/?q=…`: text to start the composer with (never sent by itself). Null when there is none. */
export function prefillFrom(search: URLSearchParams): string | null {
  const q = search.get("q")?.trim()
  return q ? q.slice(0, MAX_MESSAGE) : null
}
