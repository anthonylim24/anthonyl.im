import { memo } from "react"
import { ArrowUpRight, RotateCcw, TriangleAlert } from "lucide-react"
import type { ConciergePlace, ConciergeSource, ConciergeStatus } from "../../lib/conciergeGrounding"
import { ConciergeText } from "../Korea/ConciergeText"
import { conciergeText } from "../Korea/ConciergeText.stylex"
import { ConciergePlaceCards, type AddedPlace } from "./ConciergePlaceCards"
import { ConciergeProposalCard } from "./ConciergeProposalCard"
import type { ChatMessage } from "./conciergeStore"
import { settleStreamingMarkdown, useSmoothText } from "./streamingText"
import type { Trip } from "./types"
import { a } from "./atlas.stylex"
import { c } from "./chat.stylex"
import { sx } from "@/styles/merge"

/** "visitlisboa.com" for a web source; the title as given otherwise. */
function sourceLabel(source: ConciergeSource): string {
  if (source.kind === "maps") return source.title
  const title = source.title.trim()
  if (title && !/\s/.test(title)) return title.replace(/^www\./, "")
  try {
    return new URL(source.uri).hostname.replace(/^www\./, "")
  } catch {
    return title || "Source"
  }
}

export function ConciergeSourceChips({ sources }: { sources: ConciergeSource[] }) {
  if (sources.length === 0) return null
  return (
    <div {...sx(c.sources)} role="group" aria-label="Sources">
      <span {...sx(c.sourcesLabel)} aria-hidden>
        Sources
      </span>
      {sources.map((source) => (
        <a
          key={source.uri}
          href={source.uri}
          target="_blank"
          rel="noopener noreferrer"
          title={source.kind === "maps" ? `Route on Google Maps: ${source.title}` : source.title}
          {...sx(c.sourceChip)}
        >
          <span {...sx(c.sourceText)}>{source.kind === "maps" ? "Route on Google Maps" : sourceLabel(source)}</span>
          <ArrowUpRight {...sx(c.icon12)} strokeWidth={1.75} aria-hidden />
        </a>
      ))}
    </div>
  )
}

/** One line saying what the concierge is doing, from real tool activity. */
export function ConciergeStatusLine({ status, afterText }: { status: ConciergeStatus | null; afterText?: boolean }) {
  const label = status?.label ?? "Thinking"
  return (
    <div {...sx(c.status, afterText ? c.statusAfterText : undefined)} data-concierge-status={status?.kind ?? "thinking"}>
      <span {...sx(c.statusPulse)} aria-hidden />
      <span {...sx(c.statusLabel)}>{label}</span>
      {status?.detail ? <span {...sx(c.statusDetail)}>{status.detail}</span> : null}
    </div>
  )
}

const StreamedText = memo(function StreamedText({ text, streaming, smooth }: { text: string; streaming: boolean; smooth: boolean }) {
  const shown = useSmoothText(text, streaming && smooth)
  return (
    <div>
      <ConciergeText
        text={streaming ? settleStreamingMarkdown(shown) : text}
        bulletStyle={conciergeText.markerDotAccent}
        numberStyle={conciergeText.markerNumAccent}
      />
      {streaming ? <span {...sx("trip-chat-caret")} aria-hidden /> : null}
    </div>
  )
})

export interface AssistantMessageProps {
  message: ChatMessage
  trip: Trip | null
  dayId?: string
  /** The reply is still being written. */
  streaming: boolean
  /** Live tool activity for this reply. */
  status: ConciergeStatus | null
  /** The newest reply: only it shows follow-up prompts. */
  latest: boolean
  reduce: boolean
  canEdit: boolean
  addingKey: string | null
  proposalBusy: boolean
  canUndoProposal: boolean
  skipped?: Record<string, string>
  onAdd: (place: ConciergePlace, dayId: string) => void
  onUndoAdd: (place: ConciergePlace) => void
  onShow: (added: AddedPlace) => void
  onPhotos: (place: ConciergePlace, url: string | null) => void
  onApply: (selected: Set<string>) => void
  onDismiss: () => void
  onUndo: () => void
  onViewDay?: () => void
  onRetry: () => void
  onFollowup: (text: string) => void
}

export function AssistantMessage({
  message: m,
  trip,
  dayId,
  streaming,
  status,
  latest,
  reduce,
  canEdit,
  addingKey,
  proposalBusy,
  canUndoProposal,
  skipped,
  onAdd,
  onUndoAdd,
  onShow,
  onPhotos,
  onApply,
  onDismiss,
  onUndo,
  onViewDay,
  onRetry,
  onFollowup,
}: AssistantMessageProps) {
  const working = streaming && status?.kind !== "done"
  // Show the status until words arrive, and again whenever a tool runs
  // after some text (a second lookup, the change being prepared).
  const showStatus = working && (!m.content || (status != null && status.kind !== "writing"))

  return (
    <div {...sx(c.assistantRow)}>
      <div {...sx(c.assistant)} data-concierge-reply={m.id}>
        {m.content ? <StreamedText text={m.content} streaming={working} smooth={!reduce} /> : null}
        {showStatus ? <ConciergeStatusLine status={status} afterText={Boolean(m.content)} /> : null}

        {m.proposal && trip ? (
          <ConciergeProposalCard
            proposal={m.proposal}
            days={trip.days}
            state={m.proposalState ?? "pending"}
            appliedIds={m.appliedIds}
            skipped={skipped}
            busy={proposalBusy}
            canEdit={canEdit}
            canUndo={canUndoProposal}
            onApply={onApply}
            onDismiss={onDismiss}
            onUndo={onUndo}
            onView={onViewDay}
          />
        ) : null}

        {m.places?.length && trip ? (
          <ConciergePlaceCards
            places={m.places}
            days={trip.days}
            defaultDayId={dayId}
            city={trip.destinations[0]}
            added={m.added ?? {}}
            addingKey={addingKey}
            canEdit={canEdit}
            onAdd={onAdd}
            onUndo={onUndoAdd}
            onPhotos={onPhotos}
            onShow={onShow}
          />
        ) : null}

        {m.sources?.length ? <ConciergeSourceChips sources={m.sources} /> : null}

        {m.stopped && !m.error ? <p {...sx(c.note)}>Stopped.</p> : null}

        {m.error ? (
          <div {...sx(c.error)} role="alert">
            <TriangleAlert {...sx(c.errorIcon)} strokeWidth={1.75} aria-hidden />
            <span {...sx(c.errorText)}>{m.error}</span>
            <button type="button" onClick={onRetry} {...sx(a.btn, a.btnSm, a.btnSecondary, c.action)}>
              <RotateCcw {...sx(c.icon14)} strokeWidth={1.75} aria-hidden />
              Try again
            </button>
          </div>
        ) : null}

        {latest && !working && !m.error && m.followups?.length ? (
          <div {...sx(c.followups)} role="group" aria-label="Suggested follow-ups">
            {m.followups.map((text) => (
              <button key={text} type="button" onClick={() => onFollowup(text)} {...sx(a.pill, c.suggestion)}>
                {text}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
