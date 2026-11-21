import * as stylex from "@stylexjs/stylex"

// Bookings: the editor's fields, the read view's lines, the night line in
// the day header, and the "Paste a confirmation" sheet.

const PHONE = "@media (max-width: 639.98px)"
const REDUCE = "@media (prefers-reduced-motion: reduce)"
const ring = "0 0 0 2px var(--trips-canvas), 0 0 0 4px var(--brand-ring)"

export const bk = stylex.create({
  // ── Editor ────────────────────────────────────────────
  // Spans the card editor's grid and keeps its own two columns, so it lays
  // out the same in the day list and in the paste sheet.
  fields: {
    gridColumn: "1 / -1",
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "0.75rem",
    minWidth: 0,
    margin: 0,
    padding: 0,
    borderWidth: 0,
  },
  wide: { gridColumn: "1 / -1" },
  code: { fontFamily: "var(--trips-mono)", letterSpacing: "0.04em" },
  zones: { display: "flex", flexWrap: "wrap", gap: "0.375rem", marginTop: "0.5rem" },

  // ── Read view ─────────────────────────────────────────
  summary: { display: "flex", flexDirection: "column", gap: "0.5rem", minWidth: 0 },
  lines: { display: "flex", flexDirection: "column", gap: "0.125rem", minWidth: 0, margin: 0 },
  line: {
    margin: 0,
    fontSize: "0.8125rem",
    lineHeight: 1.45,
    color: "var(--trips-ink-secondary)",
    fontVariantNumeric: "tabular-nums",
    overflowWrap: "anywhere",
  },
  lineLead: { color: "var(--trips-ink)", fontWeight: 500 },
  facts: {
    display: "grid",
    gridTemplateColumns: "max-content minmax(0, 1fr)",
    alignItems: "center",
    columnGap: "0.75rem",
    rowGap: "0.125rem",
    margin: 0,
  },
  factLabel: {
    fontFamily: "var(--trips-mono)",
    fontSize: "0.6875rem",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--trips-ink-tertiary)",
  },
  factValue: { display: "flex", alignItems: "center", gap: "0.25rem", minWidth: 0, minHeight: "2.75rem", margin: 0, fontSize: "0.875rem", color: "var(--trips-ink)" },
  copied: { fontFamily: "var(--trips-mono)", fontSize: "0.6875rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--brand)" },

  // ── Night line (day header) ───────────────────────────
  tonight: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    minWidth: 0,
    margin: 0,
    fontSize: "0.875rem",
    lineHeight: 1.4,
    color: "var(--trips-ink-secondary)",
  },
  tonightIcon: { flexShrink: 0, color: "var(--trips-ink-tertiary)" },
  tonightName: { color: "var(--trips-ink)", fontWeight: 500 },

  // ── Paste sheet ───────────────────────────────────────
  paste: { minHeight: { default: "12rem", [PHONE]: "9rem" }, fontSize: { default: "0.875rem", [PHONE]: "1rem" }, lineHeight: 1.5 },
  count: { fontFamily: "var(--trips-mono)", fontSize: "0.6875rem", letterSpacing: "0.04em", color: "var(--trips-ink-tertiary)", fontVariantNumeric: "tabular-nums" },
  found: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.75rem" },
  card: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--trips-line-strong)",
    borderRadius: "var(--trips-radius)",
    backgroundColor: "var(--trips-raised)",
    transitionProperty: "border-color, opacity",
    transitionDuration: "160ms",
    [REDUCE]: { transitionDuration: "0ms" },
  },
  cardOff: { borderColor: "var(--trips-line)", backgroundColor: "var(--trips-surface)" },
  cardHead: {
    display: "grid",
    gridTemplateColumns: "2.75rem 2.25rem minmax(0, 1fr) auto",
    alignItems: "start",
    columnGap: "0.5rem",
    padding: "0.5rem 0.5rem 0.5rem 0.25rem",
  },
  cardCheck: { marginLeft: 0 },
  cardText: { display: "flex", flexDirection: "column", gap: "0.1875rem", minWidth: 0, paddingTop: "0.375rem" },
  cardTitle: { fontSize: "0.9375rem", fontWeight: 600, lineHeight: 1.35, color: "var(--trips-ink)", overflowWrap: "anywhere" },
  cardWhen: { fontFamily: "var(--trips-mono)", fontSize: "0.75rem", letterSpacing: "0.02em", color: "var(--trips-ink-secondary)", fontVariantNumeric: "tabular-nums" },
  cardOutside: { fontSize: "0.8125rem", lineHeight: 1.45, color: "var(--trips-ink)", fontWeight: 500 },
  cardBody: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "0.75rem",
    padding: "0.875rem",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "var(--trips-line)",
  },
  tile: {
    display: "grid",
    placeItems: "center",
    width: "2.25rem",
    height: "2.25rem",
    marginTop: "0.25rem",
    borderRadius: "0.625rem",
    backgroundColor: "var(--trips-sunken)",
    color: "var(--trips-ink-secondary)",
  },
  status: { minHeight: "1.5rem", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", color: "var(--trips-ink-secondary)" },

  // ── Overview list ─────────────────────────────────────
  rowText: { display: "flex", flexDirection: "column", gap: "0.1875rem", minWidth: 0 },
  rowWhen: { fontFamily: "var(--trips-mono)", fontSize: "0.75rem", letterSpacing: "0.02em", color: "var(--trips-ink-secondary)", fontVariantNumeric: "tabular-nums" },
  empty: { paddingBlock: "0.75rem", borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: "var(--trips-line)" },
  typePills: { display: "flex", flexWrap: "wrap", gap: "0.5rem" },
  focusRing: { outline: "none", ":focus-visible": { boxShadow: ring } },
})
