import type { ReactNode } from 'react'

export function Notice({
  role = 'status',
  tone = 'accent',
  title,
  children,
  className = '',
  live = true,
}: {
  role?: 'status' | 'alert'
  tone?: 'accent' | 'danger'
  title: string
  children?: ReactNode
  className?: string
  /** Recovery countdowns pass false so each second is not re-announced. */
  live?: boolean
}) {
  const toneClass = tone === 'danger' ? 'bg-bw-destructive-subtle' : 'bg-bw-accent-subtle'

  return (
    <div
      role={role}
      aria-live={live ? undefined : 'off'}
      className={`${toneClass} px-4 py-3 ${className}`.trim()}
    >
      <p className="break-words wrap-anywhere text-sm font-medium text-bw">{title}</p>
      {children ? (
        <div className="mt-1 break-words wrap-anywhere text-sm leading-relaxed text-bw-secondary">
          {children}
        </div>
      ) : null}
    </div>
  )
}
