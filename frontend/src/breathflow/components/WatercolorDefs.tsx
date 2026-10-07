/**
 * SVG filters behind the painted UI, mounted once by the layout:
 *  - bf-wash: ragged edges (fbm displacement), pigment pooled at the edge
 *    (sharpened alpha minus a blur of itself) and granulation.
 *  - bf-ragged: just the deckled edge, for small chips and ink swashes.
 *  - bf-brush: a dry-brush wobble for strokes.
 */
export function WatercolorDefs() {
  return (
    <svg aria-hidden="true" width="0" height="0" focusable="false" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <defs>
        <filter id="bf-wash" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="4" seed="4" result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="22" xChannelSelector="R" yChannelSelector="G" result="ragged" />
          <feGaussianBlur in="ragged" stdDeviation="3" result="soft" />
          <feComposite in="ragged" in2="soft" operator="arithmetic" k2="2.1" k3="-1.1" result="pooled" />
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="9" result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.7 1.15" result="tooth" />
          <feComposite in="pooled" in2="tooth" operator="in" />
        </filter>
        <filter id="bf-ragged" x="-15%" y="-30%" width="130%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" seed="2" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="bf-brush" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="3" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  )
}
