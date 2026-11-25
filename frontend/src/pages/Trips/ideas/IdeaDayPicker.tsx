import { useEffect, useId, useMemo, useRef, useState } from "react"
import { CalendarDays, Sparkles } from "lucide-react"
import { sx } from "@/styles/merge"
import { useLatestCallback } from "../../../hooks/useLatestCallback"
import { a } from "../atlas.stylex"
import { DayPicker } from "../workspace/DayPicker"
import { ws as s } from "../workspace.stylex"
import { ideaName, type DaySuggestions, type IdeaDayPickerProps } from "./contract"
import { ideaDayChoices } from "./dayChoices"
import { ideaFocusReturn } from "./focusReturn"
import { picker as p } from "./picker.stylex"
import { formatKm, suggestDays } from "./suggestDaysApi"

// "Add to day" for a wishlist idea. Every day is there and usable the moment
// the sheet opens; above them, up to three recommended days arrive from the
// server (the model's picks, or the nearest days when it can't). Waiting is
// never required: a slow or failed answer only changes the block on top.

type Recommendation =
  | { key: string; status: "ready"; suggestions: DaySuggestions }
  | { key: string; status: "failed" }

export function IdeaDayPicker({ trip, idea, getToken, onPick, onClose }: IdeaDayPickerProps) {
  const uid = useId()
  const choices = useMemo(() => ideaDayChoices(trip, idea), [trip, idea])
  // The idea as it was when the sheet opened: an autosave or a newer copy of
  // the trip must not ask again (each ask counts against a per-person limit).
  const load = useLatestCallback((signal: AbortSignal) => suggestDays(getToken, trip.id, idea, signal))
  const key = `${trip.id}:${idea.id}`
  const name = ideaName(idea)
  const [answer, setAnswer] = useState<Recommendation | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal).then(
      (suggestions) => {
        if (!controller.signal.aborted) setAnswer({ key, status: "ready", suggestions })
      },
      () => {
        if (!controller.signal.aborted) setAnswer({ key, status: "failed" })
      },
    )
    return () => controller.abort()
  }, [load, key])

  const current = answer?.key === key ? answer : null
  // The server ranked its saved copy; a day removed or filled since then, or
  // one that already has the place, is not offered.
  const picks =
    current?.status === "ready"
      ? current.suggestions.picks.flatMap((pick) => {
          const choice = choices.find((c) => c.id === pick.dayId && !c.off)
          return choice ? [{ pick, choice }] : []
        })
      : []
  const loading = current === null
  const failed = current?.status === "failed"
  const fromAi = current?.status === "ready" && current.suggestions.source === "ai"
  const showBlock = loading || failed || picks.length > 0
  const announcement =
    picks.length > 0 ? `${picks.length === 1 ? "1 recommended day" : `${picks.length} recommended days`} for ${name}` : ""

  /** The day the place went to, for focus to follow it there. */
  const picked = useRef<string | undefined>(undefined)
  const choose = (dayId: string) => {
    picked.current = dayId
    onPick(dayId)
  }
  const pick = (dayId: string) => {
    choose(dayId)
    onClose()
  }

  const lead = (
    <>
      <p {...sx(a.srOnly)} role="status" aria-live="polite">
        {announcement}
      </p>
      {showBlock && (
        <section {...sx(p.section)} aria-labelledby={`${uid}-rec`} aria-busy={loading}>
          <div {...sx(p.head)}>
            <h3 id={`${uid}-rec`} {...sx(a.eyebrow)}>
              Recommended
            </h3>
            {fromAi && (
              <span {...sx(a.chip, a.chipAccent, p.aiMark)}>
                <Sparkles size={12} strokeWidth={1.75} aria-hidden />
                Suggested by AI
              </span>
            )}
          </div>
          {loading ? (
            <ul {...sx(s.pickList)} aria-hidden>
              {[0, 1, 2].map((row) => (
                <li key={row} {...sx(p.skeletonRow)}>
                  <span {...sx(a.skeleton, p.skeletonIcon)} />
                  <span {...sx(p.skeletonLines)}>
                    <span {...sx(a.skeleton, p.skeletonLabel)} />
                    <span {...sx(a.skeleton, p.skeletonReason)} />
                  </span>
                </li>
              ))}
            </ul>
          ) : failed ? (
            <p {...sx(a.small)}>Couldn’t suggest days. Any day below works.</p>
          ) : (
            <ul {...sx(s.pickList)}>
              {picks.map(({ pick: recommended, choice }) => (
                <li key={choice.id}>
                  <button type="button" {...sx(s.pickRow)} onClick={() => pick(choice.id)}>
                    <CalendarDays size={16} strokeWidth={1.75} aria-hidden {...sx(a.noShrink, a.muted)} />
                    <span {...sx(a.grow)}>
                      <span {...sx(s.pickLabel, a.wrap)}>{choice.label}</span>
                      <span {...sx(p.reason, a.wrap)}>{recommended.reason}</span>
                    </span>
                    {recommended.nearestKm !== undefined && (
                      <span {...sx(p.distance)}>{formatKm(recommended.nearestKm)}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {showBlock && <h3 {...sx(a.eyebrow, p.allHeading)}>All days</h3>}
    </>
  )

  return (
    <DayPicker
      title={`Add “${name}” to a day`}
      description="It goes on that day’s route, above anything still to schedule."
      choices={choices}
      lead={lead}
      // The heart or row that opened the picker leaves with the place: its
      // entry under "On your days", or its new stop or day, shows where it went.
      returnFocus={() => ideaFocusReturn(idea.id, picked.current)}
      onPick={choose}
      onClose={onClose}
    />
  )
}
