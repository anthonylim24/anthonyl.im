import * as stylex from "@stylexjs/stylex"

// The day's sky: an engraving inked like the compass and the serpent (an
// alpha mask in --trips-ink-secondary, so it follows the theme; on dark paper
// it swaps to its print, see `.trips-sky-art` in index.css), the high set
// large in the display serif and the rest in mono. One band at every width,
// left-aligned so the engraving holds its place from day to day:
// engraving | temperatures and sky | sunrise and sunset.

const PHONE = "@media (max-width: 639.98px)"

export const sky = stylex.create({
  root: {
    display: "flex",
    alignItems: "center",
    gap: { default: "1rem", [PHONE]: "0.75rem" },
    margin: 0,
    minHeight: { default: "6.5rem", [PHONE]: "4rem" },
  },
  holding: {},
  art: {
    flexShrink: 0,
    display: "block",
    width: { default: "6.5rem", [PHONE]: "4rem" },
    aspectRatio: "1",
    backgroundColor: "var(--trips-ink-secondary)",
    maskSize: "contain",
    maskRepeat: "no-repeat",
    maskPosition: "center",
  },
  artFaint: { opacity: 0.3 },
  text: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: "1rem",
    flexGrow: 1,
    minWidth: 0,
  },
  main: { display: "flex", flexDirection: "column", gap: "0.125rem", minWidth: 0 },
  eyebrowRow: { display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: "0.875rem", rowGap: "0.125rem" },
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
    // A clear step under the day's title (about 0.8 of it): the engraving carries the weather.
    fontSize: { default: "2rem", [PHONE]: "1.5rem" },
    lineHeight: 1,
    letterSpacing: "-0.02em",
    color: "var(--trips-ink)",
    fontVariantNumeric: "tabular-nums",
  },
  // The plan's weather is a guess: lighter ink, and an ≈ before it.
  estimate: { color: "var(--trips-ink-secondary)" },
  approx: { fontSize: "0.55em", color: "var(--trips-ink-tertiary)", marginRight: "0.125rem", verticalAlign: "0.35em" },
  low: {
    fontFamily: "var(--trips-display)",
    fontSize: { default: "1.125rem", [PHONE]: "1rem" },
    lineHeight: 1,
    color: "var(--trips-ink-tertiary)",
    fontVariantNumeric: "tabular-nums",
  },
  word: { fontSize: "0.8125rem", lineHeight: 1.35, color: "var(--trips-ink-secondary)", textWrap: "pretty" },
  chance: { color: "var(--trips-ink)", whiteSpace: "nowrap" },
  // Only rain that meets a stop is set in weight; "after your last stop" stays quiet.
  consequence: { fontWeight: 600 },
  retry: {
    padding: 0,
    marginLeft: "0.25rem",
    fontSize: "inherit",
    fontWeight: 600,
    color: "var(--brand)",
    textDecorationLine: "underline",
    textUnderlineOffset: "0.15em",
    cursor: "pointer",
    position: "relative",
    "::after": { content: '""', position: "absolute", inset: "-0.75rem -0.5rem" },
  },
  light: {
    display: "inline-flex",
    columnGap: "0.625rem",
    fontFamily: "var(--trips-mono)",
    fontSize: "0.6875rem",
    lineHeight: 1.4,
    fontVariantNumeric: "tabular-nums",
    color: "var(--trips-ink-tertiary)",
  },
  lightPart: { display: "inline-flex", alignItems: "center", gap: "0.25rem", whiteSpace: "nowrap" },
})
