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
 * Dramatic preset. The grade is deliberately cinematic — viewers should
 * feel the difference between dusk and night at a glance. Midday stays
 * near neutral so the trip's daytime use case looks honest.
 *
 * Limits (rough): brightness 0.55–1.05, saturation 0.55–1.18,
 * hue-rotate ±18°, contrast up to 1.18, sepia up to 0.18.
 */
export function cssFilterFor(hour: number): string {
  const kind = gradeKindAt(hour)
  switch (kind) {
    case "night":
      // Cinema-blue, deep — Seoul-after-midnight from above.
      return "brightness(0.55) saturate(0.65) hue-rotate(-18deg) contrast(1.18)"
    case "dawn":
      // Coral / sodium-pink wash with a hint of sepia warmth.
      return "brightness(0.88) saturate(1.12) hue-rotate(12deg) sepia(0.12) contrast(1.04)"
    case "morning":
      // Crisp, slightly cool with bright highlights — the city wakes up.
      return "brightness(1.05) saturate(1.06) hue-rotate(-4deg) contrast(1.03)"
    case "midday":
      // Honest baseline — Google's mesh as-is, with a faint contrast lift.
      return "brightness(1.0) saturate(1.02) contrast(1.02)"
    case "afternoon":
      // Warmer light as the sun lowers; subtle golden cast.
      return "brightness(1.04) saturate(1.1) hue-rotate(6deg) sepia(0.06)"
    case "dusk":
      // Full golden hour — strong warm tilt + sepia + saturation push.
      return "brightness(0.94) saturate(1.18) hue-rotate(16deg) sepia(0.18) contrast(1.05)"
    case "evening":
      // Cool dim — the neon hour hasn't fully arrived; melancholic blue.
      return "brightness(0.72) saturate(0.85) hue-rotate(-12deg) contrast(1.1)"
  }
}

/** Atmospheric fog parameters for the Detailed-3D scene at the given
 *  KST hour. Returns a hex color string + an exponential-fog density.
 *
 *  Densities are tuned for the trip's typical viewing distance (Seoul
 *  origin → 5–10 km of tiles). Cool tones for night/evening, warm for
 *  dawn/dusk, near-neutral for midday so the city reads honestly.
 *
 *  See CLAUDE.md "Korea-specific Principles" — fog should feel like
 *  real atmosphere, not like a fog-of-war game effect. The values
 *  below keep buildings >2 km readable while letting horizon haze
 *  layer in the warm/cool character of the hour. */
export function fogForHour(hour: number): { color: string; density: number } {
  // Densities tuned so:
  //   - buildings ≤ 1 km: essentially clear
  //   - mid-distance 5 km: subtle haze (~5% fog factor)
  //   - far 15 km: noticeable haze (~30% fog factor)
  //   - max camera distance 80 km: fog dominates but doesn't reach 100%
  //
  // Previous values (2.8e-5 → 6.0e-5) were 3× too high — at the
  // 80 km max OrbitControls radius they pushed the entire viewport
  // to ~99% fog, painting it the fog color (gray at midday). The
  // user's "completely gray" report on prod was this exact failure
  // mode triggering whenever they zoomed out far.
  const kind = gradeKindAt(hour)
  switch (kind) {
    case "night":
      return { color: "#0e1a2e", density: 2.0e-5 }
    case "dawn":
      return { color: "#f3b6a0", density: 1.8e-5 }
    case "morning":
      return { color: "#cfd9e3", density: 1.2e-5 }
    case "midday":
      return { color: "#b9c4d2", density: 0.9e-5 }
    case "afternoon":
      return { color: "#e8b878", density: 1.4e-5 }
    case "dusk":
      return { color: "#d68a4a", density: 1.6e-5 }
    case "evening":
      return { color: "#3a4a66", density: 1.8e-5 }
  }
}

/** Sky/background color for the given KST hour. Used as the renderer's
 *  clear color so any unwritten pixels read as sky, NOT as the fog
 *  color. (Setting clearColor = fogColor caused the "completely gray
 *  screen" bug — when buildings hadn't loaded yet or the camera was
 *  zoomed out far enough to fog them out, the whole viewport showed
 *  the gray fog tint instead of a proper sky.) */
export function skyForHour(hour: number): string {
  const kind = gradeKindAt(hour)
  switch (kind) {
    case "night": return "#1a2540"        // deep navy with a hint of indigo
    case "dawn": return "#ffb89a"          // peach-coral sunrise
    case "morning": return "#9ec7e8"       // bright cool blue
    case "midday": return "#7fb2e0"        // saturated sky blue
    case "afternoon": return "#a3c4dc"     // warm-tinted blue
    case "dusk": return "#ff8e5a"          // golden-coral sunset
    case "evening": return "#4a5d80"       // dusky mauve-blue
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
