import { useId, useState } from "react"
import { sx } from "@/styles/merge"
import { formatClock, parseClock } from "../meta"
import { a } from "../atlas.stylex"
import { ws as s } from "../workspace.stylex"

/** Type a time the way you'd say it ("8:30a", "2 pm", "14:00"); it tidies itself on blur. */
export function TimeField({
  label,
  value,
  disabled,
  autoFocus,
  onChange,
}: {
  label: string
  value: string | undefined
  disabled?: boolean
  autoFocus?: boolean
  onChange: (value: string | undefined) => void
}) {
  const id = useId()
  const [text, setText] = useState(() => formatClock(value))
  const [bad, setBad] = useState(false)
  // A new value from outside (undo, another editor) replaces the draft.
  const [seenValue, setSeenValue] = useState(value)
  if (value !== seenValue) {
    setSeenValue(value)
    setText(formatClock(value))
    setBad(false)
  }
  const commit = () => {
    if (!text.trim()) {
      setBad(false)
      if (value) onChange(undefined)
      return
    }
    const parsed = parseClock(text)
    if (!parsed) {
      setBad(true)
      return
    }
    setBad(false)
    setText(formatClock(parsed))
    if (parsed !== value) onChange(parsed)
  }
  return (
    <div>
      <label htmlFor={id} {...sx(s.miniLabel)}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        value={text}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder="e.g. 9:30 AM"
        aria-invalid={bad || undefined}
        aria-describedby={bad ? `${id}-error` : undefined}
        {...sx(a.field)}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            commit()
          }
        }}
      />
      {bad && (
        <span id={`${id}-error`} {...sx(a.errorText)} role="alert" style={{ display: "block" }}>
          Try a time like 9:30 AM or 14:00.
        </span>
      )}
    </div>
  )
}
