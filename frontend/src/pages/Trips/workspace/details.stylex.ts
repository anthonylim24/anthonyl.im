import * as stylex from "@stylexjs/stylex"

// Trip details: the "what happens to my plans" choices and the list of days
// a new date range leaves out.

const HOVER = "@media (hover: hover)"
const REDUCE = "@media (prefers-reduced-motion: reduce)"
const ring = "0 0 0 2px var(--trips-raised), 0 0 0 4px var(--brand-ring)"

export const d = stylex.create({
  choices: { display: "grid", gap: "0.5rem", marginTop: "0.75rem" },
  choice: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.75rem",
    width: "100%",
    minHeight: "2.75rem",
    padding: "0.75rem 0.875rem",
    borderRadius: "var(--trips-radius-sm)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--trips-line-strong)",
    backgroundColor: "var(--trips-raised)",
    color: "var(--trips-ink)",
    textAlign: "left",
    cursor: "pointer",
    outline: "none",
    transitionProperty: "border-color, background-color",
    transitionDuration: "160ms",
    ":focus-visible": { boxShadow: ring },
    ":disabled": { opacity: 0.5, cursor: "not-allowed" },
    [HOVER]: { ":hover": { borderColor: "var(--trips-ink)" } },
    [REDUCE]: { transitionDuration: "0ms" },
  },
  choiceOn: { borderColor: "var(--trips-ink)", backgroundColor: "var(--trips-sunken)" },
  dot: {
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    width: "1.125rem",
    height: "1.125rem",
    marginTop: "0.125rem",
    borderRadius: "999px",
    borderWidth: "1.5px",
    borderStyle: "solid",
    borderColor: "var(--trips-ink-tertiary)",
  },
  dotOn: { borderColor: "var(--trips-ink)", backgroundColor: "var(--trips-ink)", boxShadow: "inset 0 0 0 3px var(--trips-raised)" },
  choiceText: { display: "flex", flexDirection: "column", gap: "0.125rem", minWidth: 0 },
  choiceTitle: { fontSize: "0.9375rem", fontWeight: 600, overflowWrap: "anywhere" },
  choiceHint: { fontSize: "0.8125rem", lineHeight: 1.45, color: "var(--trips-ink-secondary)", overflowWrap: "anywhere" },
  outside: {
    marginTop: "0.875rem",
    padding: "0.875rem 1rem",
    borderRadius: "var(--trips-radius-sm)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--trips-line-strong)",
  },
  lostList: { listStyle: "none", margin: 0, marginTop: "0.5rem", padding: 0, display: "grid", gap: "0.25rem" },
  lostDay: {
    display: "flex",
    justifyContent: "space-between",
    gap: "0.75rem",
    fontSize: "0.875rem",
    color: "var(--trips-ink)",
    overflowWrap: "anywhere",
  },
  lostCount: { flexShrink: 0, fontFamily: "var(--trips-mono)", fontSize: "0.75rem", color: "var(--trips-ink-tertiary)", paddingTop: "0.125rem" },
  note: { fontSize: "0.8125rem", color: "var(--trips-ink-secondary)", marginTop: "0.375rem", overflowWrap: "anywhere" },
})
