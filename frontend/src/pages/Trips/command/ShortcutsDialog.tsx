import { useEffect, useId } from "react"
import { sx } from "@/styles/merge"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { a } from "../atlas.stylex"
import { Modal } from "../components/kit"
import { cmd } from "./command.stylex"
import { KeyCaps } from "./KeyCaps"
import type { KeyCombo } from "./keys"

// Every shortcut Trips has, where it works. Keep in step with the handlers:
// CommandContext (⌘K, ?), TripsIndex (/, n), TripWorkspace (← →, ⌘Z, Esc),
// ItemCard (Alt+↑ / ↓ on a focused stop).
const SECTIONS: ReadonlyArray<{ title: string; rows: ReadonlyArray<{ label: string; combo: KeyCombo }> }> = [
  {
    title: "Everywhere",
    rows: [
      { label: "Open the palette", combo: ["mod", "k"] },
      { label: "Show keyboard shortcuts", combo: ["?"] },
    ],
  },
  {
    title: "Trips list",
    rows: [
      { label: "Search trips", combo: ["/"] },
      { label: "New trip", combo: ["n"] },
    ],
  },
  {
    title: "Trip",
    rows: [
      { label: "Previous day", combo: ["left"] },
      { label: "Next day", combo: ["right"] },
      { label: "Undo", combo: ["mod", "z"] },
      { label: "Redo", combo: ["shift", "mod", "z"] },
      { label: "Close the place card", combo: ["esc"] },
    ],
  },
  {
    title: "Stops",
    rows: [
      { label: "Move a stop up", combo: ["alt", "up"] },
      { label: "Move a stop down", combo: ["alt", "down"] },
    ],
  },
]

export function ShortcutsDialog({
  open,
  onClose,
  onClosed,
  apple,
}: {
  open: boolean
  onClose: () => void
  /** The sheet has unmounted: put focus back where it was. */
  onClosed: () => void
  apple: boolean
}) {
  const id = useId()
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" wide>
      <AfterUnmount run={onClosed} />
      <div {...sx(cmd.sheetGrid)}>
        {SECTIONS.map((section, index) => (
          <section key={section.title} aria-labelledby={`${id}-${index}`} {...sx(cmd.section)}>
            <h3 id={`${id}-${index}`} {...sx(a.eyebrow, cmd.sectionTitle)}>
              {section.title}
            </h3>
            <dl {...sx(cmd.rows)}>
              {section.rows.map((row) => (
                <div key={row.label} {...sx(cmd.row)}>
                  <dt {...sx(cmd.rowLabel)}>{row.label}</dt>
                  <dd {...sx(cmd.rowKeys)}>
                    <KeyCaps combo={row.combo} apple={apple} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p {...sx(a.small)}>Stops move when they have focus. Single-key shortcuts wait while you are typing in a field.</p>
    </Modal>
  )
}

/**
 * Runs `run` after this subtree unmounts and Radix has finished its own focus
 * work. kit's `Modal` has no Dialog.Trigger, so Radix returns focus nowhere;
 * the owner does it instead. A timeout, because Radix moves focus in one too.
 */
function AfterUnmount({ run }: { run: () => void }) {
  const latest = useLatestCallback(run)
  useEffect(
    () => () => {
      setTimeout(latest, 0)
    },
    [latest],
  )
  return null
}
