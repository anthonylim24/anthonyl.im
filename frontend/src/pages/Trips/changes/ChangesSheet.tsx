import { Fragment, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { motion } from "motion/react"
import { AlertCircle, ArrowDownUp, ArrowRightLeft, Clock, Minus, PencilLine, Plus, RotateCcw, Sparkles, X, type LucideIcon } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { DialogFrame } from "../components/kit"
import { formatTripDate } from "../meta"
import { stopTitle } from "../timeline/timeline"
import type { TripAccent, TripDay } from "../types"
import { changeDetail, KIND_WORD, orderWords, spokenSummary, summaryParts } from "./changeWords"
import { c } from "./changes.stylex"
import { DayRibbon } from "./DayRibbon"
import { countChanges, diffPlan, type AppliedChanges, type DayDiff, type SkippedSuggestion, type StopChange } from "./planDiff"
import { dayRibbon } from "./ribbon"

// "What changed": the recap after an AI review's suggestions are applied.
// Per changed day, a ribbon that moves from the old layout to the new one,
// and a row per change saying the same in words; then what couldn't be
// applied, and why. The ribbon is decoration for sighted readers: the rows
// carry everything.

/** A beat on the BEFORE layout before anything moves, then each day a little later. */
const BEAT = 0.4
const DAY_STAGGER = 0.12
const ROW_STAGGER = 0.03
const EASE_OUT = [0.16, 1, 0.3, 1] as const

const GLYPH: Record<StopChange["kind"], LucideIcon> = {
  added: Plus,
  removed: Minus,
  movedIn: ArrowRightLeft,
  movedOut: ArrowRightLeft,
  retimed: Clock,
  edited: PencilLine,
}

export interface ChangesSheetProps {
  changes: AppliedChanges
  /** `/trips/<slug or id>`, for each day's "Open day". */
  basePath: string
  accent?: TripAccent
  /** No travel: the AFTER layout with its ghosts in place, rows all at once. */
  reduce: boolean
  onClose: () => void
}

export function ChangesSheet({ changes, basePath, accent, reduce, onClose }: ChangesSheetProps) {
  const { before, after, skipped } = changes
  const diff = useMemo(() => diffPlan(before, after), [before, after])
  const counts = countChanges(diff)
  const parts = summaryParts(counts)
  const titleRef = useRef<HTMLHeadingElement>(null)
  /** Each replay remounts the days, which plays them from BEFORE again. */
  const [take, setTake] = useState(0)

  const dayName = (dayId: string) => {
    const at = after.days.findIndex((day) => day.id === dayId)
    return `Day ${(at >= 0 ? at : before.days.findIndex((day) => day.id === dayId)) + 1}`
  }

  return (
    <DialogFrame
      open
      onClose={onClose}
      accent={accent}
      content={[a.dialog, a.dialogWide, "trips-glass-sheet"]}
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        titleRef.current?.focus({ preventScroll: true })
      }}
    >
      <div {...sx(c.head)}>
        <div {...sx(c.headText)}>
          <p {...sx(a.eyebrow, a.accentText, c.eyebrow)}>
            <Sparkles size={12} strokeWidth={2} aria-hidden />
            AI review · applied
          </p>
          <DialogPrimitive.Title ref={titleRef} tabIndex={-1} {...sx(c.title)}>
            What <em {...sx(a.italic)}>changed</em>
          </DialogPrimitive.Title>
          <p {...sx(a.mono, a.muted, a.wrap)}>
            {parts.length > 0
              ? parts.map((part, i) => (
                  // A count stays with its word when the line wraps.
                  <Fragment key={part}>
                    {i > 0 && " · "}
                    <span {...sx(c.part)}>{part}</span>
                  </Fragment>
                ))
              : "Nothing on the plan changed"}
          </p>
          <DialogPrimitive.Description {...sx(a.srOnly)}>{spokenSummary(counts, diff.days.length, skipped.length)}</DialogPrimitive.Description>
        </div>
        <DialogPrimitive.Close {...sx(a.iconBtn, a.iconBtnSm)} aria-label="Close">
          <X size={18} strokeWidth={1.75} aria-hidden />
        </DialogPrimitive.Close>
      </div>

      <div {...sx(a.dialogBody)}>
        <Fragment key={take}>
          {diff.days.map((dayDiff, index) => (
            <DaySection
              key={dayDiff.dayId}
              diff={dayDiff}
              before={before.days.find((day) => day.id === dayDiff.dayId)}
              after={after.days.find((day) => day.id === dayDiff.dayId)}
              dayName={dayName}
              basePath={basePath}
              delay={BEAT + index * DAY_STAGGER}
              reduce={reduce}
              onOpen={onClose}
            />
          ))}
        </Fragment>
        {skipped.length > 0 && <Skipped skipped={skipped} />}
      </div>

      <div {...sx(a.dialogFoot, "trips-dialog-foot")}>
        {!reduce && diff.days.length > 0 && (
          <button type="button" {...sx(a.btn, a.btnGhost, c.replay)} onClick={() => setTake((n) => n + 1)}>
            <RotateCcw size={16} strokeWidth={1.75} aria-hidden />
            Replay
          </button>
        )}
        <button type="button" {...sx(a.btn, a.btnPrimary)} onClick={onClose}>
          Done
        </button>
      </div>
    </DialogFrame>
  )
}

function DaySection({
  diff,
  before,
  after,
  dayName,
  basePath,
  delay,
  reduce,
  onOpen,
}: {
  diff: DayDiff
  before: TripDay | undefined
  after: TripDay | undefined
  dayName: (dayId: string) => string
  basePath: string
  delay: number
  reduce: boolean
  onOpen: () => void
}) {
  const day = after ?? before
  if (!day) return null
  const ribbon = dayRibbon(before, after, diff, dayName)
  const name = dayName(day.id)
  const headId = `changes-${day.id}`
  const title = day.title?.trim() || day.city?.trim() || formatTripDate(day.date, undefined, { weekday: "long", month: undefined, day: undefined })
  const order = diff.reordered ? orderWords(diff.reordered) : null
  const notes: { name?: string; text: string; Glyph: LucideIcon }[] = [
    ...(diff.swappedWith ? [{ text: `Plan traded with ${dayName(diff.swappedWith)}`, Glyph: ArrowRightLeft }] : []),
    ...(order ? [{ name: order.name, text: order.detail, Glyph: ArrowDownUp }] : []),
  ]
  const rowIn = (i: number) =>
    reduce ? { initial: false as const } : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.32, ease: EASE_OUT, delay: delay + i * ROW_STAGGER } }

  return (
    <section {...sx(c.day)} aria-labelledby={headId}>
      <div {...sx(c.dayHead)}>
        <div {...sx(c.dayHeadText)}>
          <p {...sx(a.eyebrow)}>
            {name} · {formatTripDate(day.date).replace(",", "")}
          </p>
          <h3 id={headId} {...sx(a.display, a.wrapName, c.dayTitle)}>
            {title}
          </h3>
        </div>
        {after && (
          <Link to={`${basePath}/day/${after.id}`} onClick={onOpen} aria-label={`Open ${name.toLowerCase()}`} {...sx(a.link, c.dayLink)}>
            Open day
          </Link>
        )}
      </div>
      <DayRibbon ribbon={ribbon} delay={delay} reduce={reduce} />
      <ul {...sx(c.rows)} aria-label={`Changes on ${name}`}>
        {diff.changes.map((change, i) => {
          const Glyph = GLYPH[change.kind]
          return (
            <motion.li key={`${change.kind}-${change.item.id}`} {...sx(c.row)} {...rowIn(i)}>
              <span {...sx(c.glyph)} aria-hidden>
                <Glyph size={16} strokeWidth={1.75} />
              </span>
              <span {...sx(c.rowText)}>
                <span {...sx(c.rowName, a.wrap, change.kind === "removed" && c.rowNameGone)}>
                  <span {...sx(a.srOnly)}>{KIND_WORD[change.kind]}: </span>
                  {stopTitle(change.item)}
                </span>
                <span {...sx(a.mono, a.wrap, c.rowDetail)}>{changeDetail(change, dayName)}</span>
              </span>
            </motion.li>
          )
        })}
        {notes.map(({ name, text, Glyph }, i) => (
          <motion.li key={text} {...sx(c.row)} {...rowIn(diff.changes.length + i)}>
            <span {...sx(c.glyph)} aria-hidden>
              <Glyph size={16} strokeWidth={1.75} />
            </span>
            {name ? (
              <span {...sx(c.rowText)}>
                <span {...sx(c.rowName, a.wrap)}>{name}</span>
                <span {...sx(a.mono, a.wrap, c.rowDetail)}>{text}</span>
              </span>
            ) : (
              <span {...sx(a.mono, a.wrap, c.rowDetail, c.rowNote)}>{text}</span>
            )}
          </motion.li>
        ))}
      </ul>
    </section>
  )
}

function Skipped({ skipped }: { skipped: SkippedSuggestion[] }) {
  return (
    <section {...sx(c.skips)} aria-labelledby="changes-skipped">
      <h3 id="changes-skipped" {...sx(a.eyebrow)}>
        Couldn’t apply · {skipped.length}
      </h3>
      <ul {...sx(c.rows)}>
        {skipped.map((skip) => (
          <li key={skip.id} {...sx(c.row)}>
            <span {...sx(c.glyph)} aria-hidden>
              <AlertCircle size={16} strokeWidth={1.75} />
            </span>
            <span {...sx(c.rowText)}>
              <span {...sx(c.skipTitle, a.wrap)}>{skip.title}</span>
              <span {...sx(a.small, a.wrap, c.rowDetail)}>{skip.reason}</span>
            </span>
          </li>
        ))}
      </ul>
      <p {...sx(a.small, a.wrap)}>
        {skipped.length === 1 ? "It’s" : "They’re"} still in the review, so you can try {skipped.length === 1 ? "it" : "them"} again or skip{" "}
        {skipped.length === 1 ? "it" : "them"}.
      </p>
    </section>
  )
}
