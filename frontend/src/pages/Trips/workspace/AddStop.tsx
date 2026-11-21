import { useEffect, useId, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react"
import { MapPin, Plus, Search, StickyNote, Ticket } from "lucide-react"
import { sx } from "@/styles/merge"
import { searchPlaces, type PlaceResult } from "../geocode"
import { extractInstagramUrls } from "../instagram/instagram"
import { IgGlyph } from "../instagram/IgGlyph"
import { itemIcon } from "../meta"
import type { LngLat } from "../map/geo"
import { makeItem } from "../tripEdits"
import type { ItineraryItem } from "../types"
import { a } from "../atlas.stylex"
import { ws as s } from "../workspace.stylex"
import { Spinner } from "../components/kit"
import { LIMITS } from "../limits"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { composing } from "./ime"

// One input adds anything to a day. Typing searches real places (pinned on
// the map the moment you pick one); the same text can instead become a note,
// a booking, or a heading. An Instagram link is handed to the import sheet,
// which pins every place the post names.

/** Debounced, abortable place search biased toward `near`. */
export function usePlaceSearch(query: string, near: LngLat | null) {
  const nearKey = near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : ""
  const nearRef = useRef(near)
  useLayoutEffect(() => {
    nearRef.current = near
  })
  const text = query.trim()
  const searchKey = `${text}|${nearKey}`
  /** The last answer and the search it answers; loading is "no answer for this search yet". */
  const [search, setSearch] = useState<{ key: string; results: PlaceResult[] }>({ key: "", results: [] })
  const searching = text.length >= 2
  const results = searching ? search.results : []
  const loading = searching && search.key !== searchKey

  useEffect(() => {
    if (text.length < 2) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchPlaces(text, nearRef.current, controller.signal)
        .then((found) => {
          if (controller.signal.aborted) return
          setSearch({ key: searchKey, results: found })
        })
        .catch(() => {
          if (controller.signal.aborted) return
          setSearch({ key: searchKey, results: [] })
        })
    }, 220)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [text, searchKey])

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

type PlainKind = "place" | "note" | "reservation" | "section"

type Option =
  | { type: "instagram"; urls: string[] }
  | { type: "place"; place: PlaceResult }
  | { type: "plain"; kind: PlainKind; label: string }

const ALL_KINDS: readonly PlainKind[] = ["place", "note", "reservation", "section"]

/** Identity of an option across renders, so the highlight stays put when results arrive. */
const optionKey = (option: Option) =>
  option.type === "place" ? `place:${option.place.id}` : option.type === "plain" ? `plain:${option.kind}` : "instagram"

export function AddStop({
  near,
  disabled,
  onAdd,
  onInstagram,
  kinds = ALL_KINDS,
  label = "Add a place, note or booking",
  placeholder,
  below = false,
}: {
  near: LngLat | null
  disabled?: boolean
  onAdd: (item: ItineraryItem) => void
  /** Present when Instagram import is available: receives pasted post links. */
  onInstagram?: (urls: string[]) => void
  /** What typed text can become besides a found place (all four on a day). */
  kinds?: readonly PlainKind[]
  /** The field's accessible name. */
  label?: string
  placeholder?: string
  /** Open the suggestions under the field (it sits at the top of its panel). */
  below?: boolean
}) {
  const [text, setText] = useState("")
  const [open, setOpen] = useState(false)
  /** The highlighted option; null means the first. */
  const [cursorKey, setCursorKey] = useState<string | null>(null)
  /** Enter was pressed before the search answered: add once it does. */
  const [enterPending, setEnterPending] = useState(false)
  const igUrls = onInstagram ? extractInstagramUrls(text) : []
  const { results, loading } = usePlaceSearch(igUrls.length > 0 ? "" : text, near)
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const typed = text.trim()

  const options: Option[] = igUrls.length > 0
    ? [{ type: "instagram", urls: igUrls }]
    : typed
    ? [
        ...results.map((place): Option => ({ type: "place", place })),
        ...(
          [
            { type: "plain", kind: "place", label: `Add “${typed}” without a pin` },
            { type: "plain", kind: "note", label: `Add as a note` },
            { type: "plain", kind: "reservation", label: `Add as a booking` },
            { type: "plain", kind: "section", label: `Add as a heading` },
          ] satisfies Option[]
        ).filter((option) => kinds.includes(option.kind)),
      ]
    : []

  // New text, new list: back to the first option.
  const [cursorFor, setCursorFor] = useState(typed)
  if (cursorFor !== typed) {
    setCursorFor(typed)
    setCursorKey(null)
    setEnterPending(false)
  }
  const cursor = Math.max(0, options.findIndex((option) => optionKey(option) === cursorKey))
  const setCursor = (index: number) => setCursorKey(options[index] ? optionKey(options[index]) : null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    return () => document.removeEventListener("pointerdown", onPointer)
  }, [open])

  const commit = (option: Option) => {
    if (option.type === "instagram") {
      onInstagram?.(option.urls)
      setText("")
      setOpen(false)
      return
    }
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

  // The default pick is the first search result, so while the search is out
  // Enter waits for it rather than adding the text "without a pin". An
  // option the traveller arrowed to is theirs already.
  const submit = () => {
    const wait = loading && cursorKey === null && igUrls.length === 0
    setEnterPending(wait)
    if (wait) return
    const pick = options[cursor]
    if (pick) commit(pick)
  }
  const submitLatest = useLatestCallback(submit)
  useEffect(() => {
    if (enterPending && !loading) submitLatest()
  }, [enterPending, loading, submitLatest])

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Enter and the arrows belong to the input method while it composes a word.
    if (composing(event)) return
    if (event.key === "Escape") {
      if (open) event.stopPropagation()
      setOpen(false)
      return
    }
    if (options.length === 0) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      setOpen(true)
      setCursor((cursor + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length)
    } else if (event.key === "Enter") {
      event.preventDefault()
      submit()
    }
  }

  // Pasting a post link is the whole gesture.
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    if (!onInstagram) return
    const urls = extractInstagramUrls(event.clipboardData.getData("text"))
    if (urls.length === 0) return
    event.preventDefault()
    onInstagram(urls)
    setText("")
    setOpen(false)
  }

  const showList = open && options.length > 0
  return (
    <div ref={wrapRef} {...sx(s.composer)}>
      {showList && (
        <ul id={listId} role="listbox" aria-label="Suggestions" {...sx(s.results, below && s.resultsDown)}>
          {loading && results.length === 0 && (
            <li {...sx(s.result, a.muted)} role="presentation">
              <Spinner /> Searching places…
            </li>
          )}
          {options.map((option, index) => {
            const firstPlain = option.type === "plain" && (index === 0 || options[index - 1]!.type === "place")
            if (option.type === "instagram") {
              return (
                <li key="instagram" role="presentation">
                  <button
                    type="button"
                    role="option"
                    id={`${listId}-${index}`}
                    aria-selected={index === cursor}
                    {...sx(s.result, index === cursor && s.resultOn)}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => commit(option)}
                  >
                    <span {...sx(a.noShrink, a.accentText)} style={{ display: "grid" }}>
                      <IgGlyph size={16} />
                    </span>
                    <span {...sx(a.grow)}>
                      <span {...sx(a.wrap)}>
                        {option.urls.length > 1 ? `Find the places in these ${option.urls.length} posts` : "Find the places in this post"}
                      </span>
                      <span {...sx(a.small, a.wrap)} style={{ display: "block" }}>
                        Reads the post and pins every place it names
                      </span>
                    </span>
                  </button>
                </li>
              )
            }
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
          aria-label={label}
          autoComplete="off"
          enterKeyHint="done"
          placeholder={placeholder ?? (onInstagram ? "Add a place, note or link…" : "Add a place, note or booking…")}
          value={text}
          disabled={disabled}
          maxLength={LIMITS.itemTitle}
          {...sx(a.fieldBare)}
          onChange={(event) => {
            setText(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
        {loading && <Spinner />}
        <button
          type="button"
          {...sx(a.iconBtn, a.iconBtnSm)}
          aria-label="Add"
          disabled={disabled || !typed}
          onClick={submit}
        >
          <Plus size={18} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </div>
  )
}
