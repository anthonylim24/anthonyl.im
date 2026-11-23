import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react"
import * as stylex from "@stylexjs/stylex"
import { Check, Clock } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { composing } from "../ime"
import { allZones, matchZones, offsetOf, resolveZone, ZONE_LIMIT, zoneParts } from "../timeZones"
import { useClaimEscape } from "./escape"

// A searchable list of every IANA time zone the browser knows. Typing part of
// a city or region ("tok", "new york", "kolkata") narrows it, which is how a
// phone finds one: there is no typeahead without a keyboard. Arrows and Enter
// pick, and typed text that names one zone ("Tokyo") counts when the field is left.

/** Typed text, not yet a zone; `rejected` once the field was left with text that names none. */
type Draft = { text: string; rejected: boolean }

const zoneName = (zone: string) => {
  const { city, region } = zoneParts(zone)
  return region ? `${city} · ${region}` : city
}

/** The current zone, then the suggested ones, then every zone the runtime knows. */
const candidates = (pinned: readonly string[]) => [...new Set([...pinned, ...allZones()])]

export const TimeZoneField = forwardRef<
  HTMLInputElement,
  {
    id?: string
    value?: string | null
    onChange: (zone: string) => void
    /** Makes the field clearable: emptying it and leaving calls this. */
    onClear?: () => void
    /** Listed first, under the current zone (the trip's own zones). */
    suggested?: readonly string[]
    invalid?: boolean
    disabled?: boolean
    describedBy?: string
  }
>(function TimeZoneField({ id, value, onChange, onClear, suggested = [], invalid, disabled, describedBy }, ref) {
  const current = value ?? null
  const [draft, setDraft] = useState<Draft | null>(null)
  const [open, setOpen] = useState(false)
  /** The highlighted row; `key` when the keyboard put it there, which draws the ring. */
  const [cursor, setCursor] = useState({ at: -1, key: false })
  const [seen, setSeen] = useState(current)
  if (current !== seen) {
    setSeen(current)
    setDraft(null)
  }

  const listId = useId()
  const errorId = useId()
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => inputRef.current!, [])

  const pinned = [...new Set([...(current ? [current] : []), ...suggested])]
  const typed = draft?.text.trim() ?? ""
  const matches = open ? (typed ? matchZones(candidates(pinned), typed) : candidates(pinned)) : []
  const rows = matches.slice(0, ZONE_LIMIT)
  const more = matches.length - rows.length
  const showList = open && (rows.length > 0 || typed !== "")
  const active = showList ? rows[cursor.at] : undefined
  const room = useRoom(boxRef, showList)

  const pick = (zone: string) => {
    if (zone !== current) onChange(zone)
    setDraft(null)
    setOpen(false)
  }

  const settle = () => {
    setOpen(false)
    if (!draft) return
    if (!typed) {
      if (onClear && current) onClear()
      setDraft(null)
      return
    }
    const zone = resolveZone(typed, candidates(pinned))
    if (zone) pick(zone)
    else setDraft({ text: draft.text, rejected: true })
  }

  const show = () => {
    setOpen(true)
    setCursor({ at: current || draft ? 0 : -1, key: false })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (composing(event)) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (!open) return show()
      if (rows.length === 0) return
      const step = event.key === "ArrowDown" ? 1 : -1
      setCursor(({ at }) => ({ at: at < 0 ? (step > 0 ? 0 : rows.length - 1) : (at + step + rows.length) % rows.length, key: true }))
    } else if (event.key === "Enter") {
      if (active) {
        event.preventDefault()
        pick(active)
      } else if (draft || showList) {
        event.preventDefault()
        settle()
      }
    } else if (event.key === "Escape" && showList) {
      setOpen(false)
      setDraft(null)
    }
  }

  useClaimEscape(showList, inputRef)

  useEffect(() => {
    if (cursor.key) document.getElementById(`${listId}-${cursor.at}`)?.scrollIntoView?.({ block: "nearest" })
  }, [cursor, listId])

  const rejected = draft?.rejected ?? false
  const offset = current ? offsetOf(current) : ""
  const described = [describedBy, rejected ? errorId : null].filter(Boolean).join(" ") || undefined
  return (
    <div>
      <div {...sx(z.anchor)}>
        <div
          ref={boxRef}
          {...sx(a.field, z.box, (invalid || rejected) && z.boxBad, disabled && z.boxOff)}
          onMouseDown={(event) => {
            // The glyph and the offset focus the field too, without a blur first.
            if (disabled || event.target === inputRef.current) return
            event.preventDefault()
            inputRef.current?.focus()
          }}
        >
          <Clock size={16} strokeWidth={1.75} aria-hidden {...sx(a.noShrink, a.muted)} />
          <input
            ref={inputRef}
            id={id}
            type="text"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-activedescendant={active ? `${listId}-${cursor.at}` : undefined}
            aria-autocomplete="list"
            aria-invalid={invalid || rejected || undefined}
            aria-describedby={described}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            value={draft ? draft.text : current ? zoneName(current) : ""}
            placeholder="Search a city, e.g. Tokyo"
            {...sx(a.fieldBare, z.input)}
            onChange={(event) => {
              setDraft({ text: event.target.value, rejected: false })
              setOpen(true)
              setCursor({ at: event.target.value.trim() ? 0 : -1, key: false })
            }}
            onFocus={(event) => {
              event.currentTarget.select()
              show()
            }}
            onBlur={settle}
            onKeyDown={onKeyDown}
          />
          {!draft && offset && <span {...sx(z.hint)}>{offset}</span>}
        </div>
        {showList && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Time zones"
            {...sx(z.list, room.up ? z.up : z.down)}
            style={{ maxHeight: room.height }}
            // Pressing the list (its scrollbar too) keeps focus in the field.
            onMouseDown={(event) => event.preventDefault()}
          >
            {rows.map((zone, index) => {
              const { city, region } = zoneParts(zone)
              const on = index === cursor.at
              return (
                <li key={zone} role="presentation">
                  <button
                    type="button"
                    role="option"
                    id={`${listId}-${index}`}
                    aria-selected={on}
                    tabIndex={-1}
                    {...sx(z.row, on && z.rowOn, on && cursor.key && z.rowKey, zone === current && z.rowCurrent)}
                    onMouseEnter={() => setCursor({ at: index, key: false })}
                    onClick={() => pick(zone)}
                  >
                    <span {...sx(z.check)}>{zone === current && <Check size={16} strokeWidth={2} aria-hidden />}</span>
                    <span {...sx(z.name)}>
                      {city}
                      {region && <span {...sx(z.region)}> {region}</span>}
                    </span>
                    <span {...sx(z.hint)}>{offsetOf(zone)}</span>
                  </button>
                  {!typed && index === pinned.length - 1 && index < rows.length - 1 && <div {...sx(z.rule)} />}
                </li>
              )
            })}
            {rows.length === 0 && (
              <li role="presentation" {...sx(z.note)}>
                No zone named “{typed}”. Zones go by a main city, so try the nearest one.
              </li>
            )}
            {more > 0 && (
              <li role="presentation" {...sx(z.note)}>
                {typed ? `${more} more match. Keep typing to narrow them.` : `Type a city to find the other ${more} zones.`}
              </li>
            )}
          </ul>
        )}
      </div>
      {rejected && (
        <p id={errorId} role="alert" {...sx(a.errorText)}>
          No zone named “{typed}”. Pick one from the list, or try the nearest main city.
        </p>
      )}
    </div>
  )
})

/** The list stands this far off the field (0.375rem), and keeps as much clear of the edge. */
const GAP = 6
/** 16rem: some six rows. */
const TALLEST = 256
/** Three rows, so a cramped list still scrolls rather than vanishing. */
const SHORTEST = 132

/**
 * Where the open list fits: under the field unless there is more room above
 * it, and no taller than that room. Room is what every clipping ancestor (a
 * dialog's scrolling body, a sheet) and the visual viewport (which a phone's
 * keyboard shrinks) leave showing.
 */
function useRoom(field: RefObject<HTMLElement | null>, open: boolean) {
  const [room, setRoom] = useState({ up: false, height: TALLEST })
  useLayoutEffect(() => {
    const box = field.current
    if (!open || !box) return
    // Body and root overflow belong to the viewport (a Radix dialog hides the
    // body's), and nothing above a fixed sheet clips it.
    const clips: Element[] = []
    for (let node = box.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.overflowY !== "visible") clips.push(node)
      if (style.position === "fixed") break
    }
    const viewport = window.visualViewport
    const measure = () => {
      let top = viewport?.offsetTop ?? 0
      let bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight
      for (const clip of clips) {
        const rect = clip.getBoundingClientRect()
        top = Math.max(top, rect.top)
        bottom = Math.min(bottom, rect.bottom)
      }
      const rect = box.getBoundingClientRect()
      const below = bottom - rect.bottom - GAP * 2
      const above = rect.top - top - GAP * 2
      const up = below < TALLEST && above > below
      const height = Math.round(Math.min(TALLEST, Math.max(SHORTEST, up ? above : below)))
      setRoom((last) => (last.up === up && last.height === height ? last : { up, height }))
    }
    measure()
    window.addEventListener("scroll", measure, true)
    window.addEventListener("resize", measure)
    viewport?.addEventListener("resize", measure)
    viewport?.addEventListener("scroll", measure)
    return () => {
      window.removeEventListener("scroll", measure, true)
      window.removeEventListener("resize", measure)
      viewport?.removeEventListener("resize", measure)
      viewport?.removeEventListener("scroll", measure)
    }
  }, [field, open])
  return room
}

const WIDE = "@media (min-width: 640px)"
const REDUCE = "@media (prefers-reduced-motion: reduce)"

const drop = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(-4px) scale(0.98)" },
  to: { opacity: 1, transform: "none" },
})
const lift = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(4px) scale(0.98)" },
  to: { opacity: 1, transform: "none" },
})

// The list continues the field's columns: the check sits under the clock, the
// city under the typed text, the offset under the field's offset. Rows are the
// kit Select's: 44px, a wash for the highlighted one, 16px text on phones.
const z = stylex.create({
  anchor: { position: "relative" },
  box: { display: "flex", alignItems: "center", gap: "0.5rem", paddingBlock: 0, cursor: "text" },
  boxBad: { borderColor: "var(--trips-danger)" },
  boxOff: { opacity: 0.55, cursor: "not-allowed" },
  input: { flexGrow: 1, minWidth: 0, alignSelf: "stretch", minHeight: "2.625rem", textOverflow: "ellipsis" },
  list: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 25,
    margin: 0,
    padding: "0.375rem",
    listStyle: "none",
    overflowY: "auto",
    overscrollBehavior: "contain",
    borderRadius: "var(--trips-radius)",
    backgroundColor: "var(--trips-raised)",
    boxShadow: "var(--trips-shadow-3)",
    color: "var(--trips-ink)",
    animationDuration: "160ms",
    animationTimingFunction: "var(--trips-ease-out)",
  },
  down: {
    top: "calc(100% + 0.375rem)",
    transformOrigin: "top",
    animationName: { default: drop, [REDUCE]: "none" },
  },
  up: {
    bottom: "calc(100% + 0.375rem)",
    transformOrigin: "bottom",
    animationName: { default: lift, [REDUCE]: "none" },
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    width: "100%",
    minHeight: "2.75rem",
    paddingInline: "0.5rem",
    paddingBlock: "0.25rem",
    borderRadius: "0.5rem",
    backgroundColor: "transparent",
    color: "var(--trips-ink)",
    fontSize: { default: "1rem", [WIDE]: "0.9375rem" },
    lineHeight: 1.3,
    textAlign: "left",
    cursor: "pointer",
    outline: "none",
  },
  rowOn: { backgroundColor: "var(--trips-wash)" },
  rowKey: { boxShadow: "inset 0 0 0 2px var(--brand-ring)" },
  rowCurrent: { fontWeight: 600 },
  check: { display: "grid", placeItems: "center", flexShrink: 0, width: "1rem", color: "var(--brand)" },
  name: { flexGrow: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  region: { fontWeight: 400, color: "var(--trips-ink-tertiary)" },
  hint: {
    flexShrink: 0,
    fontFamily: "var(--trips-mono)",
    fontSize: "0.75rem",
    letterSpacing: "0.02em",
    fontVariantNumeric: "tabular-nums",
    color: "var(--trips-ink-tertiary)",
  },
  rule: { height: "1px", marginBlock: "0.25rem", marginInline: "0.5rem", backgroundColor: "var(--trips-line)" },
  note: { paddingInline: "0.5rem", paddingBlock: "0.625rem", fontSize: "0.8125rem", lineHeight: 1.45, color: "var(--trips-ink-tertiary)" },
})
