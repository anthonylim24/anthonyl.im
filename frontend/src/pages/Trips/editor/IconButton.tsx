import type { ReactNode } from "react"
import { dangerIconBtnClass, iconBtnClass } from "../ui"

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
      className={destructive ? dangerIconBtnClass : iconBtnClass}
    >
      {children}
    </button>
  )
}
