import type { StyleXStyles } from "@stylexjs/stylex"
import { sx } from "@/styles/merge"
import { tl } from "./timeline.stylex"

/**
 * Another stop named in a line of text by its map number, drawn as a small copy
 * of its pin badge ("Overlaps ②"), so a warning reads the same in every view
 * and width. Off the map (no number) it is named by its title.
 */
export function StopRef({ number, title, style }: { number: number | null; title: string; style?: StyleXStyles }) {
  if (number === null) return <>{title}</>
  return (
    <span {...sx(tl.stopRef, style)} role="img" aria-label={`stop ${number}`}>
      {number}
    </span>
  )
}
