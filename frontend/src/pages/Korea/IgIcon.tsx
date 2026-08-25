import type { StyleXStyles } from '@stylexjs/stylex'
import { sx } from '@/styles/merge'

/**
 * Instagram camera icon as an inline SVG component.
 * Used because lucide-react v1.16 does not include an Instagram icon.
 */
export function IgIcon({
  style,
  'aria-hidden': ariaHidden,
}: {
  style?: StyleXStyles
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
      {...sx(style)}
      aria-hidden={ariaHidden}
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  )
}
