import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import { MapPin, RotateCcw, X } from "lucide-react"
import { sx } from "@/styles/merge"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { exactCity } from "../cityMatch"
import { composing } from "../ime"
import { searchCities, type CityResult } from "../geocode"
import { a } from "../atlas.stylex"
import { ws as s } from "../workspace.stylex"
import { Spinner } from "./kit"

// Destinations as tokens with city autocomplete. Picking a suggestion gives
// the caller coordinates and a timezone. Enter takes the highlighted result,
// waiting for a search still on its way; free text is still accepted (no
// results, a failed search, Escape first, or leaving the field) so an
// unusual place name never blocks the form. Callers resolve free text later.

/** The last answer and the query it answers. `attempt` counts Retries, so a retry is "no answer yet" again. */
interface Search {
  query: string
  attempt: number
  results: CityResult[]
  failed: boolean
}

const NO_SEARCH: Search = { query: "", attempt: 0, results: [], failed: false }

export function CityField({
  id,
  values,
  onAdd,
  onRemove,
  autoFocus,
  disabled,
  placeholder = "City, region or country",
  invalid,
}: {
  id?: string
  values: readonly string[]
  onAdd: (name: string, city?: CityResult) => void
  onRemove: (index: number) => void
  autoFocus?: boolean
  disabled?: boolean
  placeholder?: string
  invalid?: boolean
}) {
  const [text, setText] = useState("")
  const [search, setSearch] = useState<Search>(NO_SEARCH)
  const [attempt, setAttempt] = useState(0)
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  /** Enter was pressed while the search was out: commit once it answers. */
  const [enterPending, setEnterPending] = useState(false)
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const typed = text.trim()
  const searching = typed.length >= 2
  const answered = searching && search.query === typed && search.attempt === attempt
  const loading = searching && !answered
  const failed = answered && search.failed
  const results = answered ? search.results : []

  useEffect(() => {
    if (typed.length < 2) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchCities(typed, controller.signal).then(
        (found) => {
          if (controller.signal.aborted) return
          setSearch({ query: typed, attempt, results: found, failed: false })
          setCursor(0)
        },
        () => {
          if (controller.signal.aborted) return
          setSearch({ query: typed, attempt, results: [], failed: true })
        },
      )
    }, 180)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [typed, attempt])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    return () => document.removeEventListener("pointerdown", onPointer)
  }, [open])

  const commit = (city?: CityResult) => {
    const name = city?.name ?? typed
    setEnterPending(false)
    if (!name) return
    if (!values.some((v) => v.toLowerCase() === name.toLowerCase())) onAdd(name, city)
    setText("")
    setSearch(NO_SEARCH)
    setAttempt(0)
    setOpen(false)
    inputRef.current?.focus()
  }

  // Enter takes the highlighted result. While the search is still out it
  // waits for the answer rather than adding the bare text with no place on
  // the map; after Escape (list closed) it takes the text as typed.
  const submit = () => {
    if (!typed) return
    const wait = open && loading
    setEnterPending(wait)
    if (wait) return
    commit(open ? results[cursor] : undefined)
  }
  const submitLatest = useLatestCallback(submit)
  useEffect(() => {
    if (enterPending && !loading) submitLatest()
  }, [enterPending, loading, submitLatest])

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (composing(event)) return
    if (event.key === "Backspace" && !text && values.length > 0) {
      onRemove(values.length - 1)
      return
    }
    if (event.key === "Escape" && open && (results.length > 0 || failed)) {
      event.stopPropagation()
      setOpen(false)
      setEnterPending(false)
      return
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (results.length === 0) return
      event.preventDefault()
      setOpen(true)
      setCursor((c) => (c + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length)
    } else if (event.key === "Enter" || event.key === ",") {
      if (!typed) return
      event.preventDefault()
      submit()
    }
  }

  const showList = open && searching && (results.length > 0 || loading)
  const showFailure = open && failed
  return (
    <div ref={wrapRef} {...sx(s.composer)}>
      <div
        {...sx(a.field, s.tokens)}
        style={{ alignItems: "center", cursor: "text", borderColor: invalid ? "var(--trips-danger)" : undefined }}
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((value, index) => (
          <span key={`${value}-${index}`} {...sx(s.token)}>
            {value}
            <button
              type="button"
              {...sx(s.tokenX)}
              aria-label={`Remove ${value}`}
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation()
                onRemove(index)
              }}
            >
              <X size={13} strokeWidth={2} aria-hidden />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && results[cursor] ? `${listId}-${cursor}` : undefined}
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          aria-busy={enterPending || undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          disabled={disabled}
          value={text}
          placeholder={values.length === 0 ? placeholder : "Add another"}
          {...sx(a.fieldBare)}
          style={{ flex: "1 1 8rem", minWidth: "8rem", minHeight: "2rem" }}
          onChange={(event) => {
            setText(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={(event) => {
            // Typed-but-unpicked text still counts once focus leaves the
            // field: as the city it names exactly when that answer is in,
            // otherwise as typed (the form resolves it before saving).
            if (typed && !wrapRef.current?.contains(event.relatedTarget as Node | null)) commit(exactCity(results, typed))
          }}
          onKeyDown={onKeyDown}
        />
        {loading && <Spinner />}
      </div>
      {showList && (
        <ul id={listId} role="listbox" aria-label="Matching places" {...sx(s.results, s.resultsDown)}>
          {results.length === 0 && (
            <li {...sx(s.result, a.muted)} role="presentation">
              Searching…
            </li>
          )}
          {results.map((city, index) => (
            <li key={city.id} role="presentation">
              <button
                type="button"
                role="option"
                id={`${listId}-${index}`}
                aria-selected={index === cursor}
                {...sx(s.result, index === cursor && s.resultOn)}
                onMouseEnter={() => setCursor(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commit(city)}
              >
                <MapPin size={16} strokeWidth={1.75} aria-hidden {...sx(a.noShrink, a.accentText)} />
                <span {...sx(a.grow, a.truncate)}>
                  {city.name}
                  <span {...sx(a.muted)}> {[city.region, city.country].filter(Boolean).join(", ")}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {showFailure && (
        <div {...sx(s.results, s.resultsDown, a.between)} style={{ padding: "0.5rem 0.5rem 0.5rem 0.875rem", gap: "0.75rem" }} role="alert">
          <span {...sx(a.small, a.ink)}>Couldn’t search, check your connection.</span>
          <button
            type="button"
            {...sx(a.btn, a.btnSecondary, a.btnSm)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setAttempt((n) => n + 1)
              inputRef.current?.focus()
            }}
          >
            <RotateCcw size={14} strokeWidth={1.75} aria-hidden />
            Retry
          </button>
        </div>
      )}
    </div>
  )
}
