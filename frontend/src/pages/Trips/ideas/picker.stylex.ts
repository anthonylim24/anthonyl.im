import * as stylex from "@stylexjs/stylex"

// The "Recommended" block above the day list in the wishlist's day picker
// (`IdeaDayPicker`). Rows reuse the list's own `ws.pickRow`; this adds the
// block, its loading shape, the reason line and the distance.

export const picker = stylex.create({
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
    paddingBottom: "1rem",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "var(--trips-line)",
  },
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", minHeight: "1.625rem" },
  aiMark: { fontSize: "0.6875rem", gap: "0.25rem", minHeight: "1.375rem", paddingInline: "0.5rem" },
  // Each loading row holds the height of a real one, so the list below does not jump when picks land.
  skeletonRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    minHeight: "3.5rem",
    paddingInline: "0.625rem",
    paddingBlock: "0.5rem",
  },
  skeletonIcon: { width: "1rem", height: "1rem", flexShrink: 0 },
  skeletonLines: { display: "flex", flexDirection: "column", gap: "0.375rem", flexGrow: 1, minWidth: 0 },
  skeletonLabel: { height: "0.875rem", width: "45%" },
  skeletonReason: { height: "0.75rem", width: "80%" },
  reason: {
    display: "block",
    marginTop: "0.125rem",
    fontSize: "0.8125rem",
    lineHeight: 1.45,
    color: "var(--trips-ink-secondary)",
  },
  distance: {
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
    minHeight: "1.5rem",
    paddingInline: "0.5rem",
    borderRadius: "999px",
    backgroundColor: "var(--trips-sunken)",
    color: "var(--trips-ink-secondary)",
    fontFamily: "var(--trips-mono)",
    fontSize: "0.75rem",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  // Sits close over the list it names; the sheet's own gap would float it halfway.
  allHeading: { marginBottom: "-0.625rem" },
})
