import * as stylex from "@stylexjs/stylex"

// Save state and the offline banner. Type and colour follow the workspace's
// own save line (mono caps, one small dot); only the layout lives here.

const PHONE = "@media (max-width: 639.98px)"
const NARROW = "@media (max-width: 1023.98px)"
const REDUCE = "@media (prefers-reduced-motion: reduce)"
const ring = "0 0 0 2px var(--trips-canvas), 0 0 0 4px var(--brand-ring)"

const pulse = stylex.keyframes({
  "0%": { opacity: 1 },
  "50%": { opacity: 0.35 },
  "100%": { opacity: 1 },
})

export const save = stylex.create({
  root: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    minWidth: 0,
    fontFamily: "var(--trips-mono)",
    fontSize: "0.6875rem",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--trips-ink-tertiary)",
    whiteSpace: "nowrap",
  },
  /** In the header: the bar below 1024px says it instead. */
  header: { marginLeft: "auto", [NARROW]: { display: "none" } },
  /** In the phone and tablet bar, beside the view switch. */
  bar: { flexShrink: 0, marginRight: "0.5rem" },
  status: { display: "inline-flex", alignItems: "center", gap: "0.375rem", minWidth: 0 },
  dot: { flexShrink: 0, width: "0.375rem", height: "0.375rem", borderRadius: "999px", backgroundColor: "var(--trips-ok)" },
  dotBusy: {
    backgroundColor: "var(--brand-fill)",
    animationName: pulse,
    animationDuration: "1.4s",
    animationIterationCount: "infinite",
    [REDUCE]: { animationName: "none" },
  },
  dotWaiting: { backgroundColor: "transparent", boxShadow: "inset 0 0 0 1.5px var(--trips-ink-tertiary)" },
  dotError: { backgroundColor: "var(--trips-danger)" },
  error: { color: "var(--trips-danger)" },
  /** Why, after the word: cut to fit, and only read out on phones (the dock says it in full). */
  detail: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "22rem",
    minWidth: 0,
    textTransform: "none",
    letterSpacing: "0.01em",
    [PHONE]: {
      position: "absolute",
      width: "1px",
      height: "1px",
      margin: "-1px",
      overflow: "hidden",
      clipPath: "inset(50%)",
      whiteSpace: "nowrap",
    },
  },
  retry: {
    position: "relative",
    flexShrink: 0,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    font: "inherit",
    letterSpacing: "inherit",
    textTransform: "inherit",
    color: "var(--brand)",
    fontWeight: 600,
    textDecoration: "underline",
    textUnderlineOffset: "3px",
    cursor: "pointer",
    borderRadius: "4px",
    outline: "none",
    ":focus-visible": { boxShadow: ring },
    ":disabled": { cursor: "default", color: "var(--trips-ink-tertiary)", textDecoration: "none" },
    // A 44 × 44 target around a one-word link.
    "::after": {
      content: '""',
      position: "absolute",
      top: "50%",
      left: "50%",
      width: "max(100% + 1rem, 44px)",
      height: "44px",
      transform: "translate(-50%, -50%)",
    },
  },
})

export const banner = stylex.create({
  root: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "0.25rem 0.75rem",
    paddingBlock: "0.5rem",
    paddingInline: "max(1rem, env(safe-area-inset-left))",
    backgroundColor: "var(--brand-soft)",
    color: "var(--trips-ink)",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "var(--trips-line)",
    fontSize: "0.875rem",
    lineHeight: 1.45,
  },
  empty: { display: "none" },
  text: { flexGrow: 1, flexBasis: "16rem", minWidth: 0, overflowWrap: "anywhere", margin: 0 },
  actions: { display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 },
})
