import { projectToBox } from "../map/geo"
import { ACCENT_FILL } from "../meta"
import { formatTravelled, recapLine, type Recap } from "./recapModel"

// The recap as a picture to send: a 1200 × 630 sheet of atlas paper, the
// trip's name set like a map title, its figures, what was loved, and an
// engraved chart of where it went in the trip's accent. Drawn on a canvas,
// then handed to the share sheet or saved, as BreathFlow's week card is.

export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630

// The atlas faces (`--trips-display`, `--trips-mono` and the body in index.css).
const DISPLAY = '"Instrument Serif", "Cormorant Garamond", "Iowan Old Style", Georgia, serif'
const MONO = '"Fragment Mono", ui-monospace, "SF Mono", Menlo, monospace'
const SANS = '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif'

// Light atlas inks: the card is paper whatever the theme.
const PAPER = "#faf9f6"
const INK = "#14171a"
const INK_2 = "#4d5259"
const INK_3 = "#696e75"
const LINE = "rgba(20, 23, 26, 0.16)"

const LEFT = 80
const TEXT_WIDTH = 600
const CHART = { x: 748, y: 64, w: 388, h: 502 }

export interface CardFigure {
  value: string
  label: string
}

/** What the card says, apart from the chart (also what the tests read; canvas has no text to query). */
export function recapCardLines(recap: Recap): { eyebrow: string; name: string; figures: CardFigure[]; loved: string | null; cities: string | null } {
  const figures: CardFigure[] = [
    { value: String(recap.days), label: recap.over ? (recap.days === 1 ? "day" : "days") : `of ${recap.totalDays} days` },
    { value: String(recap.places), label: recap.places === 1 ? "place" : "places" },
  ]
  if (recap.cities.length > 0) figures.push({ value: String(recap.cities.length), label: recap.cities.length === 1 ? "city" : "cities" })
  if (recap.distance >= 1000) {
    const [value, unit] = formatTravelled(recap.distance).split(" ")
    figures.push({ value: `≈${value}`, label: unit ?? "km" })
  }
  return {
    eyebrow: `Trip recap · ${recap.dates}`.toUpperCase(),
    name: recap.name,
    figures,
    loved: recap.loved.length > 0 ? recap.loved.map((stop) => stop.title).join("  ·  ") : null,
    cities: recap.cities.length > 0 ? recap.cities.join("  ·  ") : null,
  }
}

/** `text`, shortened with an ellipsis to fit `max` pixels in the current font, never splitting a character. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  const chars = Array.from(text)
  let lo = 0
  let hi = chars.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (ctx.measureText(`${chars.slice(0, mid).join("").trimEnd()}…`).width <= max) lo = mid
    else hi = mid - 1
  }
  return `${chars.slice(0, lo).join("").trimEnd()}…`
}

function tracked(ctx: CanvasRenderingContext2D, spacing: string) {
  // Letter spacing for the mono eyebrows where the canvas supports it.
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = spacing
}

/** The engraved chart: a slice of graticule, the route as a fine line, the places as accent dots. */
function drawChart(ctx: CanvasRenderingContext2D, recap: Recap) {
  const { x, y, w, h } = CHART
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 18)
  ctx.clip()
  ctx.fillStyle = "#f1f0eb"
  ctx.fillRect(x, y, w, h)

  ctx.strokeStyle = LINE
  ctx.lineWidth = 1
  const cx = x + w * 0.42
  const cy = y + h * 1.85
  for (let i = 0; i < 6; i++) {
    const r = h * 1.15 + i * 62
    ctx.beginPath()
    ctx.arc(cx, cy, r, Math.PI, Math.PI * 2)
    ctx.stroke()
  }
  for (let i = -4; i <= 4; i++) {
    const spread = i * 58
    ctx.beginPath()
    ctx.moveTo(cx + spread * 0.25, y - 10)
    ctx.quadraticCurveTo(cx + spread * 1.4, y + h * 0.5, cx + spread * 2.2, y + h + 10)
    ctx.stroke()
  }

  const plotted = projectToBox(recap.points, w, h, 56).map((p) => ({ x: x + p.x, y: y + p.y }))
  const fill = ACCENT_FILL[recap.accent]
  if (plotted.length > 1) {
    ctx.strokeStyle = INK_2
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 2
    ctx.lineJoin = "round"
    ctx.beginPath()
    plotted.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  for (const p of plotted) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = PAPER
    ctx.stroke()
  }
  ctx.restore()

  ctx.strokeStyle = LINE
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 18)
  ctx.stroke()
}

/** Paint the card. */
export function drawRecapCard(ctx: CanvasRenderingContext2D, recap: Recap) {
  const lines = recapCardLines(recap)
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
  ctx.strokeStyle = LINE
  ctx.lineWidth = 1
  ctx.strokeRect(28.5, 28.5, CARD_WIDTH - 57, CARD_HEIGHT - 57)

  drawChart(ctx, recap)

  ctx.textBaseline = "alphabetic"
  ctx.textAlign = "left"
  tracked(ctx, "3px")
  ctx.fillStyle = INK_3
  ctx.font = `400 20px ${MONO}`
  ctx.fillText(fit(ctx, lines.eyebrow, TEXT_WIDTH), LEFT, 120)
  tracked(ctx, "0px")

  // The name as a map title: as large as fits, down to 64 px, then shortened.
  ctx.fillStyle = INK
  let size = 92
  ctx.font = `400 ${size}px ${DISPLAY}`
  while (size > 64 && ctx.measureText(lines.name).width > TEXT_WIDTH) {
    size -= 4
    ctx.font = `400 ${size}px ${DISPLAY}`
  }
  ctx.fillText(fit(ctx, lines.name, TEXT_WIDTH), LEFT - 4, 222)

  // Figures: serif numerals over mono labels, hairlines between.
  let x = LEFT
  lines.figures.forEach((figure, i) => {
    if (i > 0) {
      ctx.strokeStyle = LINE
      ctx.beginPath()
      ctx.moveTo(x - 28.5, 306)
      ctx.lineTo(x - 28.5, 402)
      ctx.stroke()
    }
    ctx.fillStyle = INK
    ctx.font = `400 72px ${DISPLAY}`
    ctx.fillText(figure.value, x, 366)
    const valueWidth = ctx.measureText(figure.value).width
    ctx.fillStyle = INK_3
    tracked(ctx, "2px")
    ctx.font = `400 17px ${MONO}`
    const label = figure.label.toUpperCase()
    ctx.fillText(label, x, 400)
    const labelWidth = ctx.measureText(label).width
    tracked(ctx, "0px")
    x += Math.max(valueWidth, labelWidth) + 56
  })

  let y = 476
  if (lines.loved) {
    ctx.fillStyle = INK_3
    tracked(ctx, "3px")
    ctx.font = `400 17px ${MONO}`
    ctx.fillText("LOVED", LEFT, y)
    tracked(ctx, "0px")
    ctx.fillStyle = INK_2
    ctx.font = `italic 400 32px ${DISPLAY}`
    ctx.fillText(fit(ctx, lines.loved, TEXT_WIDTH), LEFT, y + 40)
    y += 92
  }
  if (lines.cities) {
    ctx.fillStyle = INK_3
    ctx.font = `400 22px ${SANS}`
    ctx.fillText(fit(ctx, lines.cities, TEXT_WIDTH), LEFT, Math.min(y, 566))
  }
}

export type ShareOutcome = "shared" | "saved" | "cancelled" | "failed"

/** "winter-in-korea-recap.png"; any script survives, only what a file name can't hold goes. */
export function recapFileName(name: string): string {
  const slug = name
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\\/:*?"<>|#%&{}$!'@+`=\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return `${slug || "trip"}-recap.png`
}

/**
 * Draw the card and hand it to the system share sheet where files can be
 * shared (phones); otherwise save it as a PNG. Never throws.
 */
export async function shareRecapCard(recap: Recap): Promise<ShareOutcome> {
  try {
    await Promise.all([document.fonts.load(`400 92px ${DISPLAY}`), document.fonts.load(`400 20px ${MONO}`)]).catch(() => undefined)
    const canvas = document.createElement("canvas")
    canvas.width = CARD_WIDTH
    canvas.height = CARD_HEIGHT
    const ctx = canvas.getContext("2d")
    if (!ctx) return "failed"
    drawRecapCard(ctx, recap)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
    if (!blob) return "failed"

    const fileName = recapFileName(recap.name)
    const file = new File([blob], fileName, { type: "image/png" })
    if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: recap.name, text: `${recap.name}: ${recapLine(recap)}` })
        return "shared"
      } catch (error) {
        // `name`, not `instanceof DOMException`: the error may come from another realm.
        if ((error as { name?: unknown } | null)?.name === "AbortError") return "cancelled"
        // Fall through and save the file instead.
      }
    }
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return "saved"
  } catch {
    return "failed"
  }
}
