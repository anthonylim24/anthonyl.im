// Time-of-day color grade for the Detailed 3D Map. The user always
// sees Seoul-as-it-is-right-now; the canvas picks up a warm/cool tone
// that tracks the actual Asia/Seoul wall clock. Implemented as a CSS
// `filter` chain on the renderer canvas (cheap — composited on the
// GPU compositor, no WebGL pipeline changes).
//
// Returning a single CSS string lets us animate the transition with a
// CSS `transition: filter` and avoids any per-frame work.

export type GradeKind = "night" | "dawn" | "morning" | "midday" | "afternoon" | "dusk" | "evening"

/** Current Asia/Seoul wall-clock hour as a real number in [0, 24). */
export function kstHour(now: Date = new Date()): number {
  // Intl gives us 0–23 hour + the minutes; assemble into a float.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now)
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0)
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0)
  // `hour12: false` returns "24" at midnight on some platforms — normalize.
  return ((h % 24) + m / 60) % 24
}

export function gradeKindAt(hour: number): GradeKind {
  if (hour < 5) return "night"
  if (hour < 6.5) return "dawn"
  if (hour < 10) return "morning"
  if (hour < 16) return "midday"
  if (hour < 18) return "afternoon"
  if (hour < 19.5) return "dusk"
  if (hour < 22) return "evening"
  return "night"
}

/**
 * CSS filter chain for the Detailed-3D canvas at the given KST hour.
 *
 * Tones are deliberately gentle — the Google Photorealistic mesh is
 * already richly textured, so we want a *tint*, not a costume. Limits
 * (rough): brightness ±10%, saturation 0.85–1.05, hue-rotate ≤ ±8°.
 */
export function cssFilterFor(hour: number): string {
  const kind = gradeKindAt(hour)
  switch (kind) {
    case "night":
      // Deep blue, slightly dim + desaturated; the city is asleep.
      return "brightness(0.78) saturate(0.7) hue-rotate(-8deg) contrast(1.05)"
    case "dawn":
      // Warm pink-coral wash, slightly brighter than night.
      return "brightness(0.92) saturate(1.02) hue-rotate(6deg)"
    case "morning":
      // Crisp, slightly cool — almost neutral.
      return "brightness(1.02) saturate(1.0) hue-rotate(-2deg)"
    case "midday":
      // Neutral baseline — Google's mesh as-is.
      return "brightness(1.0) saturate(1.0)"
    case "afternoon":
      // Warmer light as sun lowers.
      return "brightness(1.02) saturate(1.04) hue-rotate(3deg)"
    case "dusk":
      // Golden hour: stronger warm tilt + a hair more saturation.
      return "brightness(0.96) saturate(1.08) hue-rotate(8deg)"
    case "evening":
      // Cool, slightly dim — neon era hasn't taken over yet.
      return "brightness(0.85) saturate(0.92) hue-rotate(-4deg)"
  }
}

/** A slightly dimmer, slightly desaturated variant used during the
 *  arrival fly-in so the city brightens into its final grade as the
 *  camera settles. Composing relative to the final grade keeps the
 *  warm/cool character intact. */
export function arrivalStartFilter(hour: number): string {
  // Compose: drop brightness + saturation further, no extra hue shift.
  // Parsing the existing string is overkill — just append; CSS filter
  // chains multiply.
  return `${cssFilterFor(hour)} brightness(0.55) saturate(0.7)`
}
