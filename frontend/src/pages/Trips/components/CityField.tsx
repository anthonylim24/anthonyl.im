import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import { MapPin, X } from "lucide-react"
import { sx } from "@/styles/merge"
import { searchCities, type CityResult } from "../geocode"
import { a } from "../atlas.stylex"
import { ws as s } from "../workspace.stylex"
import { Spinner } from "./kit"

// Destinations as tokens with city autocomplete. Picking a suggestion gives
// the caller coordinates and a timezone; free text (Enter) is still accepted
// so an unusual place name never blocks the form.

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
  const [results, setResults] = useState<CityResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const typed = text.trim()

  useEffect(() => {
    if (typed.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    const timer = setTimeout(() => {
      searchCities(typed, controller.signal)
        .then((found) => {
          if (controller.signal.aborted) return
          setResults(found)
          setCursor(0)
          setLoading(false)
        })
        .catch(() => {
          if (controller.signal.aborted) return
          setResults([])
          setLoading(false)
        })
    }, 180)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [typed])

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
    if (!name) return
    if (!values.some((v) => v.toLowerCase() === name.toLowerCase())) onAdd(name, city)
    setText("")
    setResults([])
    setOpen(false)
    inputRef.current?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !text && values.length > 0) {
      onRemove(values.length - 1)
      return
    }
    if (event.key === "Escape" && open && results.length > 0) {
      event.stopPropagation()
      setOpen(false)
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
      commit(open ? results[cursor] : undefined)
    }
  }

  const showList = open && typed.length >= 2 && (results.length > 0 || loading)
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
            // Typed-but-unpicked text still counts once focus leaves the field.
            if (typed && !wrapRef.current?.contains(event.relatedTarget as Node | null)) commit()
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
    </div>
  )
}
