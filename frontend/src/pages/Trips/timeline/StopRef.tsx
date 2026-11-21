import { sx } from "@/styles/merge"
import { tl } from "./timeline.stylex"

/**
 * Another stop named in a line of text by its map number, drawn as a small copy
 * of its pin badge ("Overlaps ②"), so a warning reads the same in every view
 * and width. Off the map (no number) it is named by its title.
 */
export function StopRef({ number, title }: { number: number | null; title: string }) {
  if (number === null) return <>{title}</>
  return (
    <span {...sx(tl.stopRef)} role="img" aria-label={`stop ${number}`}>
      {number}
    </span>
  )
}
