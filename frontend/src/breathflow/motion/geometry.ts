export function boxPoint(
  progress: number,
  size = 240,
  inset = 10,
): { x: number; y: number } {
  const span = size - 2 * inset
  const p = Math.min(4, Math.max(0, progress))
  if (p <= 1) return { x: inset, y: size - inset - span * p }
  if (p <= 2) return { x: inset + span * (p - 1), y: inset }
  if (p <= 3) return { x: size - inset, y: inset + span * (p - 2) }
  return { x: size - inset - span * (p - 3), y: size - inset }
}

function tideWavePoints(fill: number, width: number, height: number): { x: number; y: number }[] {
  const clamped = Math.min(0.9, Math.max(0.12, fill))
  const y = height * (1 - clamped)
  const amp = 5
  const steps = 16
  const points: { x: number; y: number }[] = []
  for (let i = 0; i <= steps; i += 1) {
    const x = (width * i) / steps
    const wave = Math.sin((i / steps) * Math.PI * 2) * amp
    points.push({ x, y: y + wave })
  }
  return points
}

export function buildTideCrest(fill: number, width = 240, height = 240): string {
  const points = tideWavePoints(fill, width, height)
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ')
}

export function buildTidePath(fill: number, width = 240, height = 240): string {
  const crest = buildTideCrest(fill, width, height)
  return `M 0 ${height} L ${crest.slice(2)} L ${width} ${height} Z`
}
