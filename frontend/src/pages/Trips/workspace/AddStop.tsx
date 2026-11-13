import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import { MapPin, Plus, Search, StickyNote, Ticket } from "lucide-react"
import { sx } from "@/styles/merge"
import { searchPlaces, type PlaceResult } from "../geocode"
import { itemIcon } from "../meta"
import type { LngLat } from "../map/geo"
import { makeItem } from "../tripEdits"
import type { ItineraryItem } from "../types"
import { a } from "../atlas.stylex"
import { ws as s } from "../workspace.stylex"
import { Spinner } from "../components/kit"

// One input adds anything to a day. Typing searches real places (pinned on
// the map the moment you pick one); the same text can instead become a note,
// a booking, or a heading.

/** Debounced, abortable place search biased toward `near`. */
export function usePlaceSearch(query: string, near: LngLat | null) {
  const [results, setResults] = useState<PlaceResult[]>([])
  const [loading, setLoading] = useState(false)
  const nearKey = near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : ""
  const nearRef = useRef(near)
  nearRef.current = near

  useEffect(() => {
    const text = query.trim()
    if (text.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    const timer = setTimeout(() => {
      searchPlaces(text, nearRef.current, controller.signal)
        .then((found) => {
          if (controller.signal.aborted) return
          setResults(found)
          setLoading(false)
        })
        .catch(() => {
          if (controller.signal.aborted) return
          setResults([])
          setLoading(false)
        })
    }, 220)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, nearKey])

  return { results, loading }
}

export function placeItem(place: PlaceResult): ItineraryItem {
  return {
    ...makeItem("place", place.name),
    location: {
      name: place.name,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      category: place.category,
      source: "user",
      confidence: "high",
    },
  }
}

type Option =
  | { type: "place"; place: PlaceResult }
  | { type: "plain"; kind: "place" | "note" | "reservation" | "section"; label: string }

export function AddStop({
  near,
  disabled,
  onAdd,
}: {
  near: LngLat | null
  disabled?: boolean
  onAdd: (item: ItineraryItem) => void
}) {
  const [text, setText] = useState("")
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const { results, loading } = usePlaceSearch(text, near)
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const typed = text.trim()

  const options: Option[] = typed
    ? [
        ...results.map((place): Option => ({ type: "place", place })),
        { type: "plain", kind: "place", label: `Add “${typed}” without a pin` },
        { type: "plain", kind: "note", label: `Add as a note` },
        { type: "plain", kind: "reservation", label: `Add as a booking` },
        { type: "plain", kind: "section", label: `Add as a heading` },
      ]
    : []

  useEffect(() => {
    setCursor(0)
  }, [typed, results.length])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    return () => document.removeEventListener("pointerdown", onPointer)
  }, [open])

  const commit = (option: Option) => {
    if (option.type === "place") onAdd(placeItem(option.place))
    else if (option.kind === "reservation") {
      onAdd({ ...makeItem("reservation", typed), status: "booked", reservation: { type: "experience", status: "confirmed" } })
    } else if (option.kind === "place") {
      onAdd({ ...makeItem("place", typed), location: { name: typed, source: "user" } })
    } else onAdd(makeItem(option.kind, typed))
    setText("")
    setOpen(false)
    inputRef.current?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (open) event.stopPropagation()
      setOpen(false)
      return
    }
    if (options.length === 0) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      setOpen(true)
      setCursor((c) => (c + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length)
    } else if (event.key === "Enter") {
      event.preventDefault()
      const pick = options[cursor]
      if (pick) commit(pick)
    }
  }

  const showList = open && options.length > 0
  return (
    <div ref={wrapRef} {...sx(s.composer)}>
      {showList && (
        <ul id={listId} role="listbox" aria-label="Suggestions" {...sx(s.results)}>
          {loading && results.length === 0 && (
            <li {...sx(s.result, a.muted)} role="presentation">
              <Spinner /> Searching places…
            </li>
          )}
          {options.map((option, index) => {
            const firstPlain = option.type === "plain" && (index === 0 || options[index - 1]!.type === "place")
            const Icon =
              option.type === "place"
                ? itemIcon("place", option.place.category)
                : option.kind === "note"
                  ? StickyNote
                  : option.kind === "reservation"
                    ? Ticket
                    : option.kind === "section"
                      ? Plus
                      : MapPin
            return (
              <li key={option.type === "place" ? option.place.id : option.kind} role="presentation">
                {firstPlain && index > 0 && <div {...sx(s.resultRule)} role="separator" />}
                <button
                  type="button"
                  role="option"
                  id={`${listId}-${index}`}
                  aria-selected={index === cursor}
                  {...sx(s.result, index === cursor && s.resultOn)}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => commit(option)}
                >
                  <Icon size={16} strokeWidth={1.75} aria-hidden {...sx(a.noShrink, option.type === "place" ? a.accentText : a.muted)} />
                  <span {...sx(a.grow)}>
                    <span {...sx(a.wrap)}>{option.type === "place" ? option.place.name : option.label}</span>
                    {option.type === "place" && option.place.context && (
                      <span {...sx(a.small, a.truncate)} style={{ display: "block" }}>
                        {option.place.context}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div {...sx(s.composerBox)}>
        <Search size={18} strokeWidth={1.75} aria-hidden {...sx(a.noShrink)} />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList ? `${listId}-${cursor}` : undefined}
          aria-autocomplete="list"
          aria-label="Add a place, note or booking"
          autoComplete="off"
          enterKeyHint="done"
          placeholder="Add a place, note or booking…"
          value={text}
          disabled={disabled}
          {...sx(a.fieldBare)}
          onChange={(event) => {
            setText(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {loading && <Spinner />}
        <button
          type="button"
          {...sx(a.iconBtn, a.iconBtnSm)}
          aria-label="Add"
          disabled={disabled || !typed}
          onClick={() => {
            const pick = options[cursor]
            if (pick) commit(pick)
          }}
        >
          <Plus size={18} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </div>
  )
}
