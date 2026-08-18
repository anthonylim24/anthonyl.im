import { useReducedMotion } from "motion/react"
import { useLayoutEffect, useRef } from "react"
import { cn } from "@/lib/utils"

const SEP = new Set([":", " ", "·", ".", ",", "/", "–", "-"])

function glyphKind(glyph: string): "sep" | "digit" | "letter" {
  if (SEP.has(glyph)) return "sep"
  if (glyph >= "0" && glyph <= "9") return "digit"
  return "letter"
}

function FlipGlyph({ glyph, animate }: { glyph: string; animate: boolean }) {
  return (
    <span className={`trips-flip-cell trips-flip-${glyphKind(glyph)}`} aria-hidden>
      <span key={glyph} className={animate ? "trips-flip-glyph" : undefined}>
        {glyph === " " ? "\u00a0" : glyph}
      </span>
    </span>
  )
}

/** Split-flap station clock. Reduced motion swaps the string instantly. */
export function FlipTime({
  value,
  className,
  label,
  playOnMount = false,
}: {
  value: string
  className?: string
  label?: string
  playOnMount?: boolean
}) {
  const reduce = useReducedMotion()
  const stored = useRef<string | null>(null)
  const prior = stored.current === null ? (playOnMount ? "" : value) : stored.current
  useLayoutEffect(() => {
    stored.current = value
  }, [value])

  const glyphs = Array.from(value)

  if (reduce) {
    return (
      <span className={cn("tabular-nums", className)} aria-label={label ?? value}>
        {value}
      </span>
    )
  }

  return (
    <span className={cn("trips-flip inline-flex tabular-nums", className)} aria-label={label ?? value}>
      <span className="sr-only">{value}</span>
      {glyphs.map((glyph, index) => (
        <FlipGlyph key={`${index}:${glyphKind(glyph)}`} glyph={glyph} animate={prior[index] !== glyph} />
      ))}
    </span>
  )
}
