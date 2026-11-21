import * as stylex from "@stylexjs/stylex"

// The trip recap: an editorial sheet in the atlas's inks. The trip's accent
// lives only in the map; everything else is ink, paper and hairlines.

const WIDE = "@media (min-width: 640px)"

const hairline = {
  borderTopWidth: "1px",
  borderTopStyle: "solid",
  borderTopColor: "var(--trips-line)",
} as const

export const r = stylex.create({
  sheet: { display: "flex", flexDirection: "column", gap: "1.5rem", minWidth: 0 },

  map: {
    position: "relative",
    aspectRatio: "3 / 2",
    overflow: "hidden",
    borderRadius: "var(--trips-radius)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--trips-line)",
    backgroundColor: "var(--trips-sunken)",
  },

  // Days · places · cities · distance: serif numerals over mono labels, hairlines between.
  figures: {
    display: "grid",
    gridTemplateColumns: { default: "repeat(2, minmax(0, 1fr))", [WIDE]: "repeat(var(--recap-figures, 4), minmax(0, 1fr))" },
    margin: 0,
    ...hairline,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "var(--trips-line)",
  },
  figure: {
    display: "flex",
    flexDirection: "column-reverse",
    gap: "0.25rem",
    paddingBlock: "0.875rem",
    paddingInline: "0.875rem",
    minWidth: 0,
    borderLeftWidth: "1px",
    borderLeftStyle: "solid",
    borderLeftColor: "var(--trips-line)",
  },
  figureFirst: { borderLeftWidth: 0, paddingLeft: 0 },
  // On phones the second row starts flush too.
  figureRowStart: { borderLeftWidth: { default: 0, [WIDE]: "1px" }, paddingLeft: { default: 0, [WIDE]: "0.875rem" } },
  figureValue: { margin: 0, fontSize: "2.25rem", lineHeight: 1, fontVariantNumeric: "lining-nums tabular-nums" },
  figureLabel: { margin: 0 },

  cities: { margin: 0, fontSize: "0.9375rem", lineHeight: 1.5, color: "var(--trips-ink-secondary)", textWrap: "pretty" },
  empty: { margin: 0, maxWidth: "34rem", textWrap: "pretty" },

  actions: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" },
  status: { minHeight: "1.25rem", margin: 0 },

  section: { display: "flex", flexDirection: "column", gap: "0.75rem", minWidth: 0, paddingTop: "1rem", ...hairline },
  sectionTitle: { fontSize: "1.5rem", lineHeight: 1.1 },

  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.75rem" },
  loved: { display: "flex", flexDirection: "column", gap: "0.125rem", minWidth: 0 },
  lovedName: { fontSize: "1.375rem", lineHeight: 1.15 },

  excerpt: {
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
    paddingLeft: "0.875rem",
    borderLeftWidth: "1px",
    borderLeftStyle: "solid",
    borderLeftColor: "var(--trips-line-strong)",
  },
  excerptText: {
    margin: 0,
    fontFamily: "var(--trips-display)",
    fontStyle: "italic",
    fontSize: "1.25rem",
    lineHeight: 1.35,
    color: "var(--trips-ink)",
    textWrap: "pretty",
  },

  total: { fontSize: "2rem", lineHeight: 1 },
  spendRow: { display: "flex", flexDirection: "column", gap: "0.375rem", minWidth: 0 },
  spendLine: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "1rem", fontSize: "0.9375rem" },
  track: { position: "relative", height: "2px", backgroundColor: "var(--trips-line)", overflow: "hidden" },
  // Its width is the category's share, set inline.
  bar: { position: "absolute", insetBlock: 0, left: 0, backgroundColor: "var(--trips-ink-secondary)" },

  // ── Paper ─────────────────────────────────────────────
  print: { display: "none", fontFamily: '"Inter", system-ui, sans-serif', color: "var(--trips-ink)", backgroundColor: "#ffffff" },
  printHead: { display: "flex", flexDirection: "column", gap: "6pt", marginBottom: "14pt" },
  printTitle: { fontSize: "34pt", lineHeight: 1.05 },
  printDates: { margin: 0, fontSize: "11pt", color: "var(--trips-ink-secondary)" },
})
