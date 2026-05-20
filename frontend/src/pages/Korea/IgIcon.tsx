/**
 * Instagram camera icon as an inline SVG component.
 * Used because lucide-react v1.16 does not include an Instagram icon.
 * Matches lucide's style: 24×24 viewport, 2px stroke, round caps/joins, no fill.
 */
export function IgIcon({
  className,
  'aria-hidden': ariaHidden,
}: {
  className?: string
  'aria-hidden'?: boolean
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={ariaHidden}
    >
      {/* Rounded rectangle body */}
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      {/* Centre circle */}
      <circle cx="12" cy="12" r="4" />
      {/* Top-right dot */}
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  )
}
