import { useId, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { Link } from "react-router-dom"
import { CalendarPlus, CornerUpLeft, X } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { share, ws as s } from "../workspace.stylex"
import type { UndoMark } from "../editorMachine"
import { ItemIcon } from "../ItemIcon"
import { LIMITS } from "../limits"
import type { LngLat } from "../map/geo"
import { plural } from "../meta"
import { addIdea, ideasFull, removeIdea, saveForLater } from "../tripEdits"
import type { ItemTheme, ItineraryItem, Trip } from "../types"
import { IDEA_ANCHOR_ATTR, ideaName } from "../ideas/contract"
import { useIdeaNav } from "../ideas/ideaNav"
import { dayChipLabel, wishlistOnDays, type ScheduledIdea } from "../ideas/onDays"
import { compareAreas, ideaAreas } from "../ideas/areas"
import { THEME_ORDER, themeLabel, themeOf } from "../ideas/themes"
import { ThemeMenu, ThemeTag } from "../ideas/ThemeMenu"
import { AddStop } from "./AddStop"
import { LinkChip } from "./LinkChip"
import { stopLink } from "./stopLinks"

// Places saved for later: not on any day yet. One field saves a place (the
// same search a day uses). The list filters by type and groups by type or
// area. A place's name opens its details and "Add to day" its day picker,
// both over the page through the URL (`?idea=<id>`, `&add=1`; `ideas/
// IdeaOverlay`), so a map pin opens the same thing and Back closes it.
// Every write is one `onEdit` updater over the trip, as the other overview
// tabs do. Places that left the list for a day are listed after it, each
// with a link to its day and the way back.

type Edit = (fn: (doc: Trip) => Trip, undo?: UndoMark) => void

export interface IdeasPanelProps {
  trip: Trip
  /** `/trips/<slug or id>`: a scheduled place links to its day. */
  basePath: string
  /** The traveller can change the trip (owner or editor). Viewers get the list only. */
  editable: boolean
  /** An AI run or a conflict owns the document for now. */
  locked: boolean
  /** Search bias for the place field. */
  near: LngLat | null
  onEdit: Edit
}

type Filter = ItemTheme | "all"
type Grouping = "none" | "type" | "area"

const GROUPINGS: { id: Grouping; label: string }[] = [
  { id: "none", label: "None" },
  { id: "type", label: "Type" },
  { id: "area", label: "Area" },
]

/** This viewer's grouping, kept on the device: a convenience, never shared or synced. */
const GROUPING_KEY = "trips-wishlist-group"

function readGrouping(): Grouping {
  try {
    const saved = localStorage.getItem(GROUPING_KEY)
    return saved === "type" || saved === "area" ? saved : "none"
  } catch {
    return "none"
  }
}

function saveGrouping(grouping: Grouping) {
  try {
    localStorage.setItem(GROUPING_KEY, grouping)
  } catch {
    // Private mode: the choice lasts for this page only.
  }
}

interface Group {
  key: string
  label: string
  ideas: ItineraryItem[]
}


export function IdeasPanel({ trip, basePath, editable, locked, near, onEdit }: IdeasPanelProps) {
  const uid = useId()
  const nav = useIdeaNav()
  const [announcement, setAnnouncement] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [chosenGrouping, setGrouping] = useState<Grouping>(readGrouping)
  const ideas = useMemo(() => trip.ideas ?? [], [trip.ideas])
  const onDays = useMemo(() => wishlistOnDays(trip), [trip])
  // One idea has nothing to sort into groups (and no control to say how it is grouped).
  const grouping = ideas.length > 1 ? chosenGrouping : "none"
  const full = ideasFull(trip)

  const themes = useMemo(() => new Map(ideas.map((idea) => [idea.id, themeOf(idea)])), [ideas])
  const counts = useMemo(() => {
    const counts = new Map<ItemTheme, number>()
    for (const theme of themes.values()) counts.set(theme, (counts.get(theme) ?? 0) + 1)
    return counts
  }, [themes])
  // Areas look at every stop of the trip: worked out only while grouping by area.
  const areas = useMemo(() => (grouping === "area" ? ideaAreas(trip, ideas) : null), [grouping, trip, ideas])

  const visible = useMemo(() => (filter === "all" ? ideas : ideas.filter((idea) => themes.get(idea.id) === filter)), [filter, ideas, themes])
  // The chosen chip stays even once nothing is left in it, so the empty state can say so.
  const chips = THEME_ORDER.filter((theme) => counts.has(theme) || theme === filter)
  const showChips = chips.length > 1 || filter !== "all"

  const groups = useMemo((): Group[] => {
    if (grouping === "type") {
      return THEME_ORDER.flatMap((theme) => {
        const members = visible.filter((idea) => themes.get(idea.id) === theme)
        return members.length ? [{ key: theme, label: themeLabel(theme), ideas: members }] : []
      })
    }
    if (grouping === "area" && areas) {
      const byKey = new Map<string, Group & { rank: number }>()
      for (const idea of visible) {
        const area = areas.get(idea.id)!
        const group = byKey.get(area.key) ?? { key: area.key, label: area.label, rank: area.rank, ideas: [] }
        group.ideas.push(idea)
        byKey.set(area.key, group)
      }
      return [...byKey.values()].sort(compareAreas)
    }
    return []
  }, [grouping, visible, themes, areas])

  const save = (item: ItineraryItem) => {
    const name = ideaName(item)
    onEdit((doc) => addIdea(doc, item), { label: `Saved “${name}” for later` })
    setAnnouncement(`Saved ${name} for later`)
  }

  const remove = (idea: ItineraryItem) => {
    const name = ideaName(idea)
    onEdit((doc) => removeIdea(doc, idea.id), { label: `Removed “${name}” from the wishlist`, toast: true })
    setAnnouncement(`Removed ${name}`)
  }

  const unschedule = ({ item, day }: ScheduledIdea) => {
    const name = ideaName(item)
    onEdit((doc) => saveForLater(doc, day.id, item.id), { label: `Moved “${name}” back to the wishlist`, toast: true })
    setAnnouncement(`Moved ${name} back to the wishlist`)
  }

  // One history entry per opening (`ideas/ideaNav`): on a phone, Back closes what opened.
  const open = (idea: ItineraryItem, add = false) => nav.open(idea.id, "row", add)

  const chooseGrouping = (next: Grouping) => {
    setGrouping(next)
    saveGrouping(next)
  }

  const onGroupKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0
    if (!step) return
    // Keep the workspace's ←/→ day keys from also firing.
    event.preventDefault()
    event.stopPropagation()
    const at = GROUPINGS.findIndex((g) => g.id === grouping)
    const next = GROUPINGS[(at + step + GROUPINGS.length) % GROUPINGS.length]!.id
    chooseGrouping(next)
    event.currentTarget.querySelector<HTMLElement>(`[data-idea-group="${next}"]`)?.focus()
  }

  const rows = (list: readonly ItineraryItem[]) =>
    list.map((idea) => (
      <IdeaRow
        key={idea.id}
        idea={idea}
        editable={editable}
        locked={locked}
        onEdit={onEdit}
        onOpen={() => open(idea)}
        onPlace={() => open(idea, true)}
        onRemove={() => remove(idea)}
      />
    ))

  const filterName = filter === "all" ? null : themeLabel(filter)

  return (
    <section {...sx(a.stack)} style={{ gap: "1.25rem" }} aria-labelledby={`${uid}-title`}>
      <p {...sx(a.srOnly)} role="status" aria-live="polite">
        {announcement}
      </p>
      <header {...sx(a.stack)} style={{ gap: "0.375rem" }}>
        <h2 id={`${uid}-title`} {...sx(a.eyebrow)}>
          Wishlist
        </h2>
        <p {...sx(a.body, a.muted, a.wrap)} style={{ margin: 0 }}>
          Places you might fit in. Add one to a day when you know where it goes.
        </p>
        {ideas.length > 0 && onDays.length > 0 && (
          <p {...sx(a.mono, a.muted, a.wrap)} style={{ margin: 0 }}>
            {plural(ideas.length, "place")} to fit in · {onDays.length} on your days
          </p>
        )}
      </header>

      {editable && (
        <div {...sx(a.stack)} style={{ gap: "0.375rem" }}>
          <AddStop
            near={near}
            disabled={locked || full}
            kinds={["place"]}
            label="Save a place for later"
            placeholder="Save a place for later…"
            below
            onAdd={save}
          />
          {full && <p {...sx(a.small)}>The list is full at {LIMITS.ideas}. Remove one to save another.</p>}
        </div>
      )}

      {ideas.length > 1 && (
        <div {...sx(s.ideaTools)}>
          {showChips && (
            <div role="group" aria-label="Show by type" {...sx(s.ideaChips)}>
              <FilterChip label="All" count={ideas.length} on={filter === "all"} onClick={() => setFilter("all")} />
              {chips.map((theme) => (
                <FilterChip
                  key={theme}
                  label={themeLabel(theme)}
                  count={counts.get(theme) ?? 0}
                  on={filter === theme}
                  onClick={() => setFilter(theme)}
                />
              ))}
            </div>
          )}
          <div {...sx(s.ideaGroupBy)}>
            <span id={`${uid}-group`} {...sx(a.eyebrow)}>
              Group by
            </span>
            <div
              role="radiogroup"
              aria-labelledby={`${uid}-group`}
              {...sx(share.segment, s.ideaGroupSwitch, "trips-glass-segment")}
              onKeyDown={onGroupKey}
            >
              {GROUPINGS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  data-idea-group={id}
                  aria-checked={grouping === id}
                  tabIndex={grouping === id ? 0 : -1}
                  onClick={() => chooseGrouping(id)}
                  {...sx(share.segmentBtn, s.ideaGroupBtn, grouping === id && share.segmentOn)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {ideas.length === 0 ? (
        <p {...sx(a.body, a.muted)} style={{ margin: 0 }}>
          {onDays.length > 0
            ? `Everything you saved has a day now.${editable ? " Search for another place above, or use Save for later on any stop." : ""}`
            : editable
              ? "Nothing saved yet. Search for a place above, or use Save for later on any stop."
              : "Nothing saved for later yet."}
        </p>
      ) : visible.length === 0 ? (
        <p {...sx(a.body, a.muted, a.wrap)} style={{ margin: 0 }}>
          Nothing under {filterName} now.{" "}
          <button type="button" {...sx(a.link)} onClick={() => setFilter("all")}>
            Show all
          </button>
        </p>
      ) : groups.length > 0 ? (
        <div {...sx(s.ideaGroups)}>
          {groups.map((group, i) => {
            const headId = `${uid}-g-${i}`
            return (
              <section key={group.key} aria-labelledby={headId}>
                <h3 id={headId} {...sx(s.ideaGroupHead)}>
                  <span {...sx(a.eyebrow, a.ink, a.wrap)}>{group.label}</span>
                  <span {...sx(a.mono, a.muted)} aria-hidden>
                    {group.ideas.length}
                  </span>
                  <span {...sx(a.srOnly)}>, {plural(group.ideas.length, "place")}</span>
                </h3>
                <ul {...sx(s.ideaList)} aria-labelledby={headId}>
                  {rows(group.ideas)}
                </ul>
              </section>
            )
          })}
        </div>
      ) : (
        <ul
          {...sx(s.ideaList)}
          aria-label={`${plural(visible.length, "place")} ${filterName ? `in ${filterName}` : "on the wishlist"}`}
        >
          {rows(visible)}
        </ul>
      )}

      {onDays.length > 0 && (
        <section {...sx(s.ideaOnDays)} aria-labelledby={`${uid}-days`}>
          <h3 id={`${uid}-days`} {...sx(s.ideaGroupHead)}>
            <span {...sx(a.eyebrow, a.ink)}>On your days</span>
            <span {...sx(a.mono, a.muted)} aria-hidden>
              {onDays.length}
            </span>
            <span {...sx(a.srOnly)}>, {plural(onDays.length, "place")}</span>
          </h3>
          <ul {...sx(s.ideaList)} aria-labelledby={`${uid}-days`}>
            {onDays.map((scheduled) => (
              <ScheduledRow
                key={scheduled.item.id}
                scheduled={scheduled}
                basePath={basePath}
                editable={editable}
                disabled={locked || full}
                onBack={() => unschedule(scheduled)}
              />
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}

/** A wishlist place on a day: which day, a link there, and the way back to the list. */
function ScheduledRow({
  scheduled,
  basePath,
  editable,
  disabled,
  onBack,
}: {
  scheduled: ScheduledIdea
  basePath: string
  editable: boolean
  disabled: boolean
  onBack: () => void
}) {
  const { item, day } = scheduled
  const name = ideaName(item)
  const when = dayChipLabel(scheduled)
  return (
    <li {...sx(s.ideaRow)}>
      <span {...sx(s.ideaIcon)} aria-hidden>
        <ItemIcon kind={item.kind} category={item.location?.category} reservationType={item.reservation?.type} size={16} strokeWidth={1.75} />
      </span>
      <div {...sx(s.ideaText)}>
        <span {...sx(s.ideaTitle, a.wrap)}>{name}</span>
        <Link
          to={`${basePath}/day/${day.id}#stop-${encodeURIComponent(item.id)}`}
          aria-label={`${name}: ${when}. Open the day`}
          {...sx(s.ideaDayLink)}
        >
          {when}
        </Link>
      </div>
      {editable && (
        <div {...sx(s.ideaActions)}>
          <button type="button" {...sx(a.btn, a.btnGhost, a.btnSm)} aria-label={`Back to wishlist: ${name}`} disabled={disabled} onClick={onBack}>
            <CornerUpLeft size={16} strokeWidth={1.75} aria-hidden />
            Back to wishlist
          </button>
        </div>
      )}
    </li>
  )
}

function FilterChip({ label, count, on, onClick }: { label: string; count: number; on: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} aria-label={`${label}, ${plural(count, "place")}`} onClick={onClick} {...sx(a.pill, on && a.pillOn)}>
      {label}
      <span {...sx(s.ideaChipCount)} aria-hidden>
        {count}
      </span>
    </button>
  )
}

function IdeaRow({
  idea,
  editable,
  locked,
  onEdit,
  onOpen,
  onPlace,
  onRemove,
}: {
  idea: ItineraryItem
  editable: boolean
  locked: boolean
  onEdit: Edit
  onOpen: () => void
  onPlace: () => void
  onRemove: () => void
}) {
  const name = ideaName(idea)
  const where = idea.location?.address ?? (idea.location?.category ? idea.location.category.replace(/_/g, " ") : undefined)
  const links = (idea.links ?? []).map(stopLink).filter((link): link is NonNullable<typeof link> => link !== null)
  return (
    <li {...sx(s.ideaRow)}>
      <span {...sx(s.ideaIcon)} aria-hidden>
        <ItemIcon kind={idea.kind} category={idea.location?.category} reservationType={idea.reservation?.type} size={16} strokeWidth={1.75} />
      </span>
      <div {...sx(s.ideaText)}>
        <button
          type="button"
          {...{ [IDEA_ANCHOR_ATTR]: idea.id }}
          aria-haspopup="dialog"
          onClick={onOpen}
          {...sx(s.ideaTitle, s.ideaTitleBtn, a.wrap)}
        >
          {name}
        </button>
        <div {...sx(s.ideaMeta)}>
          {editable ? <ThemeMenu idea={idea} locked={locked} onEdit={onEdit} /> : <ThemeTag idea={idea} />}
          {where && <span {...sx(a.small, a.wrap)}>{where}</span>}
        </div>
        {idea.notes && <span {...sx(a.small, a.wrap, s.ideaNotes)}>{idea.notes}</span>}
        {links.length > 0 && (
          <ul {...sx(s.links)} aria-label="Links">
            {links.map((link) => (
              <li key={link.href}>
                <LinkChip link={link} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {editable && (
        <div {...sx(s.ideaActions)}>
          <button
            type="button"
            {...sx(a.btn, a.btnGhost, a.btnSm)}
            aria-label={`Add to day: ${name}`}
            disabled={locked}
            onClick={onPlace}
          >
            <CalendarPlus size={16} strokeWidth={1.75} aria-hidden />
            Add to day
          </button>
          <button
            type="button"
            {...sx(a.iconBtn, a.iconBtnSm)}
            aria-label={`Remove ${name}`}
            disabled={locked}
            onClick={onRemove}
          >
            <X size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      )}
    </li>
  )
}
