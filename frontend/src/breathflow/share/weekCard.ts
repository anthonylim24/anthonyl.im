import type { WeekDay } from '../gamify/patterns'
import type { Pigment } from '../pigments'

/** What the shareable card says about the last seven days. */
export interface WeekCard {
  minutes: number
  activeDays: number
  streak: number
  level: number
  levelTitle: string
  /** Oldest first, ending today. */
  days: readonly WeekDay[]
  /** The week's most practised technique, if any. */
  technique: string | null
  pigment: Pigment
  night: boolean
}

export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630
const DISPLAY = '"Fraunces", ui-serif, Georgia, serif'
const TEXT = '"Geist", ui-sans-serif, system-ui, sans-serif'

/** The card's lines, apart from the drawing (also its alt text). */
export function weekCardLines(card: WeekCard): { headline: string; detail: string } {
  const headline = `${card.minutes} ${card.minutes === 1 ? 'minute' : 'minutes'} of breathing`
  const parts = [
    `${card.activeDays} of 7 days`,
    card.streak > 0 ? `${card.streak}-day streak` : null,
    `Level ${card.level} · ${card.levelTitle}`,
  ].filter(Boolean)
  return { headline, detail: parts.join('   ·   ') }
}

function wash(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r)
  // Dilute in the middle, pigment pooled at the tide line, then a ragged-soft edge.
  g.addColorStop(0, `${colour}99`)
  g.addColorStop(0.86, `${colour}B3`)
  g.addColorStop(0.93, colour)
  g.addColorStop(1, `${colour}00`)
  ctx.globalAlpha = alpha
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
}

/** Paint the card: paper, two washes of the week's pigment, the week in words and seven dabs. */
export function drawWeekCard(ctx: CanvasRenderingContext2D, card: WeekCard) {
  const paper = card.night ? '#15161C' : '#F7F1E6'
  const ink = card.night ? '#EDE6DA' : '#27231F'
  const soft = card.night ? 'rgba(237, 230, 218, 0.66)' : 'rgba(39, 35, 31, 0.62)'
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
  ctx.globalCompositeOperation = card.night ? 'screen' : 'multiply'
  wash(ctx, 980, 170, 330, card.pigment.glaze, card.night ? 0.3 : 0.34)
  wash(ctx, 1060, 420, 250, card.pigment.mass, card.night ? 0.34 : 0.3)
  wash(ctx, 780, 560, 150, card.pigment.glaze, 0.2)
  ctx.globalCompositeOperation = 'source-over'

  const { headline, detail } = weekCardLines(card)
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = soft
  ctx.font = `500 24px ${TEXT}`
  ctx.fillText('BREATHFLOW  ·  THE LAST SEVEN DAYS', 80, 110)

  ctx.fillStyle = ink
  ctx.font = `400 168px ${DISPLAY}`
  ctx.fillText(String(card.minutes), 72, 300)
  const numberWidth = ctx.measureText(String(card.minutes)).width
  ctx.font = `400 56px ${DISPLAY}`
  ctx.fillText(headline.slice(String(card.minutes).length + 1), 72 + numberWidth + 28, 300)

  ctx.fillStyle = soft
  ctx.font = `400 30px ${TEXT}`
  ctx.fillText(detail, 80, 372)
  if (card.technique) ctx.fillText(`Mostly ${card.technique}`, 80, 418)

  // Seven days: a loaded dab for a day with practice, a pencil ring for a day without.
  const top = Math.max(1, ...card.days.map((day) => day.minutes))
  card.days.forEach((day, i) => {
    const x = 112 + i * 92
    const y = 510
    if (day.minutes > 0) {
      ctx.globalAlpha = 0.5 + 0.45 * (day.minutes / top)
      ctx.fillStyle = card.night ? card.pigment.glaze : card.pigment.mass
      ctx.beginPath()
      ctx.ellipse(x, y, 31, 28, (i % 3) * 0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    } else {
      ctx.strokeStyle = soft
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, 27, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.fillStyle = soft
    ctx.font = `500 22px ${TEXT}`
    ctx.textAlign = 'center'
    ctx.fillText(day.label, x, 580)
    ctx.textAlign = 'left'
  })

  ctx.fillStyle = soft
  ctx.font = `400 24px ${TEXT}`
  ctx.textAlign = 'right'
  ctx.fillText('anthonyl.im/breathwork', CARD_WIDTH - 80, 580)
  ctx.textAlign = 'left'
}

export type ShareOutcome = 'shared' | 'saved' | 'cancelled' | 'failed'

const FILE_NAME = 'breathflow-week.png'

/**
 * Render the card and hand it to the system share sheet where files can be
 * shared (phones); otherwise save it as a PNG. Never throws.
 */
export async function shareWeekCard(card: WeekCard): Promise<ShareOutcome> {
  try {
    // The page's fonts are already loaded; this only waits for the display sizes used here.
    await Promise.all([document.fonts.load(`400 168px ${DISPLAY}`), document.fonts.load(`500 24px ${TEXT}`)]).catch(() => undefined)
    const canvas = document.createElement('canvas')
    canvas.width = CARD_WIDTH
    canvas.height = CARD_HEIGHT
    const ctx = canvas.getContext('2d')
    if (!ctx) return 'failed'
    drawWeekCard(ctx, card)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return 'failed'

    const file = new File([blob], FILE_NAME, { type: 'image/png' })
    const { headline } = weekCardLines(card)
    if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'My week on BreathFlow', text: `${headline} this week.` })
        return 'shared'
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
        // Fall through and save the file instead.
      }
    }
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = FILE_NAME
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return 'saved'
  } catch {
    return 'failed'
  }
}
