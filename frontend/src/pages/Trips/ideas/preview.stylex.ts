import * as stylex from "@stylexjs/stylex"

// Set like a chart's legend entry. The frame is `map/hoverCard.stylex.ts`.

const REDUCE = "@media (prefers-reduced-motion: reduce)"

export const pv = stylex.create({
  // The photo's room: a grid row, so giving it back eases the card shut instead of jumping.
  room: {
    display: "grid",
    gridTemplateRows: "1fr",
    transitionProperty: "grid-template-rows, opacity",
    transitionDuration: { default: "220ms", [REDUCE]: "0ms" },
    transitionTimingFunction: "var(--trips-ease-out)",
  },
  roomGone: { gridTemplateRows: "0fr", opacity: 0 },
  frame: {
    position: "relative",
    aspectRatio: "2 / 1",
    width: "100%",
    minHeight: 0,
    backgroundColor: "var(--trips-sunken)",
    overflow: "hidden",
  },
  img: { display: "block", width: "100%", height: "100%", objectFit: "cover" },
  // On the photo, not under it: the card is the same height before and after the photo lands.
  credit: {
    position: "absolute",
    insetInline: 0,
    bottom: 0,
    margin: 0,
    paddingInline: "0.875rem",
    paddingTop: "1rem",
    paddingBottom: "0.25rem",
    fontSize: "0.6875rem",
    lineHeight: 1.4,
    color: "#fff",
    backgroundImage: "linear-gradient(to bottom, transparent, rgb(0 0 0 / 0.6))",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    paddingInline: "0.875rem",
    paddingTop: "0.625rem",
    paddingBottom: "0.75rem",
  },
  eyebrow: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    minWidth: 0,
  },
  // The wishlist's colour ties the card to its heart pin; the words stay ink.
  mark: { flexShrink: 0, color: "var(--trips-wish)" },
  eyebrowText: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 },
  name: {
    fontSize: "1.25rem",
    lineHeight: 1.1,
    // Korean names break between words, not inside them.
    wordBreak: "keep-all",
    overflowWrap: "anywhere",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  street: {
    margin: 0,
    fontSize: "0.8125rem",
    lineHeight: 1.4,
    color: "var(--trips-ink-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  names: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.125rem" },
  foldName: {
    fontSize: "0.875rem",
    lineHeight: 1.35,
    color: "var(--trips-ink)",
    wordBreak: "keep-all",
    overflowWrap: "anywhere",
  },
  foldMore: { fontSize: "0.8125rem", lineHeight: 1.4, color: "var(--trips-ink-secondary)" },
  note: {
    margin: 0,
    fontSize: "0.8125rem",
    lineHeight: 1.45,
    color: "var(--trips-ink-secondary)",
    overflowWrap: "anywhere",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
})
