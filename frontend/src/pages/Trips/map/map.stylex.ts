import * as stylex from "@stylexjs/stylex"

const pulse = stylex.keyframes({
  "0%": { opacity: 0.45 },
  "50%": { opacity: 0.9 },
  "100%": { opacity: 0.45 },
})

export const mapStyles = stylex.create({
  root: {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    backgroundColor: "var(--trips-sunken)",
    isolation: "isolate",
  },
  rootAmbient: { backgroundColor: "transparent", overflow: "visible" },
  // Limb shading over the globe (the map draws a flat disc in light mode):
  // a soft terminator bottom-right and a contact shadow underneath.
  shade: {
    position: "absolute",
    inset: "5%",
    borderRadius: "999px",
    pointerEvents: "none",
    backgroundImage:
      "radial-gradient(circle at 34% 28%, rgb(255 255 255 / 0.22), transparent 42%), radial-gradient(circle at 50% 50%, transparent 58%, rgb(20 23 26 / 0.16) 100%)",
    boxShadow: "0 2.5rem 3.5rem -2rem rgb(20 23 26 / 0.35)",
  },
  canvas: {
    position: "absolute",
    inset: 0,
    opacity: 0,
    transitionProperty: "opacity",
    transitionDuration: "700ms",
    transitionTimingFunction: "var(--trips-ease-out)",
  },
  canvasReady: { opacity: 1 },
  chart: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  },
  chartLoading: {
    animationName: pulse,
    animationDuration: "2.4s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
    "@media (prefers-reduced-motion: reduce)": { animationName: "none" },
  },
  chartRule: { stroke: "var(--trips-line)", strokeWidth: 1, vectorEffect: "non-scaling-stroke" },
  chartRoute: {
    fill: "none",
    stroke: "var(--ta-fill)",
    strokeWidth: 1.5,
    strokeDasharray: "1 5",
    strokeLinecap: "round",
    vectorEffect: "non-scaling-stroke",
  },
  chartDot: { fill: "var(--ta-fill)", stroke: "var(--trips-raised)", strokeWidth: 1.5 },
  controls: {
    position: "absolute",
    top: "0.75rem",
    right: "0.75rem",
    zIndex: 4,
    display: "flex",
    flexDirection: "column",
    padding: "0.25rem",
    borderRadius: "0.875rem",
    backgroundColor: "color-mix(in srgb, var(--trips-raised) 92%, transparent)",
    boxShadow: "var(--trips-shadow-2)",
    backdropFilter: "blur(10px)",
  },
  control: {
    display: "grid",
    placeItems: "center",
    width: "2.25rem",
    height: "2.25rem",
    borderRadius: "0.625rem",
    color: "var(--trips-ink-secondary)",
    backgroundColor: { default: "transparent", ":hover": "var(--trips-sunken)" },
    cursor: "pointer",
    position: "relative",
    transitionProperty: "background-color, color",
    transitionDuration: "140ms",
    outline: { default: "none", ":focus-visible": "2px solid var(--brand-ring)" },
    outlineOffset: "1px",
    "::after": { content: '""', position: "absolute", inset: "-4px" },
  },
  controlOn: { color: "var(--ta)" },
  controlRule: {
    height: "1px",
    marginBlock: "0.25rem",
    marginInline: "0.375rem",
    backgroundColor: "var(--trips-line)",
  },
})
