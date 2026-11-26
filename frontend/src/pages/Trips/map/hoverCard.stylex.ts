import * as stylex from "@stylexjs/stylex"

const REDUCE = "@media (prefers-reduced-motion: reduce)"

const grow = stylex.keyframes({
  from: { opacity: 0, transform: "scale(0.96)" },
  to: { opacity: 1, transform: "none" },
})

const fade = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
})

export const hoverCard = stylex.create({
  card: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 6,
    width: "16rem",
    maxWidth: "calc(100% - 16px)",
    overflow: "hidden",
    backgroundColor: "var(--trips-raised)",
    color: "var(--trips-ink)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--trips-line)",
    borderRadius: "var(--trips-radius)",
    boxShadow: "var(--trips-shadow-2)",
    animationName: { default: grow, [REDUCE]: fade },
    animationDuration: { default: "140ms", [REDUCE]: "100ms" },
    animationTimingFunction: "var(--trips-ease-out)",
    animationFillMode: "both",
  },
})
