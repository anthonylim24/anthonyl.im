import { ExternalLink } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { ws as s } from "../workspace.stylex"
import type { StopLink } from "./stopLinks"

/** A saved link by its site's name; it opens in a new tab and says so. */
export function LinkChip({ link }: { link: StopLink }) {
  return (
    <a href={link.href} target="_blank" rel="noreferrer" {...sx(s.linkChip)} title={link.href}>
      <ExternalLink size={12} strokeWidth={2} aria-hidden {...sx(a.noShrink)} />
      <span {...sx(s.linkText)}>{link.label}</span>
      <span {...sx(a.srOnly)}> (opens in a new tab)</span>
    </a>
  )
}
