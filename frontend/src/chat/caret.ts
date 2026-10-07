let measure: CanvasRenderingContext2D | null | undefined

/**
 * Rough viewport position of a textarea's caret, so Lim's eyes can follow
 * what you type. Measures the current line with the textarea's font and
 * folds soft wraps by the inner width; good enough for a gaze target.
 */
export function caretPoint(el: HTMLTextAreaElement): { x: number; y: number } {
  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  const lines = el.value.slice(0, el.selectionStart ?? el.value.length).split('\n')
  if (measure === undefined) measure = document.createElement('canvas').getContext('2d')
  let width = 0
  if (measure) {
    measure.font = cs.font
    width = measure.measureText(lines[lines.length - 1]).width
  }
  const padL = parseFloat(cs.paddingLeft) || 0
  const padT = parseFloat(cs.paddingTop) || 0
  const inner = Math.max(1, r.width - padL - (parseFloat(cs.paddingRight) || 0))
  const lineH = parseFloat(cs.lineHeight) || 22
  const row = lines.length - 1 + Math.floor(width / inner)
  return {
    x: r.left + padL + (width % inner),
    y: Math.min(r.bottom, r.top + padT + (row + 0.5) * lineH - el.scrollTop),
  }
}
