import { useEffect, useState } from "react"
import { AlertCircle, Check, Sparkles, X } from "lucide-react"
import { sx } from "@/styles/merge"
import type { EnhancementRun, EnhancementSuggestion, GeneratePreferences, SuggestionKind, Trip } from "../types"
import type { DayOption } from "../useTripEditor"
import { proposedTimesLine } from "./reviewTimes"
import { a } from "../atlas.stylex"
import { ws as s } from "../workspace.stylex"
import { Modal, Spinner } from "../components/kit"

// AI in three places: a composer that drafts a whole trip, a quick sheet
// that asks for ideas for one day (or a review of the trip), and the list
// of suggestions that comes back for the traveller to accept or skip.

export const PACE_OPTIONS = ["Relaxed", "Balanced", "Packed"] as const
export const INTEREST_OPTIONS = [
  "Food",
  "Coffee",
  "Art & museums",
  "History",
  "Nature",
  "Nightlife",
  "Shopping",
  "Architecture",
  "Hidden gems",
  "With kids",
] as const

export interface DraftBrief {
  prompt: string
  pace: string
  interests: string[]
}

export const EMPTY_BRIEF: DraftBrief = { prompt: "", pace: "Balanced", interests: [] }

export function briefToRequest(brief: DraftBrief): { prompt?: string; preferences: GeneratePreferences } {
  return {
    prompt: brief.prompt.trim() || undefined,
    preferences: {
      pace: brief.pace.toLowerCase(),
      interests: brief.interests.length > 0 ? brief.interests.join(", ") : undefined,
    },
  }
}

/** Pace + interests + free text: the brief for a full-trip draft. */
export function BriefFields({
  brief,
  onChange,
  disabled,
}: {
  brief: DraftBrief
  onChange: (brief: DraftBrief) => void
  disabled?: boolean
}) {
  return (
    <div {...sx(a.stack)} style={{ gap: "1rem" }}>
      <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <legend {...sx(a.label)}>Pace</legend>
        <div {...sx(a.rowWrap)} role="radiogroup" aria-label="Pace">
          {PACE_OPTIONS.map((pace) => (
            <button
              key={pace}
              type="button"
              role="radio"
              aria-checked={brief.pace === pace}
              {...sx(a.pill, brief.pace === pace && a.pillOn)}
              onClick={() => onChange({ ...brief, pace })}
            >
              {pace}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <legend {...sx(a.label)}>Into</legend>
        <div {...sx(a.rowWrap)}>
          {INTEREST_OPTIONS.map((interest) => {
            const on = brief.interests.includes(interest)
            return (
              <button
                key={interest}
                type="button"
                aria-pressed={on}
                {...sx(a.pill, on && a.pillOn)}
                onClick={() =>
                  onChange({
                    ...brief,
                    interests: on ? brief.interests.filter((i) => i !== interest) : [...brief.interests, interest],
                  })
                }
              >
                {interest}
              </button>
            )
          })}
        </div>
      </fieldset>
      <label>
        <span {...sx(a.label)}>Anything else?</span>
        <textarea
          rows={2}
          value={brief.prompt}
          disabled={disabled}
          maxLength={2000}
          placeholder="We land late on day one, one big dinner, nothing before 9am…"
          {...sx(a.field, a.textarea)}
          onChange={(event) => onChange({ ...brief, prompt: event.target.value })}
        />
      </label>
    </div>
  )
}

const DAY_IDEAS = [
  { label: "Fill the gaps", prompt: "Fill the empty stretches of this day with stops that fit the route already planned." },
  { label: "More food", prompt: "Add standout places to eat and drink near the stops already on this day." },
  { label: "Hidden gems", prompt: "Add lesser-known local spots near this day's route. Skip the obvious tourist stops." },
  { label: "Rainy-day plan", prompt: "Suggest indoor alternatives for this day in case of rain." },
  { label: "Slow it down", prompt: "This day feels rushed. Suggest what to cut or reorder for a calmer pace." },
]

const TRIP_IDEAS = [
  { label: "Check the pacing", prompt: "Review pacing across the trip. Flag days that are overloaded or thin." },
  { label: "Tighten the routes", prompt: "Reorder stops within days to cut backtracking." },
  { label: "Add local food", prompt: "Add well-loved local places to eat near each day's route." },
]

export type AiRequest =
  | { type: "day"; prompt?: string }
  | { type: "trip"; prompt?: string }
  | { type: "draft"; brief: DraftBrief }

export function AiSheet({
  open,
  onClose,
  scope,
  prompt,
  dayLabel,
  hasItems,
  onRun,
}: {
  open: boolean
  onClose: () => void
  scope: "day" | "trip"
  /** A brief to start from ("Rework around the rain"); still the traveller's to edit. */
  prompt?: string
  dayLabel?: string
  hasItems: boolean
  onRun: (request: AiRequest) => void
}) {
  const [text, setText] = useState("")
  const [brief, setBrief] = useState<DraftBrief>(EMPTY_BRIEF)
  const [mode, setMode] = useState<"improve" | "draft">("improve")
  const [confirmReplace, setConfirmReplace] = useState(false)

  // Each opening starts clean (adjusted during render, not in an effect).
  const openAs = open ? `${scope}|${hasItems}|${prompt ?? ""}` : null
  const [seenOpenAs, setSeenOpenAs] = useState<string | null>(null)
  if (openAs !== seenOpenAs) {
    setSeenOpenAs(openAs)
    if (open) {
      setText(prompt ?? "")
      setConfirmReplace(false)
      setMode(scope === "trip" && !hasItems ? "draft" : "improve")
    }
  }

  const ideas = scope === "day" ? DAY_IDEAS : TRIP_IDEAS
  const drafting = scope === "trip" && mode === "draft"

  const submit = (prompt?: string) => {
    onRun({ type: scope, prompt: (prompt ?? text).trim() || undefined })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={scope === "day" ? `Ideas for ${dayLabel ?? "this day"}` : drafting ? "Draft the whole trip" : "Improve this trip"}
      description={
        scope === "day"
          ? "AI reads what’s already planned and adds stops that fit. New places are pinned on the map."
          : drafting
            ? hasItems
              ? "A fresh draft replaces every day’s current plan."
              : "AI lays out each day with places, meals and a sensible route. Everything stays editable."
            : "AI reviews the full itinerary, adds what’s missing and suggests fixes you can accept one by one."
      }
      footer={
        drafting ? (
          <>
            <button type="button" {...sx(a.btn, a.btnSecondary)} onClick={onClose}>
              Cancel
            </button>
            {hasItems && !confirmReplace ? (
              <button type="button" {...sx(a.btn, a.btnPrimary)} onClick={() => setConfirmReplace(true)}>
                <Sparkles size={16} strokeWidth={1.75} aria-hidden />
                Replace with a new draft
              </button>
            ) : (
              <button
                type="button"
                {...sx(a.btn, hasItems ? a.btnDanger : a.btnPrimary)}
                onClick={() => {
                  onRun({ type: "draft", brief })
                  onClose()
                }}
              >
                <Sparkles size={16} strokeWidth={1.75} aria-hidden />
                {hasItems ? "Yes, replace my itinerary" : "Draft itinerary"}
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" {...sx(a.btn, a.btnSecondary)} onClick={onClose}>
              Cancel
            </button>
            <button type="button" {...sx(a.btn, a.btnPrimary)} onClick={() => submit()}>
              <Sparkles size={16} strokeWidth={1.75} aria-hidden />
              {text.trim() ? "Ask AI" : scope === "day" ? "Suggest stops" : "Review trip"}
            </button>
          </>
        )
      }
    >
      {scope === "trip" && hasItems && (
        <div {...sx(a.rowWrap)} role="radiogroup" aria-label="What AI should do">
          <button type="button" role="radio" aria-checked={mode === "improve"} {...sx(a.pill, mode === "improve" && a.pillOn)} onClick={() => setMode("improve")}>
            Improve what’s here
          </button>
          <button type="button" role="radio" aria-checked={mode === "draft"} {...sx(a.pill, mode === "draft" && a.pillOn)} onClick={() => setMode("draft")}>
            Start a fresh draft
          </button>
        </div>
      )}
      {drafting ? (
        <>
          <BriefFields brief={brief} onChange={setBrief} />
          {confirmReplace && (
            <p {...sx(a.alert)} role="alert">
              This removes every stop, note and booking currently on the trip and can’t be undone.
            </p>
          )}
        </>
      ) : (
        <>
          <div {...sx(a.rowWrap)}>
            {ideas.map((idea) => (
              <button
                key={idea.label}
                type="button"
                aria-pressed={text === idea.prompt}
                {...sx(a.pill, text === idea.prompt && a.pillOn)}
                onClick={() => setText(text === idea.prompt ? "" : idea.prompt)}
              >
                {idea.label}
              </button>
            ))}
          </div>
          <label>
            <span {...sx(a.label)}>What should AI look for?</span>
            <textarea
              rows={3}
              value={text}
              maxLength={2000}
              placeholder={scope === "day" ? "A long lunch near the river, then somewhere to watch the sunset" : "We’d like one slower day in the middle"}
              {...sx(a.field, a.textarea)}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit()
              }}
            />
          </label>
        </>
      )}
    </Modal>
  )
}

/** A review's place in the server's queue, in words: one line, and a quieter hint after it. */
export interface ReviewProgress {
  line: string
  hint: string | null
}

const FIRST_TRY_HINT = "This usually takes about a minute."
/** A draft of more than four days is outlined, then drafted in parts. */
export const LONG_DRAFT_HINT = "A trip this long takes a few minutes."
const RETRY_HINT = "It keeps going if you leave this page."

/**
 * What the busy line says about a review. `live` is the run as the server
 * last described it (null before it has answered); `subject` names what is
 * reviewed ("your trip", "Day 3"). Undefined for a server without a queue,
 * whose runs say nothing about progress: the line then steps through `steps`.
 */
export function reviewProgress(live: EnhancementRun | null, subject: string): ReviewProgress | undefined {
  if (!live) return { line: "Starting the review…", hint: FIRST_TRY_HINT }
  const queue = live.queue
  if (!queue) return undefined
  if (queue.state === "done") return { line: "Finishing the review…", hint: null }
  if (queue.state === "queued") {
    if (queue.attempt === 0) return { line: "Starting the review…", hint: FIRST_TRY_HINT }
    const next = Math.min(queue.attempt + 1, queue.maxAttempts)
    return { line: `The AI was slow, so it’s trying again (attempt ${next} of ${queue.maxAttempts})…`, hint: RETRY_HINT }
  }
  if (queue.attempt <= 1) return { line: `Reviewing ${subject}…`, hint: FIRST_TRY_HINT }
  return { line: `Reviewing ${subject} (attempt ${queue.attempt} of ${queue.maxAttempts})…`, hint: RETRY_HINT }
}

/**
 * An AI run in progress. `onStop` stops waiting for it and unlocks editing.
 * With `progress` (a review on a server with a queue) the line says where
 * the run really is; without it, the copy steps forward so it never looks stuck,
 * with `hint` after it.
 */
export function AiBusy({
  steps,
  progress,
  hint: stepsHint = FIRST_TRY_HINT,
  onStop,
}: {
  steps: readonly string[]
  progress?: ReviewProgress
  hint?: string
  onStop?: () => void
}) {
  const [at, setAt] = useState(0)
  const stepping = !progress
  useEffect(() => {
    if (!stepping) return
    const timer = setInterval(() => setAt((i) => Math.min(i + 1, steps.length - 1)), 7000)
    return () => clearInterval(timer)
  }, [stepping, steps.length])
  const line = progress ? progress.line : steps[Math.min(at, steps.length - 1)]
  const hint = progress ? progress.hint : stepsHint
  return (
    <div {...sx(s.aiBusy)}>
      <Spinner />
      <span {...sx(a.grow)} role="status">
        {line} {hint && <span {...sx(a.muted)}>{hint}</span>}
      </span>
      {onStop && (
        <button type="button" {...sx(a.btn, a.btnGhost, a.btnSm)} onClick={onStop}>
          Stop
        </button>
      )}
    </div>
  )
}

const KIND_LABEL: Record<SuggestionKind, string> = {
  add: "Add",
  edit: "Change",
  remove: "Remove",
  reorder: "Reorder",
  move: "Move",
  swap_days: "Swap days",
  warning: "Heads up",
  info: "Note",
}

const actionable = (suggestion: EnhancementSuggestion) =>
  suggestion.kind === "add" ||
  suggestion.kind === "edit" ||
  suggestion.kind === "remove" ||
  suggestion.kind === "reorder" ||
  suggestion.kind === "move" ||
  suggestion.kind === "swap_days"

/** What came back from an AI review: applied additions, optional changes, notes. */
export function SuggestionsReview({
  run,
  trip,
  skipReasons,
  dayOptions,
  applying,
  onApply,
  onDismiss,
}: {
  run: EnhancementRun
  trip: Trip
  /** Suggestions an apply couldn't carry out, with the reason: they stay listed, unticked. */
  skipReasons?: Readonly<Record<string, string>>
  dayOptions: DayOption[]
  applying: boolean
  onApply: (ids: string[]) => void
  onDismiss: () => void
}) {
  const applied = new Set(run.appliedSuggestionIds)
  const added = run.suggestions.filter((sg) => applied.has(sg.id) && sg.kind === "add")
  const fromWishlist = added.filter((sg) => sg.fromIdeaId).length
  const pending = run.suggestions.filter((sg) => !applied.has(sg.id) && actionable(sg))
  const notes = run.suggestions.filter((sg) => !applied.has(sg.id) && !actionable(sg))
  const fresh = () => new Set(pending.filter((sg) => !skipReasons?.[sg.id]).map((sg) => sg.id))
  const [picked, setPicked] = useState<Set<string>>(fresh)
  const dayLabel = (id?: string) => dayOptions.find((d) => d.id === id)?.label.split(" · ")[0]

  // A new run picks everything it can still apply. The same run back after an
  // apply keeps what was left unticked, and leaves what failed unticked: it
  // was just tried, so trying again is the traveller's call.
  const [pickedFor, setPickedFor] = useState(run)
  if (pickedFor !== run) {
    setPickedFor(run)
    const still = new Set(pending.map((sg) => sg.id))
    setPicked(
      pickedFor.id === run.id ? new Set([...picked].filter((id) => still.has(id) && !skipReasons?.[id])) : fresh(),
    )
  }

  return (
    <section {...sx(s.aiCard)} aria-label="AI suggestions">
      <div {...sx(a.between)}>
        <p {...sx(a.eyebrow, a.accentText)}>
          <Sparkles size={12} strokeWidth={2} aria-hidden style={{ display: "inline", verticalAlign: "-1px", marginRight: 6 }} />
          AI review
        </p>
        <button type="button" {...sx(a.iconBtn, a.iconBtnSm)} aria-label="Dismiss suggestions" onClick={onDismiss}>
          <X size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      {run.status === "error" ? (
        <p {...sx(a.body, a.wrap)}>
          {run.outcomeReason ?? (run.error ? `The review didn’t finish (${run.error}).` : "The review didn’t finish.")} Nothing in your
          itinerary changed, so you can run it again.
        </p>
      ) : (
        <>
          {run.summary && <p {...sx(a.body, a.ink, a.wrap)}>{run.summary}</p>}
          {added.length > 0 && (
            <p {...sx(a.small)}>
              <Check size={13} strokeWidth={2.25} aria-hidden style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} />
              Added {added.length === 1 ? "1 place" : `${added.length} places`} to the itinerary and the map:{" "}
              {added
                .map((sg) => sg.proposedItem?.title ?? sg.title)
                .slice(0, 6)
                .join(", ")}
              {added.length > 6 ? "…" : "."}
              {fromWishlist > 0 &&
                ` ${fromWishlist === added.length ? (added.length === 1 ? "It" : "They") : fromWishlist} came from your wishlist.`}
            </p>
          )}
          {pending.length > 0 && (
            <div>
              {pending.map((sg) => {
                const times = proposedTimesLine(sg, trip)
                return (
                  <label key={sg.id} {...sx(s.suggestion)}>
                    <input
                      type="checkbox"
                      checked={picked.has(sg.id)}
                      disabled={applying}
                      {...sx(s.check)}
                      onChange={() =>
                        setPicked((current) => {
                          const next = new Set(current)
                          if (next.has(sg.id)) next.delete(sg.id)
                          else next.add(sg.id)
                          return next
                        })
                      }
                    />
                    <span {...sx(a.stack)} style={{ gap: "0.25rem" }}>
                      <span {...sx(a.rowWrap)}>
                        <span {...sx(a.chip, a.chipMono, sg.kind === "remove" ? undefined : a.chipAccent)}>{KIND_LABEL[sg.kind]}</span>
                        {dayLabel(sg.dayId) && (
                          <span {...sx(a.mono, a.muted)}>
                            {dayLabel(sg.dayId)}
                            {sg.toDayId && sg.toDayId !== sg.dayId && dayLabel(sg.toDayId) ? ` → ${dayLabel(sg.toDayId)}` : ""}
                          </span>
                        )}
                        {sg.kind === "add" && sg.fromIdeaId && <span {...sx(a.mono, a.muted)}>From your wishlist</span>}
                      </span>
                      <span {...sx(a.body, a.ink, a.wrap)} style={{ fontWeight: 600 }}>
                        {sg.title}
                      </span>
                      {sg.detail && <span {...sx(a.small, a.wrap)}>{sg.detail}</span>}
                      {times && <span {...sx(a.mono, a.muted, a.wrap)}>{times}</span>}
                      {skipReasons?.[sg.id] && (
                        <span {...sx(a.small, a.ink, a.wrap)}>
                          <AlertCircle size={13} strokeWidth={2} aria-hidden style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} />
                          Couldn’t apply: {skipReasons[sg.id]}
                        </span>
                      )}
                    </span>
                  </label>
                )
              })}
              <div {...sx(a.rowWrap)} style={{ marginTop: "0.75rem" }}>
                <button
                  type="button"
                  {...sx(a.btn, a.btnPrimary, a.btnSm)}
                  disabled={applying || picked.size === 0}
                  onClick={() => onApply([...picked])}
                >
                  {applying ? <Spinner /> : <Check size={14} strokeWidth={2} aria-hidden />}
                  Apply {picked.size === 1 ? "1 change" : `${picked.size} changes`}
                </button>
                <button type="button" {...sx(a.btn, a.btnGhost, a.btnSm)} disabled={applying} onClick={onDismiss}>
                  Skip these
                </button>
              </div>
            </div>
          )}
          {notes.length > 0 && (
            <ul {...sx(a.stack)} style={{ listStyle: "none", margin: 0, padding: 0, gap: "0.5rem" }}>
              {notes.map((sg) => (
                <li key={sg.id} {...sx(a.small, a.wrap)}>
                  <strong {...sx(a.ink)}>{sg.title}.</strong> {sg.detail}
                </li>
              ))}
            </ul>
          )}
          {added.length === 0 && pending.length === 0 && notes.length === 0 && !run.summary && (
            <p {...sx(a.body)}>{run.outcomeReason ?? "Nothing to change. This plan already holds together."}</p>
          )}
        </>
      )}
    </section>
  )
}
