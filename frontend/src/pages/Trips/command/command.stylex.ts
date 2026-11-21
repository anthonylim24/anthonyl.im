import * as stylex from "@stylexjs/stylex"

// The command palette, its header trigger and the shortcuts sheet. Compose
// after the atlas primitives: `sx(a.fieldBare, cmd.input)`.

const PHONE = "@media (max-width: 639.98px)"
const DESKTOP = "@media (min-width: 640px)"
// Motion is opted into, not opted out of, so the two queries never compete.
const DESKTOP_MOTION = "@media (min-width: 640px) and (prefers-reduced-motion: no-preference)"
const PHONE_MOTION = "@media (max-width: 639.98px) and (prefers-reduced-motion: no-preference)"

const arrive = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(-6px) scale(0.985)" },
  to: { opacity: 1, transform: "none" },
})

const drop = stylex.keyframes({
  from: { transform: "translateY(-100%)" },
  to: { transform: "none" },
})

export const cmd = stylex.create({
  // ── Palette ───────────────────────────────────────────
  // A raised paper card high on the page; a top sheet on phones, so the
  // keyboard below never covers the results.
  panel: {
    position: "fixed",
    zIndex: 81,
    display: "flex",
    flexDirection: "column",
    backgroundColor: "var(--trips-raised)",
    color: "var(--trips-ink)",
    boxShadow: "var(--trips-shadow-3)",
    overflow: "hidden",
    outline: "none",
    top: { default: "max(1rem, 12vh)", [PHONE]: 0 },
    left: { default: "50%", [PHONE]: 0 },
    right: { default: "auto", [PHONE]: 0 },
    translate: { default: "-50% 0", [PHONE]: "none" },
    width: { default: "min(40rem, calc(100vw - 2rem))", [PHONE]: "100%" },
    maxHeight: { default: "min(34rem, calc(100dvh - max(1rem, 12vh) - 1rem))", [PHONE]: "min(82dvh, 36rem)" },
    paddingTop: { default: 0, [PHONE]: "env(safe-area-inset-top)" },
    borderTopLeftRadius: { default: "var(--trips-radius-lg)", [PHONE]: 0 },
    borderTopRightRadius: { default: "var(--trips-radius-lg)", [PHONE]: 0 },
    borderBottomLeftRadius: "var(--trips-radius-lg)",
    borderBottomRightRadius: "var(--trips-radius-lg)",
    transformOrigin: "top center",
    animationName: { default: "none", [DESKTOP_MOTION]: arrive, [PHONE_MOTION]: drop },
    animationDuration: { default: "180ms", [PHONE]: "260ms" },
    animationTimingFunction: "var(--trips-ease-out)",
  },
  inputRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.625rem",
    flexShrink: 0,
    minHeight: "3.5rem",
    paddingInlineStart: "1rem",
    paddingInlineEnd: "0.5rem",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "var(--trips-line)",
  },
  searchIcon: { flexShrink: 0, color: "var(--trips-ink-tertiary)" },
  // Phones have no Esc key; desktop closes with Esc or a click outside.
  closePhone: { display: { default: "none", [PHONE]: "inline-grid" } },
  // Phones keep 16 px (index.css pins it) so iOS does not zoom.
  input: {
    minHeight: "2.75rem",
    fontSize: { default: "1rem", [DESKTOP]: "1.0625rem" },
  },
  list: {
    flexGrow: 1,
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    padding: "0.375rem",
    scrollPaddingBlock: "0.375rem",
  },
  group: { display: "flex", flexDirection: "column" },
  groupRuled: {
    marginTop: "0.375rem",
    paddingTop: "0.375rem",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "var(--trips-line)",
  },
  groupLabel: {
    paddingInline: "0.75rem",
    paddingTop: "0.5rem",
    paddingBottom: "0.375rem",
  },
  option: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    minHeight: "2.75rem",
    paddingInline: "0.75rem",
    paddingBlock: "0.375rem",
    borderRadius: "0.625rem",
    color: "var(--trips-ink)",
    cursor: "pointer",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
  },
  optionActive: {
    backgroundColor: "var(--trips-sunken)",
    boxShadow: "inset 0 0 0 1px var(--brand-ring)",
    outline: { default: "none", "@media (forced-colors: active)": "2px solid Highlight" },
    outlineOffset: "-2px",
  },
  optionDisabled: { opacity: 0.45, cursor: "not-allowed" },
  optionIcon: {
    display: "inline-grid",
    placeItems: "center",
    flexShrink: 0,
    width: "1.25rem",
    color: "var(--trips-ink-tertiary)",
  },
  optionIconActive: { color: "var(--trips-ink)" },
  optionText: {
    display: "flex",
    alignItems: "baseline",
    gap: "0.5rem",
    flexGrow: 1,
    minWidth: 0,
  },
  // A long name truncates first; the subtitle is short data ("Day 2 · 10:00")
  // and keeps its room, up to a cap.
  optionTitle: { fontSize: "0.9375rem", fontWeight: 500, lineHeight: 1.35, flexShrink: 1 },
  optionSubtitle: { fontSize: "0.8125rem", lineHeight: 1.35, color: "var(--trips-ink-tertiary)", flexShrink: 0, maxWidth: "45%" },
  empty: {
    paddingInline: "1.5rem",
    paddingBlock: "2.5rem",
    textAlign: "center",
    fontSize: "0.9375rem",
    color: "var(--trips-ink-secondary)",
  },
  // Phones rarely have a keyboard to press them with.
  optionKeys: { display: { default: "inline-flex", [PHONE]: "none" }, flexShrink: 0 },
  emptyQuery: { color: "var(--trips-ink)" },
  footer: {
    display: { default: "flex", [PHONE]: "none" },
    alignItems: "center",
    gap: "1rem",
    flexShrink: 0,
    paddingInline: "1rem",
    paddingBlock: "0.625rem",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "var(--trips-line)",
    fontFamily: "var(--trips-mono)",
    fontSize: "0.6875rem",
    letterSpacing: "0.04em",
    color: "var(--trips-ink-tertiary)",
  },

  // ── Keys ──────────────────────────────────────────────
  keys: { display: "inline-flex", alignItems: "center", gap: "0.25rem", flexShrink: 0 },
  kbd: {
    display: "inline-grid",
    placeItems: "center",
    minWidth: "1.375rem",
    height: "1.375rem",
    paddingInline: "0.3125rem",
    borderRadius: "0.375rem",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--trips-line-strong)",
    backgroundColor: "var(--trips-surface)",
    boxShadow: "inset 0 -1px 0 var(--trips-line)",
    fontFamily: "var(--trips-mono)",
    fontSize: "0.6875rem",
    lineHeight: 1,
    color: "var(--trips-ink-secondary)",
    whiteSpace: "nowrap",
  },

  // ── Header trigger ────────────────────────────────────
  trigger: {
    paddingInline: { default: "0.75rem", [PHONE]: 0 },
    width: { default: "auto", [PHONE]: "2.75rem" },
  },
  triggerWide: { display: { default: "inline-flex", [PHONE]: "none" }, alignItems: "center", gap: "0.5rem" },

  // ── Shortcuts sheet ───────────────────────────────────
  sheetGrid: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 1fr)", [DESKTOP]: "repeat(2, minmax(0, 1fr))" },
    columnGap: "1.75rem",
    rowGap: "1.5rem",
  },
  section: { display: "flex", flexDirection: "column", minWidth: 0 },
  sectionTitle: { marginBottom: "0.25rem" },
  rows: { margin: 0, display: "flex", flexDirection: "column" },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1rem",
    minHeight: "2.5rem",
    paddingBlock: "0.375rem",
    borderBottomWidth: { default: "1px", ":last-child": 0 },
    borderBottomStyle: "solid",
    borderBottomColor: "var(--trips-line)",
  },
  rowLabel: { margin: 0, fontSize: "0.9375rem", lineHeight: 1.4, color: "var(--trips-ink-secondary)", minWidth: 0 },
  rowKeys: { margin: 0, flexShrink: 0 },
})
