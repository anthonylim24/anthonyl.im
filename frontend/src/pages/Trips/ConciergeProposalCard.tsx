import { useId, useMemo, useState } from "react"
import { Check, Sparkles, Undo2 } from "lucide-react"
import type { ConciergeProposal } from "../../lib/conciergeGrounding"
import { applyLabel, dayShort, describeChange, proposalDay } from "./conciergeProposal"
import type { ProposalState } from "./tripChatApi"
import type { TripDay } from "./types"
import { a } from "./atlas.stylex"
import { c } from "./chat.stylex"
import { sx } from "@/styles/merge"

const EYEBROW: Record<ProposalState, string> = {
  pending: "Proposed change",
  applied: "Applied",
  undone: "Undone",
  dismissed: "Dismissed",
}

/**
 * What the concierge wants to change, as a card the traveller reviews.
 * Nothing changes until Apply; a batch can be applied in part; Undo puts
 * the touched days back as they were.
 */
export function ConciergeProposalCard({
  proposal,
  days,
  state,
  appliedIds,
  skipped,
  busy,
  disabled = false,
  canEdit,
  canUndo,
  onApply,
  onDismiss,
  onUndo,
  onView,
}: {
  proposal: ConciergeProposal
  days: TripDay[]
  state: ProposalState
  /** Change ids that took effect (after Apply). */
  appliedIds?: string[]
  /** Why a change could not be applied, by change id. */
  skipped?: Record<string, string>
  busy: boolean
  /** Another itinerary write is in flight: Apply and Undo wait for it. */
  disabled?: boolean
  canEdit: boolean
  /** Undo needs the snapshot taken at Apply, which lives for this session. */
  canUndo: boolean
  onApply: (selected: Set<string>) => void
  onDismiss: () => void
  onUndo: () => void
  onView?: () => void
}) {
  const titleId = useId()
  const batch = proposal.changes.length > 1
  const [off, setOff] = useState<Set<string>>(() => new Set())
  // A batch for one day names the day once, in the heading.
  const day = useMemo(() => proposalDay(proposal, days), [proposal, days])
  const lines = useMemo(
    () => proposal.changes.map((change) => ({ change, line: describeChange(change, days, day?.id) })),
    [proposal, days, day],
  )
  const selected = proposal.changes.filter((change) => !off.has(change.id))
  const pending = state === "pending" || state === "undone"
  const locked = busy || disabled
  const plural = proposal.changes.length === 1 ? "change" : "changes"

  return (
    <section {...sx(c.proposal)} aria-labelledby={titleId} data-state={state}>
      <header {...sx(c.proposalHead)}>
        <p
          {...sx(
            c.proposalEyebrow,
            state === "applied" ? c.proposalEyebrowOk : state === "pending" ? undefined : c.proposalEyebrowMuted,
          )}
        >
          {state === "applied" ? (
            <Check {...sx(c.icon12)} strokeWidth={2.5} aria-hidden />
          ) : state === "pending" ? (
            <Sparkles {...sx(c.icon12)} strokeWidth={2} aria-hidden />
          ) : null}
          {EYEBROW[state]}
          {day ? ` · ${dayShort(day)}` : ""}
        </p>
        <h3 id={titleId} {...sx(c.proposalTitle)}>
          {proposal.summary}
        </h3>
      </header>

      <ul {...sx(c.changes)}>
        {lines.map(({ change, line }) => {
          const included = !off.has(change.id)
          const failed = skipped?.[change.id]
          const wasApplied = state === "applied" && appliedIds?.includes(change.id)
          const dim = (pending && !included) || (state === "applied" && !wasApplied) || state === "dismissed"
          return (
            <li key={change.id} {...sx(c.change, dim ? c.changeOff : undefined)}>
              <span {...sx(c.changeLead, line.op === "remove" ? c.changeLeadDanger : undefined)}>{line.lead}</span>
              <div {...sx(c.changeBody)}>
                <p {...sx(c.changeTitle, line.op === "remove" && state !== "applied" ? c.changeStrike : undefined)}>{line.title}</p>
                {failed ? (
                  <p {...sx(c.changeDetail, c.changeSkipped)}>Not applied: {failed}</p>
                ) : line.detail ? (
                  <p {...sx(c.changeDetail)}>{line.detail}</p>
                ) : null}
              </div>
              {batch && pending && canEdit ? (
                <label {...sx(c.check)}>
                  <input
                    type="checkbox"
                    checked={included}
                    disabled={busy}
                    onChange={() =>
                      setOff((prev) => {
                        const next = new Set(prev)
                        if (next.has(change.id)) next.delete(change.id)
                        else next.add(change.id)
                        return next
                      })
                    }
                    aria-label={`Include: ${line.title}`}
                    {...sx(c.checkInput)}
                  />
                  <span {...sx(c.checkBox)} aria-hidden>
                    <Check {...sx(c.icon12)} strokeWidth={3} />
                  </span>
                </label>
              ) : null}
            </li>
          )
        })}
      </ul>

      <footer {...sx(c.proposalFoot)}>
        {!canEdit ? (
          <p {...sx(c.proposalNote)}>You can view this trip. Ask an editor to apply the {plural}.</p>
        ) : pending ? (
          <>
            <button
              type="button"
              disabled={locked || selected.length === 0}
              aria-busy={busy}
              onClick={() => onApply(new Set(selected.map((change) => change.id)))}
              {...sx(a.btn, a.btnSm, a.btnPrimary, c.action)}
            >
              {busy ? <span {...sx(a.spinner)} aria-hidden /> : <Check {...sx(c.icon14)} strokeWidth={2} aria-hidden />}
              {busy ? "Applying…" : state === "undone" ? "Apply again" : applyLabel(proposal, selected.length)}
            </button>
            {state === "pending" ? (
              <button type="button" disabled={busy} onClick={onDismiss} {...sx(a.btn, a.btnSm, a.btnGhost, c.action, c.actionQuiet)}>
                Not now
              </button>
            ) : (
              <p {...sx(c.proposalNote)}>The itinerary is back as it was.</p>
            )}
          </>
        ) : state === "applied" ? (
          <>
            <p {...sx(c.proposalNote)} role="status">
              {appliedIds && appliedIds.length < proposal.changes.length
                ? `${appliedIds.length} of ${proposal.changes.length} ${plural} applied.`
                : "Your itinerary is updated."}
            </p>
            {onView ? (
              <button type="button" onClick={onView} {...sx(a.btn, a.btnSm, a.btnGhost, c.action, c.actionQuiet)}>
                View day
              </button>
            ) : null}
            {canUndo ? (
              <button type="button" disabled={locked} aria-busy={busy} onClick={onUndo} {...sx(a.btn, a.btnSm, a.btnSecondary, c.action)}>
                <Undo2 {...sx(c.icon14)} strokeWidth={1.75} aria-hidden />
                {busy ? "Undoing…" : "Undo"}
              </button>
            ) : null}
          </>
        ) : (
          <>
            <p {...sx(c.proposalNote)}>Nothing was changed.</p>
            <button type="button" disabled={locked} onClick={() => onApply(new Set(selected.map((change) => change.id)))} {...sx(a.btn, a.btnSm, a.btnGhost, c.action, c.actionQuiet)}>
              Apply anyway
            </button>
          </>
        )}
      </footer>
    </section>
  )
}
