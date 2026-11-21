import { useState } from "react"
import { Search } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { cmd } from "./command.stylex"
import { useCommandPalette } from "./CommandContext"
import { isApplePlatform } from "./keys"
import { KeyCaps } from "./KeyCaps"

/** The header's way into the palette: "Search ⌘K" on desktop, a magnifier on phones. */
export function CommandButton() {
  const { setOpen } = useCommandPalette()
  const [apple] = useState(() => isApplePlatform())
  return (
    <button
      type="button"
      aria-label="Search"
      aria-haspopup="dialog"
      aria-keyshortcuts={apple ? "Meta+K" : "Control+K"}
      onClick={() => setOpen(true)}
      {...sx(a.btn, a.btnGhost, a.btnSm, cmd.trigger)}
    >
      <Search size={16} strokeWidth={1.75} aria-hidden />
      <span {...sx(cmd.triggerWide)} aria-hidden>
        Search
        <KeyCaps combo={["mod", "k"]} apple={apple} spoken={false} />
      </span>
    </button>
  )
}
