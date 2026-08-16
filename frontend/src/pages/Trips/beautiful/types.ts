export type AgentPhaseStatus = "pending" | "running" | "complete" | "failed"

export interface AgentPhase {
  id: string
  label: string
  detail?: string
  status: AgentPhaseStatus
}

export interface ToolChip {
  id: string
  label: string
  tone?: "neutral" | "accent" | "success"
}

export type PromptCommand = "prompt" | "ask" | "enhance" | "generate" | "map" | "add" | "blank"

export interface PromptAttachment {
  id: string
  label: string
  kind: "day" | "place" | "source"
}

export interface PromptSubmit {
  text: string
  command: PromptCommand
  attachments: PromptAttachment[]
}

export interface FilterChip {
  id: string
  label: string
  count: number
}

export interface InsightCard {
  id: string
  title: string
  body: string
  meta?: string
}

export interface WorkspaceDay {
  id: string
  title?: string
  date: string
}

export interface WorkspaceTrip {
  id: string
  slug?: string
  name: string
  days: WorkspaceDay[]
}

export interface SearchHit {
  id: string
  href: string
  title: string
  detail: string
  group: "Trips" | "Days" | "Stops"
}
