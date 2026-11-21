import { useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Search, X } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { plural } from "../meta"
import { cmd } from "./command.stylex"
import { searchCommands, type Command } from "./commands"
import { KeyCaps } from "./KeyCaps"

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  commands: readonly Command[]
  apple: boolean
  /** A row was chosen. The owner closes the palette and runs it once focus is back. */
  onChoose: (command: Command) => void
  /** The palette has gone and Radix is done with focus: restore it, then run what was chosen. */
  onClosed: () => void
}

/**
 * ⌘K: one field that finds any action, day, stop or trip. A combobox over a
 * grouped listbox; focus stays in the field and the active row is pointed
 * at with aria-activedescendant.
 */
export function CommandPalette({ open, onOpenChange, commands, apple, onChoose, onClosed }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Radix portals to <body>: re-declare the Trips token scope. */}
        <div className="trips trips-portal">
          <DialogPrimitive.Overlay {...sx(a.scrim)} />
          <DialogPrimitive.Content
            {...sx(cmd.panel)}
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              inputRef.current?.focus()
            }}
            // Radix returns focus to a Dialog.Trigger, and there is none here
            // (⌘K opens it from anywhere), so the owner puts focus back.
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              onClosed()
            }}
          >
            <DialogPrimitive.Title {...sx(a.srOnly)}>Command palette</DialogPrimitive.Title>
            <DialogPrimitive.Description {...sx(a.srOnly)}>
              Search for an action, a day or a stop, then press Enter to run it.
            </DialogPrimitive.Description>
            <PaletteBody commands={commands} apple={apple} onChoose={onChoose} inputRef={inputRef} />
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** Mounted only while open, so every opening starts with an empty field. */
function PaletteBody({
  commands,
  apple,
  onChoose,
  inputRef,
}: {
  commands: readonly Command[]
  apple: boolean
  onChoose: (command: Command) => void
  inputRef: RefObject<HTMLInputElement | null>
}) {
  const id = useId()
  const listId = `${id}-list`
  const optionId = (index: number) => `${id}-option-${index}`
  const [query, setQuery] = useState("")
  /** The row the keys or the pointer last chose; the first enabled row until then. */
  const [picked, setPicked] = useState<string | null>(null)

  const groups = useMemo(() => searchCommands(commands, query), [commands, query])
  const rows = useMemo(() => groups.flatMap((group) => group.commands), [groups])
  const pickedIndex = picked === null ? -1 : rows.findIndex((row) => row.id === picked && !row.disabled)
  const activeIndex = pickedIndex >= 0 ? pickedIndex : rows.findIndex((row) => !row.disabled)
  const active = activeIndex >= 0 ? rows[activeIndex] : undefined

  const activeOptionId = active ? optionId(activeIndex) : undefined
  const listRef = useRef<HTMLDivElement>(null)

  const enabled = rows.flatMap((row, index) => (row.disabled ? [] : [index]))
  /** A move by key: the row comes into view, and a group's first row brings its eyebrow along. */
  const pick = (index: number | undefined) => {
    if (index === undefined) return
    setPicked(rows[index]!.id)
    const row = document.getElementById(optionId(index))
    const before = row?.previousElementSibling
    if (before && before.getAttribute("role") !== "option") before.scrollIntoView?.({ block: "nearest" })
    row?.scrollIntoView?.({ block: "nearest" })
  }
  const step = (by: 1 | -1) => {
    if (enabled.length === 0) return
    const at = enabled.indexOf(activeIndex)
    pick(enabled[(at + by + enabled.length) % enabled.length])
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    // An IME is composing (Korean, Japanese): its Enter and arrows are its own.
    // Safari reports the committing Enter with keyCode 229 instead.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      step(event.key === "ArrowDown" ? 1 : -1)
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      pick(event.key === "Home" ? enabled[0] : enabled[enabled.length - 1])
    } else if (event.key === "Enter") {
      event.preventDefault()
      if (active) onChoose(active)
    }
  }

  const shown = query.trim()
  const announcement = rows.length > 0 ? plural(rows.length, "result") : shown ? `No matches for “${shown}”` : "No commands"

  // Where each group starts in `rows`, for option ids and the active check.
  const sections = groups.map((group, index) => ({
    ...group,
    start: groups.slice(0, index).reduce((count, before) => count + before.commands.length, 0),
  }))

  return (
    <>
      <div {...sx(cmd.inputRow)}>
        <Search size={18} strokeWidth={1.75} aria-hidden {...sx(cmd.searchIcon)} />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Search commands"
          aria-autocomplete="list"
          aria-expanded={rows.length > 0}
          aria-controls={rows.length > 0 ? listId : undefined}
          aria-activedescendant={activeOptionId}
          placeholder="Type a command or search"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setPicked(null)
            // New results start from the top, eyebrow and all.
            listRef.current?.scrollTo?.({ top: 0 })
          }}
          onKeyDown={onKeyDown}
          {...sx(a.fieldBare, cmd.input)}
        />
        <DialogPrimitive.Close {...sx(a.iconBtn, a.iconBtnSm, cmd.closePhone)} aria-label="Close">
          <X size={18} strokeWidth={1.75} aria-hidden />
        </DialogPrimitive.Close>
      </div>

      {rows.length === 0 ? (
        <p {...sx(cmd.empty, a.wrap)}>
          {shown ? (
            <>
              No matches for <span {...sx(cmd.emptyQuery)}>“{shown}”</span>
            </>
          ) : (
            "Nothing to do here yet"
          )}
        </p>
      ) : (
        <div ref={listRef} id={listId} role="listbox" aria-label="Commands" {...sx(cmd.list)}>
          {sections.map((section, sectionIndex) => {
            const labelId = `${id}-group-${sectionIndex}`
            return (
              <div key={section.group} role="group" aria-labelledby={labelId} {...sx(cmd.group, sectionIndex > 0 && cmd.groupRuled)}>
                <div id={labelId} {...sx(a.eyebrow, cmd.groupLabel)}>
                  {section.group}
                </div>
                {section.commands.map((command, i) => {
                  const index = section.start + i
                  const on = index === activeIndex
                  const Icon = command.icon
                  return (
                    <div
                      key={command.id}
                      id={optionId(index)}
                      role="option"
                      aria-selected={on}
                      aria-disabled={command.disabled || undefined}
                      {...sx(cmd.option, on && cmd.optionActive, command.disabled && cmd.optionDisabled)}
                      // Pointer *movement*, not enter: a row scrolled under a still
                      // pointer must not take the active row from the keys.
                      onPointerMove={() => {
                        if (!on && !command.disabled) setPicked(command.id)
                      }}
                      // Keep focus (and the caret) in the field.
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        if (!command.disabled) onChoose(command)
                      }}
                    >
                      <span {...sx(cmd.optionIcon, on && cmd.optionIconActive)} aria-hidden>
                        {Icon ? <Icon size={18} strokeWidth={1.75} /> : null}
                      </span>
                      <span {...sx(cmd.optionText)}>
                        <span {...sx(cmd.optionTitle, a.truncate)}>{command.title}</span>
                        {command.subtitle ? <span {...sx(cmd.optionSubtitle, a.truncate)}>{command.subtitle}</span> : null}
                      </span>
                      {command.shortcut?.length ? (
                        <span {...sx(cmd.optionKeys)} aria-hidden>
                          <KeyCaps combo={command.shortcut} apple={apple} spoken={false} />
                        </span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      <p role="status" {...sx(a.srOnly)}>
        {announcement}
      </p>
      <div {...sx(cmd.footer)} aria-hidden>
        ↑↓ to move · ↵ to run · esc to close
      </div>
    </>
  )
}
