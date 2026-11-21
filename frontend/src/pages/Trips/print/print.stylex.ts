import * as stylex from "@stylexjs/stylex"

// The printed itinerary: ink on white paper. Sizes are in points because
// this is set for a page, not a screen. Colours come from the print palette
// that `PrintItinerary` pins on its root (light atlas inks, white paper), so
// the app's dark theme never reaches the paper. No fills but the pins.

const REDUCE = "@media (prefers-reduced-motion: reduce)"
const WIDE = "@media (min-width: 1024px)"

const hairline = {
  borderTopWidth: "1px",
  borderTopStyle: "solid",
  borderTopColor: "var(--trips-line)",
} as const

const frame = {
  display: "block",
  width: "100%",
  overflow: "hidden",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "var(--trips-line)",
  borderRadius: "3pt",
} as const

const slideUp = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(12px)" },
  to: { opacity: 1, transform: "none" },
})

export const p = stylex.create({
  root: {
    color: "var(--trips-ink)",
    backgroundColor: "var(--trips-canvas)",
    fontSize: "9.5pt",
    lineHeight: 1.45,
  },

  // ── Cover ─────────────────────────────────────────────
  cover: { display: "block" },
  coverTitle: {
    fontSize: "44pt",
    lineHeight: 1.02,
    marginTop: "10pt",
    // Korean breaks between words, not syllables; anything too long still wraps.
    wordBreak: "keep-all",
    overflowWrap: "anywhere",
  },
  coverDates: {
    marginTop: "12pt",
    fontFamily: "var(--trips-mono)",
    fontSize: "10pt",
    letterSpacing: "0.02em",
    color: "var(--trips-ink-secondary)",
  },
  coverPlaces: { marginTop: "3pt", fontSize: "11pt", color: "var(--trips-ink)", overflowWrap: "anywhere" },
  coverDescription: {
    marginTop: "12pt",
    maxWidth: "64ch",
    fontSize: "10pt",
    color: "var(--trips-ink-secondary)",
    textWrap: "pretty",
    whiteSpace: "pre-line",
    display: "-webkit-box",
    WebkitLineClamp: 5,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  coverMap: { ...frame, marginTop: "18pt", aspectRatio: "3 / 2" },
  coverFoot: {
    ...hairline,
    display: "flex",
    justifyContent: "space-between",
    gap: "12pt",
    marginTop: "10pt",
    paddingTop: "6pt",
    fontFamily: "var(--trips-mono)",
    fontSize: "8pt",
    letterSpacing: "0.02em",
    color: "var(--trips-ink-tertiary)",
  },

  // ── Maps ──────────────────────────────────────────────
  still: { display: "block", width: "100%", height: "100%", objectFit: "cover" },

  // ── Day ───────────────────────────────────────────────
  day: { display: "block" },
  dayEmpty: { display: "block", breakInside: "avoid" },
  newPage: { breakBefore: "page" },
  // Sharing a page with the day before it: a rule between them.
  joined: { marginTop: "16pt", paddingTop: "10pt", ...hairline },
  dayLine: { display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", columnGap: "12pt" },
  dayTitleSmall: { marginTop: "2pt", fontSize: "15pt", lineHeight: 1.1, wordBreak: "keep-all", overflowWrap: "anywhere" },
  dayHeading: { marginTop: "4pt", fontSize: "26pt", lineHeight: 1.05, wordBreak: "keep-all", overflowWrap: "anywhere" },
  dayMeta: { marginTop: "6pt", fontSize: "8.5pt", color: "var(--trips-ink-tertiary)" },
  dayNotes: {
    marginTop: "8pt",
    maxWidth: "70ch",
    fontSize: "9pt",
    color: "var(--trips-ink-secondary)",
    whiteSpace: "pre-line",
    display: "-webkit-box",
    WebkitLineClamp: 6,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  callouts: { marginTop: "8pt", display: "flex", flexDirection: "column", gap: "3pt", listStyle: "none", padding: 0 },
  callout: {
    paddingLeft: "7pt",
    borderLeftWidth: "2px",
    borderLeftStyle: "solid",
    borderLeftColor: "var(--trips-line-strong)",
    fontSize: "8.5pt",
    color: "var(--trips-ink-secondary)",
  },
  dayMap: { ...frame, marginTop: "12pt", aspectRatio: "2 / 1", breakInside: "avoid" },
  empty: { fontSize: "8.5pt", fontStyle: "italic", color: "var(--trips-ink-tertiary)" },

  // ── Stops ─────────────────────────────────────────────
  list: { marginTop: "10pt", listStyle: "none", padding: 0 },
  listParked: { marginTop: 0 },
  stop: {
    ...hairline,
    display: "grid",
    gridTemplateColumns: "48pt 16pt minmax(0, 1fr)",
    columnGap: "8pt",
    paddingBlock: "6pt",
    breakInside: "avoid",
  },
  time: {
    display: "flex",
    flexDirection: "column",
    fontFamily: "var(--trips-mono)",
    fontSize: "8.5pt",
    lineHeight: 1.5,
    letterSpacing: "0.01em",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    color: "var(--trips-ink)",
  },
  timeEnd: { color: "var(--trips-ink-tertiary)" },
  marker: { display: "flex", justifyContent: "center", paddingTop: "1pt" },
  pin: {
    display: "grid",
    placeItems: "center",
    width: "14pt",
    height: "14pt",
    borderRadius: "999px",
    backgroundColor: "var(--ta-fill)",
    color: "var(--ta-on)",
    fontSize: "7pt",
    fontWeight: 600,
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
  },
  // Not on the route: an open ring, like the "To schedule" pins in 3D.
  ring: {
    width: "7pt",
    height: "7pt",
    marginTop: "3.5pt",
    borderRadius: "999px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--trips-ink-tertiary)",
  },
  dash: { marginTop: "-1pt", color: "var(--trips-ink-faint)", fontSize: "9pt" },
  body: { minWidth: 0 },
  title: { fontSize: "10.5pt", fontWeight: 600, lineHeight: 1.3, color: "var(--trips-ink)", overflowWrap: "anywhere" },
  noteTitle: { fontWeight: 400, fontStyle: "italic", color: "var(--trips-ink-secondary)" },
  facts: { marginTop: "1pt", fontSize: "8.5pt", color: "var(--trips-ink-secondary)", overflowWrap: "anywhere" },
  conf: { fontFamily: "var(--trips-mono)", fontSize: "8pt", letterSpacing: "0.03em", color: "var(--trips-ink)" },
  address: { marginTop: "1pt", fontSize: "8.5pt", color: "var(--trips-ink-tertiary)", overflowWrap: "anywhere" },
  notes: {
    marginTop: "3pt",
    fontSize: "8.5pt",
    color: "var(--trips-ink-secondary)",
    whiteSpace: "pre-line",
    overflowWrap: "anywhere",
    display: "-webkit-box",
    WebkitLineClamp: 4,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  leg: {
    marginTop: "3pt",
    fontFamily: "var(--trips-mono)",
    fontSize: "7.5pt",
    letterSpacing: "0.02em",
    color: "var(--trips-ink-tertiary)",
  },
  section: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "8pt",
    marginTop: "12pt",
    paddingBottom: "3pt",
    breakAfter: "avoid",
  },

  // ── Bookings ──────────────────────────────────────────
  bookings: { display: "block", breakBefore: "page" },
  bookingsHeading: { marginTop: "4pt", fontSize: "26pt", lineHeight: 1.05 },
  booking: {
    ...hairline,
    display: "grid",
    gridTemplateColumns: "72pt minmax(0, 1fr) auto",
    columnGap: "10pt",
    paddingBlock: "7pt",
    breakInside: "avoid",
  },
  bookingWhen: {
    display: "flex",
    flexDirection: "column",
    fontFamily: "var(--trips-mono)",
    fontSize: "8pt",
    lineHeight: 1.5,
    letterSpacing: "0.02em",
    color: "var(--trips-ink-secondary)",
    whiteSpace: "nowrap",
  },
  bookingConf: {
    fontFamily: "var(--trips-mono)",
    fontSize: "9pt",
    letterSpacing: "0.04em",
    color: "var(--trips-ink)",
    textAlign: "right",
    overflowWrap: "anywhere",
    maxWidth: "120pt",
  },

  // ── On screen while the printout is prepared ─────────
  // Same place and material as the workspace's undo notice.
  status: {
    position: "fixed",
    left: { default: "50%", [WIDE]: "1.75rem" },
    translate: { default: "-50% 0", [WIDE]: "0 0" },
    bottom: { default: "calc(4.75rem + env(safe-area-inset-bottom))", [WIDE]: "1.25rem" },
    zIndex: 46,
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    maxWidth: "calc(100vw - 2rem)",
    padding: "0.375rem 0.375rem 0.375rem 1rem",
    borderRadius: "999px",
    backgroundColor: "var(--trips-ink)",
    color: "var(--trips-canvas)",
    fontSize: "0.875rem",
    lineHeight: 1.45,
    boxShadow: "var(--trips-shadow-3)",
    animationName: slideUp,
    animationDuration: "260ms",
    animationTimingFunction: "var(--trips-ease-out)",
    [REDUCE]: { animationName: "none" },
  },
  statusCount: {
    fontFamily: "var(--trips-mono)",
    fontSize: "0.75rem",
    fontVariantNumeric: "tabular-nums",
    opacity: 0.7,
  },
  statusBtn: {
    position: "relative",
    flexShrink: 0,
    minHeight: "2.25rem",
    paddingInline: "0.875rem",
    borderRadius: "999px",
    backgroundColor: "color-mix(in srgb, var(--trips-canvas) 16%, transparent)",
    color: "inherit",
    fontSize: "0.8125rem",
    fontWeight: 600,
    cursor: "pointer",
    outline: "none",
    ":focus-visible": { boxShadow: "0 0 0 2px var(--trips-ink), 0 0 0 4px var(--brand-ring)" },
    // Looks 36px tall; the band makes the target 44px.
    "::after": { content: '""', position: "absolute", inset: "-4px 0" },
  },
})
