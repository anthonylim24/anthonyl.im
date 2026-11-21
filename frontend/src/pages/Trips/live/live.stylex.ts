import * as stylex from "@stylexjs/stylex"

// The live trip: the "now / next" card at the top of the overview and the
// now marker in a day's stop list. Compose the `a` primitives first; these
// are the parts they do not cover. The trip accent (`--ta*`) appears once
// per surface: the card's date tile, the now marker. Everything else is ink
// on paper.

const HOVER = "@media (hover: hover)"
const REDUCE = "@media (prefers-reduced-motion: reduce)"
const PHONE = "@media (max-width: 639.98px)"

export const live = stylex.create({
  // ── Now card ──────────────────────────────────────────
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    padding: { default: "1rem", "@media (min-width: 640px)": "1.25rem 1.375rem" },
    borderRadius: "var(--trips-radius-lg)",
    backgroundColor: "var(--trips-surface)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--trips-line)",
    minWidth: 0,
  },
  head: {
    display: "grid",
    gridTemplateColumns: "3.25rem minmax(0, 1fr) auto",
    alignItems: "center",
    columnGap: "0.875rem",
  },
  // The one accent moment: the trip's colour as a solid date tile.
  tile: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.125rem",
    width: "3.25rem",
    height: "3.25rem",
    borderRadius: "0.75rem",
    backgroundColor: "var(--ta-fill)",
    color: "var(--ta-on)",
    flexShrink: 0,
  },
  tileTop: {
    fontFamily: "var(--trips-mono)",
    fontSize: "0.625rem",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    lineHeight: 1,
  },
  tileNum: { fontFamily: "var(--trips-display)", fontSize: "1.5rem", lineHeight: 0.9 },
  headText: { display: "flex", flexDirection: "column", gap: "0.25rem", minWidth: 0 },
  dayTitle: { fontSize: "1.375rem", lineHeight: 1.1 },
  clock: { color: "var(--trips-ink-tertiary)", alignSelf: "start", paddingTop: "0.125rem" },
  rule: { height: "1px", backgroundColor: "var(--trips-line)", borderWidth: 0, margin: 0 },

  // "Now" line: what is under way.
  nowRow: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    columnGap: "0.625rem",
    rowGap: "0.125rem",
    minWidth: 0,
  },
  nowName: { fontSize: "0.9375rem", fontWeight: 600, color: "var(--trips-ink)", minWidth: 0 },

  // "Next" block: the thing to act on.
  next: { display: "flex", flexDirection: "column", gap: "0.5rem", minWidth: 0 },
  nextHead: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    flexWrap: "wrap",
    columnGap: "1rem",
    rowGap: "0.25rem",
  },
  nextName: { fontSize: { default: "1.875rem", [PHONE]: "1.625rem" }, lineHeight: 1.05 },
  countdown: {
    fontFamily: "var(--trips-mono)",
    fontSize: { default: "1.625rem", [PHONE]: "1.375rem" },
    letterSpacing: "-0.02em",
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
    color: "var(--trips-ink)",
    whiteSpace: "nowrap",
  },
  leave: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.375rem 0.625rem" },
  leaveNow: { color: "var(--trips-ink)", fontWeight: 600 },
  // Where the estimate starts from: worth saying when there is room; on a
  // phone it would push the leave time onto two lines.
  leaveFrom: { [PHONE]: { display: "none" } },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.625rem",
    marginTop: "0.25rem",
  },
  // On a phone the two actions share the row, each a full thumb target.
  action: { [PHONE]: { flexGrow: 1, flexBasis: 0 } },

  // Today's progress: one tick per timed stop, ink once it has started.
  progress: { display: "flex", alignItems: "center", gap: "0.75rem" },
  ticks: { display: "flex", gap: "3px", flexGrow: 1, minWidth: 0 },
  tick: {
    flexGrow: 1,
    height: "3px",
    borderRadius: "999px",
    backgroundColor: "var(--trips-line-strong)",
  },
  tickOn: { backgroundColor: "var(--trips-ink)" },

  // Before the trip: the countdown figure, set large.
  countRow: { display: "flex", alignItems: "baseline", flexWrap: "wrap", columnGap: "0.5rem" },
  countNum: { fontSize: "clamp(3.25rem, 11vw, 4.25rem)", lineHeight: 0.85, letterSpacing: "-0.03em" },
  countUnit: { fontSize: "1.75rem", lineHeight: 1 },
  // A row link: the first booking or stop.
  rowLink: {
    display: "grid",
    gridTemplateColumns: "2.25rem minmax(0, 1fr) auto",
    alignItems: "center",
    gap: "0.75rem",
    minHeight: "2.75rem",
    marginInline: "-0.5rem",
    padding: "0.375rem 0.5rem",
    borderRadius: "var(--trips-radius-sm)",
    color: "inherit",
    textDecoration: "none",
    transitionProperty: "background-color",
    transitionDuration: "160ms",
    [HOVER]: { ":hover": { backgroundColor: "var(--trips-sunken)" } },
    [REDUCE]: { transitionDuration: "0ms" },
  },
  iconTile: {
    display: "grid",
    placeItems: "center",
    width: "2.25rem",
    height: "2.25rem",
    borderRadius: "0.625rem",
    backgroundColor: "var(--trips-sunken)",
    color: "var(--trips-ink-secondary)",
  },
  rowTitle: { fontSize: "0.9375rem", fontWeight: 600, color: "var(--trips-ink)" },

  // After the trip: one line of figures.
  recap: { fontSize: { default: "1.625rem", [PHONE]: "1.375rem" }, lineHeight: 1.15 },

  // ── Now marker in a day's stop list ──────────────────
  // Same columns as a stop (`ws.item`): the dot sits on the dashed gutter line.
  nowLine: {
    position: "relative",
    display: "grid",
    gridTemplateColumns: "2rem minmax(0, 1fr)",
    columnGap: "0.75rem",
    alignItems: "center",
    minHeight: "1.75rem",
    listStyle: "none",
  },
  nowGutter: { position: "relative", alignSelf: "stretch", display: "grid", placeItems: "center" },
  nowGutterLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "50%",
    width: "1px",
    marginLeft: "-0.5px",
    backgroundImage: "linear-gradient(to bottom, var(--trips-line-strong) 50%, transparent 50%)",
    backgroundSize: "1px 6px",
  },
  nowDot: {
    position: "relative",
    width: "0.625rem",
    height: "0.625rem",
    borderRadius: "999px",
    backgroundColor: "var(--ta-fill)",
    boxShadow: "0 0 0 3px var(--trips-canvas)",
  },
  nowTrack: { display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 },
  nowLabel: {
    flexShrink: 0,
    fontSize: "0.6875rem",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--ta)",
  },
  nowRule: { flexGrow: 1, height: "1px", backgroundColor: "var(--ta-fill)" },
})
