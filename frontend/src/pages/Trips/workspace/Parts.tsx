import { Fragment, type ReactNode } from "react"
import * as stylex from "@stylexjs/stylex"
import { sx } from "@/styles/merge"

const s = stylex.create({
  // Breaks only between parts; a part wider than the line still wraps inside itself.
  part: { display: "inline-block", maxWidth: "100%", overflowWrap: "anywhere" },
})

/**
 * Parts of one line joined by " · ", each kept whole when the line wraps, the
 * separator ending its line, so a wrapped line never starts with "·".
 */
export function Parts({ parts }: { parts: readonly ReactNode[] }) {
  const shown = parts.filter((part) => part !== null && part !== false && part !== "")
  return shown.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && " "}
      <span {...sx(s.part)}>
        {part}
        {i < shown.length - 1 && " ·"}
      </span>
    </Fragment>
  ))
}
