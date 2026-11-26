import * as stylex from "@stylexjs/stylex"

// The day timeline: chart paper with hairline hour rules, stops as paper
// cards placed by the minute, legs as dashed connectors between them.
// Positions and heights come from `timeScale` as inline `top` / `height`.

const HOVER = "@media (hover: hover)"
const REDUCE = "@media (prefers-reduced-motion: reduce)"
const PHONE = "@media (max-width: 639.98px)"
/** Hour labels, then a gutter for the rain band, then the track the stops sit on. */
// Hour labels (3rem, 2.5rem on phones) | sunrise and sunset | the rain band | the stops.
// The gutter, left to right: hour labels, the sun's mark, 4px, the rain band, 4px, the stops.
const TRACK = { default: "4.75rem", [PHONE]: "4.1875rem" }
/** Where the sun's mark sits, measured from the stops (its line starts there, clear of the rain band). */
const SUN_MARK = { default: "-1.75rem", [PHONE]: "-1.6875rem" }

export const tl = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: "0.75rem", minWidth: 0 },

  // ── Summary line ─────────────────────────────────────
  summary: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: "1.125rem",
    rowGap: "0.25rem",
    margin: 0,
    fontFamily: "var(--trips-mono)",
    fontSize: "0.75rem",
    lineHeight: 1.4,
    fontVariantNumeric: "tabular-nums",
    color: "var(--trips-ink-secondary)",
  },

  // Each part led by its glyph, so a wrapped line starts with one, never with a dot.
  summaryPart: { display: "inline-flex", alignItems: "center", gap: "0.3125rem", whiteSpace: "nowrap" },
  summaryWarn: { display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "var(--trips-ink)" },
  // " · " before every part after the first: a wrapped line starts with it, never ends with it.
  sep: { "::before": { content: '"·"', marginRight: "0.625rem", color: "var(--trips-ink-tertiary)" } },

  // ── Ruler ────────────────────────────────────────────
  // Padding keeps the first and last hour labels (centred on their rule) inside.
  // The hour-label column is 3rem (2.5rem on phones); the gutter after it holds the rain band.
  ruler: { position: "relative", paddingTop: "0.5rem", paddingBottom: "1rem" },
  canvas: { position: "relative" },
  // Rules end with the cards (which sit 2px in), so no nub shows past their edge.
  hourRule: {
    position: "absolute",
    left: TRACK,
    right: "2px",
    height: "1px",
    backgroundColor: "var(--trips-line)",
    pointerEvents: "none",
  },
  hourLabel: {
    position: "absolute",
    left: 0,
    width: { default: "3rem", [PHONE]: "2.5rem" },
    transform: "translateY(-50%)",
    textAlign: "right",
    fontFamily: "var(--trips-mono)",
    fontSize: "0.6875rem",
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    color: "var(--trips-ink-tertiary)",
    pointerEvents: "none",
  },
  hourTemp: {
    position: "absolute",
    top: "calc(100% + 0.3125rem)",
    right: 0,
    fontSize: "0.625rem",
    color: "var(--trips-ink-tertiary)",
  },

  // ── Weather on the ruler ─────────────────────────────
  // Rain is never drawn over a stop: a hatched band in the gutter between the
  // hours and the track, from its first minute to its last, under a rain glyph
  // (its chance is in the sky line and on the stops it meets). A soaking or a
  // storm is inked darker. Sunrise and sunset have their own slot left of the
  // band: their glyph there, and a dashed hairline under the stops.
  rain: {
    position: "absolute",
    left: { default: "4rem", [PHONE]: "3.5rem" },
    width: { default: "8px", [PHONE]: "7px" },
    borderRadius: "1px",
    backgroundImage: "repeating-linear-gradient(-60deg, var(--trips-ink-tertiary) 0 1.5px, transparent 1.5px 4.5px)",
    pointerEvents: "none",
  },
  rainStrong: {
    backgroundImage: "repeating-linear-gradient(-60deg, var(--trips-ink-secondary) 0 2px, transparent 2px 4px)",
  },
  // The band hangs from its glyph: drawn over the band's head on the canvas,
  // so it needs no room above the ruler.
  rainMark: {
    position: "absolute",
    top: 0,
    left: "50%",
    display: "flex",
    paddingBottom: "2px",
    transform: "translateX(-50%)",
    backgroundColor: "var(--trips-canvas)",
    color: "var(--trips-ink-secondary)",
  },
  sun: {
    position: "absolute",
    left: TRACK,
    right: "2px",
    height: 0,
    borderTopWidth: "1px",
    borderTopStyle: "dashed",
    borderTopColor: "var(--trips-ink-tertiary)",
    pointerEvents: "none",
  },
  sunMark: {
    position: "absolute",
    left: SUN_MARK,
    top: 0,
    transform: "translateY(-50%)",
    display: "grid",
    placeItems: "center",
    width: "0.75rem",
    height: "0.875rem",
    backgroundColor: "var(--trips-canvas)",
    color: "var(--trips-ink-secondary)",
  },
  track: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: TRACK,
    right: 0,
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  slot: { position: "absolute", zIndex: 1 },
  slotRaised: { zIndex: 2 },

  // ── Stop block ───────────────────────────────────────
  // Badge in the first column beside the time and title; everything else in the second.
  block: {
    display: "grid",
    gridTemplateColumns: "1.375rem minmax(0, 1fr)",
    alignContent: "start",
    alignItems: "start",
    columnGap: "0.5rem",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    paddingBlock: "0.3125rem",
    paddingLeft: "0.375rem",
    paddingRight: "0.5rem",
    textAlign: "left",
    cursor: "pointer",
    borderRadius: "var(--trips-radius-sm)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--trips-line-strong)",
    backgroundColor: "var(--trips-surface)",
    color: "var(--trips-ink)",
    transitionProperty: "box-shadow, border-color",
    transitionDuration: "160ms",
    transitionTimingFunction: "var(--trips-ease-out)",
    [HOVER]: { ":hover": { borderColor: "var(--trips-ink-tertiary)" } },
    [REDUCE]: { transitionDuration: "0ms" },
  },
  // Room on the right for the edit button over the block's corner.
  blockEditable: { paddingRight: "2.125rem" },
  // Looks 28px in the block's corner; its band reaches a 44px target.
  edit: {
    position: "absolute",
    top: "0.25rem",
    right: "0.25rem",
    zIndex: 1,
    display: "grid",
    placeItems: "center",
    width: "1.75rem",
    height: "1.75rem",
    borderRadius: "999px",
    color: "var(--trips-ink-secondary)",
    backgroundColor: "var(--trips-surface)",
    cursor: "pointer",
    // 44px each way: 12px out to the left, 4px to the block's edge on the right.
    "::after": { content: '""', position: "absolute", inset: "-0.5rem -0.25rem -0.5rem -0.75rem" },
    [HOVER]: { ":hover": { backgroundColor: "var(--trips-sunken)", color: "var(--trips-ink)" } },
  },
  editRow: { top: "50%", transform: "translateY(-50%)" },
  // Side by side with an overlapping stop the column is narrow: tighter padding, same grid.
  // Side by side the column is narrow, but the badge and title keep the full cards' indent.
  blockStacked: { paddingRight: "0.3125rem" },
  // The end is a guess: the bottom edge says so.
  blockEstimated: { borderBottomStyle: "dashed" },
  // Runs past the bottom of the ruler: open at the bottom edge.
  blockRunsOn: { borderBottomWidth: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  // Began before the folded ruler starts: open at the top edge.
  blockRunsIn: { borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  // Done for today: quieter, so what is still ahead leads.
  blockPast: { backgroundColor: "var(--trips-canvas)", borderColor: "var(--trips-line)" },
  blockHot: { boxShadow: "0 0 0 1px var(--trips-ink-tertiary), var(--trips-shadow-2)" },
  blockActive: {
    borderColor: "var(--trips-ink)",
    boxShadow: "0 0 0 1px var(--trips-ink), var(--trips-shadow-2)",
    [HOVER]: { ":hover": { borderColor: "var(--trips-ink)" } },
  },
  // Same fill and ink as the day map's pins.
  badge: {
    gridRow: "1 / span 2",
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    width: "1.375rem",
    height: "1.375rem",
    marginTop: "0.0625rem",
    borderRadius: "999px",
    fontFamily: "var(--trips-mono)",
    fontSize: "0.6875rem",
    fontWeight: 700,
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
    backgroundColor: "var(--ta-fill)",
    color: "var(--ta-on)",
  },
  badgePast: { backgroundColor: "transparent", color: "var(--ta)", boxShadow: "inset 0 0 0 1.5px var(--ta-fill)" },
  // An inline copy of a stop's badge in a line of text ("Overlaps ②"): same fill and ink, sized to the line.
  stopRef: {
    display: "inline-grid",
    placeItems: "center",
    flexShrink: 0,
    minWidth: "1rem",
    height: "1rem",
    paddingInline: "0.1875rem",
    marginInline: "0.125rem",
    borderRadius: "999px",
    verticalAlign: "-0.1875rem",
    fontFamily: "var(--trips-mono)",
    fontSize: "0.625rem",
    fontWeight: 700,
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
    backgroundColor: "var(--ta-fill)",
    color: "var(--ta-on)",
  },
  badgeActive: { backgroundColor: "var(--trips-ink)", color: "var(--trips-canvas)" },
  disc: {
    gridRow: "1 / span 2",
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    width: "1.375rem",
    height: "1.375rem",
    marginTop: "0.0625rem",
    borderRadius: "999px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--trips-line-strong)",
    backgroundColor: "var(--trips-canvas)",
    color: "var(--trips-ink-tertiary)",
  },
  text: { display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0 },
  time: {
    gridColumn: "2",
    alignSelf: "center",
    fontFamily: "var(--trips-mono)",
    fontSize: "0.6875rem",
    lineHeight: "1rem",
    fontVariantNumeric: "tabular-nums",
    color: "var(--trips-ink-secondary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  estimate: { color: "var(--trips-ink-tertiary)" },
  timeIcon: { display: "inline-block", marginLeft: "0.375rem", verticalAlign: "-2px", color: "var(--trips-ink-tertiary)" },
  title: {
    gridColumn: "2",
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    overflowWrap: "anywhere",
    fontSize: "0.875rem",
    fontWeight: 600,
    lineHeight: "1.125rem",
    color: "var(--trips-ink)",
  },
  titlePast: { color: "var(--trips-ink-secondary)", fontWeight: 500 },
  // Skipped: not happening. Struck through in the tertiary ink, the strike a shade lighter than the words.
  titleSkipped: {
    color: "var(--trips-ink-tertiary)",
    fontWeight: 500,
    textDecorationLine: "line-through",
    textDecorationColor: "var(--trips-line-strong)",
    textDecorationThickness: "1.5px",
  },
  meta: {
    gridColumn: "2",
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    minWidth: 0,
    fontSize: "0.75rem",
    lineHeight: "1rem",
    color: "var(--trips-ink-tertiary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  warn: {
    gridColumn: "2",
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    minWidth: 0,
    marginTop: "0.125rem",
    fontSize: "0.75rem",
    fontWeight: 500,
    lineHeight: "1rem",
    color: "var(--trips-ink)",
  },
  wet: { color: "var(--trips-ink-secondary)" },
  wetStrong: { color: "var(--trips-ink)", fontWeight: 600 },
  warnDetail: { color: "var(--trips-ink-secondary)", fontWeight: 400 },
  warnText: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 },
  noShrink: { flexShrink: 0 },

  // ── Leg between two stops ────────────────────────────
  gap: {
    position: "absolute",
    left: 0,
    right: 0,
    display: "flex",
    alignItems: "center",
    paddingLeft: "2rem",
    pointerEvents: "none",
  },
  // Lines up with the centre of the number badges above and below.
  gapLine: {
    position: "absolute",
    top: "0.25rem",
    bottom: "0.25rem",
    left: "calc(1.25rem - 0.5px)",
    width: 0,
    borderLeftWidth: "1px",
    borderLeftStyle: "dashed",
    borderLeftColor: "var(--trips-line-strong)",
  },
  gapLineTight: { borderLeftColor: "var(--trips-ink-secondary)" },
  gapLabel: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    fontFamily: "var(--trips-mono)",
    fontSize: "0.6875rem",
    lineHeight: "1rem",
    letterSpacing: "0.02em",
    color: "var(--trips-ink-tertiary)",
  },
  gapRow: { display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: "0.625rem" },
  // "Leave by 3:18 PM" on its own line: when to go is the thing to act on.
  gapLeave: { color: "var(--trips-ink)", whiteSpace: "nowrap" },
  gapLeg: { display: "inline-flex", alignItems: "center", gap: "0.3125rem", whiteSpace: "nowrap" },
  gapTight: { color: "var(--trips-ink)" },
  gapFree: { whiteSpace: "nowrap", color: "var(--trips-ink-secondary)" },

  // ── Now ──────────────────────────────────────────────
  now: {
    position: "absolute",
    left: TRACK,
    right: 0,
    zIndex: 3,
    height: 0,
    borderTopWidth: "1.5px",
    borderTopStyle: "solid",
    borderTopColor: "var(--ta-fill)",
    pointerEvents: "none",
    "::before": {
      content: '""',
      position: "absolute",
      left: "-0.25rem",
      top: "-0.3125rem",
      width: "0.5rem",
      height: "0.5rem",
      borderRadius: "999px",
      backgroundColor: "var(--ta-fill)",
    },
  },
  nowTemp: { color: "var(--trips-ink-tertiary)", fontWeight: 400, letterSpacing: 0 },
  nowLabel: {
    position: "absolute",
    left: 0,
    zIndex: 3,
    width: { default: "3rem", [PHONE]: "2.5rem" },
    transform: "translateY(-50%)",
    textAlign: "right",
    fontFamily: "var(--trips-mono)",
    fontSize: "0.6875rem",
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: "0.04em",
    color: "var(--ta)",
    backgroundColor: "var(--trips-canvas)",
    paddingBlock: "0.125rem",
    pointerEvents: "none",
  },

  // ── Done fold ────────────────────────────────────────
  // Today's finished stops as one hairline row, the width of the stops.
  fold: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    width: "100%",
    minHeight: "2.75rem",
    paddingInline: "0.75rem",
    borderRadius: "var(--trips-radius-sm)",
    borderWidth: "1px",
    borderStyle: "dashed",
    borderColor: "var(--trips-line-strong)",
    backgroundColor: "transparent",
    color: "var(--trips-ink-secondary)",
    textAlign: "left",
    cursor: "pointer",
    transitionProperty: "border-color",
    transitionDuration: "160ms",
    [HOVER]: { ":hover": { borderColor: "var(--trips-ink-tertiary)" } },
    [REDUCE]: { transitionDuration: "0ms" },
  },
  foldText: { flexGrow: 1, minWidth: 0, fontSize: "0.8125rem", fontWeight: 500, lineHeight: 1.3 },
  foldWhen: { fontFamily: "var(--trips-mono)", fontSize: "0.6875rem", fontWeight: 400, color: "var(--trips-ink-tertiary)", marginLeft: "0.375rem", whiteSpace: "nowrap" },
  foldSkipped: { fontWeight: 400, color: "var(--trips-ink-secondary)" },
  foldAction: { display: "inline-flex", alignItems: "center", gap: "0.25rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--trips-ink)" },
  foldChevron: { transitionProperty: "transform", transitionDuration: "200ms", [REDUCE]: { transitionDuration: "0ms" } },
  foldChevronOpen: { transform: "rotate(180deg)" },

  // ── Anytime list ─────────────────────────────────────
  anytime: { display: "flex", flexDirection: "column", gap: "0.5rem", minWidth: 0, marginTop: "0.5rem" },
  anyList: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.375rem" },
  anyItem: { position: "relative" },
  anyRow: { display: "flex", alignItems: "center", gap: "0.5rem", minHeight: "2.75rem", height: "auto", paddingBlock: "0.5rem" },
  anyTitle: { display: "block", fontSize: "0.875rem", fontWeight: 600, lineHeight: 1.3, color: "var(--trips-ink)", overflowWrap: "anywhere" },

  empty: {
    margin: 0,
    padding: "1rem 1.125rem",
    borderRadius: "var(--trips-radius)",
    borderWidth: "1px",
    borderStyle: "dashed",
    borderColor: "var(--trips-line-strong)",
    fontSize: "0.875rem",
    lineHeight: 1.5,
    color: "var(--trips-ink-secondary)",
  },
})
