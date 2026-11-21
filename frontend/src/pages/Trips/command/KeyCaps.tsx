import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { cmd } from "./command.stylex"
import { formatShortcut, spokenShortcut, type KeyCombo } from "./keys"

/**
 * A shortcut drawn as key caps ("⌘" "K" on a Mac, "Ctrl" "K" elsewhere) and
 * read out as words. `spoken={false}` where the shortcut is decoration inside
 * something already named (a palette row).
 */
export function KeyCaps({ combo, apple, spoken = true }: { combo: KeyCombo; apple: boolean; spoken?: boolean }) {
  return (
    <span {...sx(cmd.keys)}>
      <span {...sx(cmd.keys)} aria-hidden>
        {formatShortcut(combo, apple).map((label, index) => (
          <kbd key={index} {...sx(cmd.kbd)}>
            {label}
          </kbd>
        ))}
      </span>
      {spoken ? <span {...sx(a.srOnly)}>{spokenShortcut(combo, apple)}</span> : null}
    </span>
  )
}
