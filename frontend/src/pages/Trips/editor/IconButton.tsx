import type { ReactNode } from 'react'
import { sx } from '@/lib/utils'
import { styles } from '../trips.stylex'
import { dangerIconBtnClass, iconBtnClass } from '../ui'

/** 44x44 icon action with its label carried by `title` + `aria-label`. */
export function IconButton({
  label,
  onClick,
  disabled,
  destructive,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      {...sx(destructive ? dangerIconBtnClass : iconBtnClass)}
    >
      {children}
    </button>
  )
}
