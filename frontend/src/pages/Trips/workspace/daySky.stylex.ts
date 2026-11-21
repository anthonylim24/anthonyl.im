import * as stylex from "@stylexjs/stylex"

// The day's sky: an engraving inked like the compass and the serpent (an
// alpha mask in --trips-ink-secondary, so it follows the theme; on dark paper
// it swaps to its print, see `.trips-sky-art` in index.css), the high set
// large in the display serif and the rest in mono. On phones it is one band:
// engraving | temperatures and sky | sunrise and sunset.

const PHONE = "@media (max-width: 639.98px)"

export const sky = stylex.create({
  root: {
    display: "flex",
    alignItems: "center",
    gap: { default: "0.875rem", [PHONE]: "0.75rem" },
    margin: 0,
    flexShrink: 0,
    minHeight: { default: "6rem", [PHONE]: "4rem" },
  },
  holding: { minWidth: { default: "14rem", [PHONE]: 0 } },
  art: {
    flexShrink: 0,
    display: "block",
    width: { default: "6rem", [PHONE]: "4rem" },
    aspectRatio: "1",
    backgroundColor: "var(--trips-ink-secondary)",
    maskSize: "contain",
    maskRepeat: "no-repeat",
    maskPosition: "center",
  },
  artFaint: { opacity: 0.35 },
  text: {
    display: "flex",
    flexDirection: { default: "column", [PHONE]: "row" },
    alignItems: { default: "flex-start", [PHONE]: "center" },
    justifyContent: "space-between",
    columnGap: "1rem",
    rowGap: "0.25rem",
    flexGrow: { default: 0, [PHONE]: 1 },
    minWidth: 0,
  },
  main: { display: "flex", flexDirection: "column", gap: "0.125rem", minWidth: 0 },
  eyebrow: {
    fontFamily: "var(--trips-mono)",
    fontSize: "0.625rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    lineHeight: 1.4,
    color: "var(--trips-ink-tertiary)",
  },
  temps: { display: "flex", alignItems: "baseline", gap: "0.375rem" },
  high: {
    fontFamily: "var(--trips-display)",
    fontSize: { default: "2.75rem", [PHONE]: "2rem" },
    lineHeight: 1,
    letterSpacing: "-0.02em",
    color: "var(--trips-ink)",
    fontVariantNumeric: "tabular-nums",
  },
  // The plan's weather is a guess: lighter ink, and an ≈ before it.
  estimate: { color: "var(--trips-ink-secondary)" },
  low: {
    fontFamily: "var(--trips-display)",
    fontSize: { default: "1.375rem", [PHONE]: "1.125rem" },
    lineHeight: 1,
    color: "var(--trips-ink-tertiary)",
    fontVariantNumeric: "tabular-nums",
  },
  word: { fontSize: "0.8125rem", lineHeight: 1.35, color: "var(--trips-ink-secondary)", whiteSpace: "nowrap" },
  chance: { color: "var(--trips-ink)" },
  light: {
    display: "flex",
    flexDirection: { default: "row", [PHONE]: "column" },
    alignItems: { default: "center", [PHONE]: "flex-end" },
    columnGap: "0.625rem",
    rowGap: "0.25rem",
    fontFamily: "var(--trips-mono)",
    fontSize: "0.6875rem",
    lineHeight: 1.4,
    fontVariantNumeric: "tabular-nums",
    color: "var(--trips-ink-tertiary)",
  },
  lightPart: { display: "inline-flex", alignItems: "center", gap: "0.25rem", whiteSpace: "nowrap" },
})
