import * as stylex from "@stylexjs/stylex"

// The changes sheet: what an AI apply did, day by day. A ribbon per day
// (an hour ruler with the stops as blocks) over one row per change.

const PHONE = "@media (max-width: 639.98px)"

export const c = stylex.create({
  head: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "1rem",
    paddingInline: "1.5rem",
    paddingTop: "1.375rem",
    paddingBottom: "0.5rem",
  },
  headText: { display: "flex", flexDirection: "column", gap: "0.5rem", minWidth: 0 },
  eyebrow: { display: "inline-flex", alignItems: "center", gap: "0.375rem" },
  part: { whiteSpace: "nowrap" },
  // Focused on open so a screen reader starts at the top; not a control, so no ring.
  title: {
    fontFamily: "var(--trips-display)",
    fontSize: "2.5rem",
    fontWeight: 400,
    lineHeight: 1,
    letterSpacing: "-0.02em",
    color: "var(--trips-ink)",
    margin: 0,
    outline: "none",
    [PHONE]: { fontSize: "2.125rem" },
  },

  day: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    paddingTop: "1.125rem",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "var(--trips-line)",
  },
  dayHead: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "1rem", minWidth: 0 },
  dayHeadText: { display: "flex", flexDirection: "column", gap: "0.25rem", minWidth: 0 },
  dayTitle: { fontSize: "1.5rem", lineHeight: 1.1 },
  // The band takes the link to 44px without growing the header.
  dayLink: {
    position: "relative",
    flexShrink: 0,
    fontSize: "0.875rem",
    "::after": { content: '""', position: "absolute", inset: "-0.875rem -0.5rem" },
  },

  // Scrolls inside itself when the day is too long for the sheet; the page never does.
  frame: {
    overflowX: "auto",
    overflowY: "hidden",
    overscrollBehaviorX: "contain",
    scrollbarWidth: "thin",
    paddingBottom: "0.25rem",
  },
  track: { position: "relative", width: "100%" },
  // Geometry (tops, heights) is set inline by `DayRibbon`, which owns the ruler's measures.
  hourLine: {
    position: "absolute",
    bottom: 0,
    width: "1px",
    backgroundColor: "var(--trips-line)",
  },
  hourLabel: {
    position: "absolute",
    top: 0,
    fontFamily: "var(--trips-mono)",
    fontSize: "0.625rem",
    lineHeight: 1,
    letterSpacing: "0.04em",
    fontVariantNumeric: "tabular-nums",
    color: "var(--trips-ink-tertiary)",
    whiteSpace: "nowrap",
  },
  slot: { position: "absolute", pointerEvents: "none" },
  block: {
    display: "block",
    width: "100%",
    height: "100%",
    borderRadius: "3px",
    backgroundColor: "color-mix(in srgb, var(--trips-ink) 24%, transparent)",
    transformOrigin: "0% 50%",
  },
  blockMarked: {
    backgroundColor: "var(--brand-soft)",
    boxShadow: "inset 0 0 0 1.5px var(--brand-fill)",
  },
  blockAdded: { backgroundColor: "var(--brand-fill)" },
  ghost: {
    position: "absolute",
    borderRadius: "3px",
    borderWidth: "1px",
    borderStyle: "dashed",
    borderColor: "var(--trips-ink-secondary)",
    pointerEvents: "none",
  },
  struck: {
    "::after": {
      content: '""',
      position: "absolute",
      insetInline: "-3px",
      top: "50%",
      height: "1px",
      backgroundColor: "var(--trips-ink-secondary)",
    },
  },
  note: {
    position: "absolute",
    fontFamily: "var(--trips-mono)",
    fontSize: "0.625rem",
    lineHeight: 1,
    color: "var(--trips-ink-secondary)",
    whiteSpace: "nowrap",
    pointerEvents: "none",
  },

  rows: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" },
  row: {
    display: "grid",
    gridTemplateColumns: "1.25rem minmax(0, 1fr)",
    columnGap: "0.75rem",
    alignItems: "start",
    paddingBlock: "0.5rem",
  },
  glyph: {
    display: "grid",
    placeItems: "center",
    width: "1.25rem",
    height: "1.25rem",
    marginTop: "0.125rem",
    color: "var(--trips-ink-secondary)",
  },
  rowText: { display: "flex", flexDirection: "column", gap: "0.1875rem", minWidth: 0 },
  rowName: {
    fontFamily: "var(--trips-display)",
    fontSize: "1.1875rem",
    lineHeight: 1.15,
    letterSpacing: "-0.005em",
    color: "var(--trips-ink)",
  },
  rowNameGone: { color: "var(--trips-ink-secondary)", textDecorationLine: "line-through", textDecorationThickness: "1px" },
  rowDetail: { color: "var(--trips-ink-secondary)" },
  rowNote: { alignSelf: "center" },

  skips: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    paddingTop: "1.125rem",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "var(--trips-line)",
  },
  skipTitle: { fontSize: "0.9375rem", fontWeight: 600, lineHeight: 1.35, color: "var(--trips-ink)" },

  replay: { marginInlineEnd: "auto" },
})
