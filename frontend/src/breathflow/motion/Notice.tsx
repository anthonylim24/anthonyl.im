import type { ReactNode } from 'react'

export function Notice({
  role = 'status',
  tone = 'accent',
  title,
  children,
  className = '',
}: {
  role?: 'status' | 'alert'
  tone?: 'accent' | 'danger'
  title: string
  children?: ReactNode
  className?: string
}) {
  const toneClass = tone === 'danger' ? 'bg-bw-destructive-subtle' : 'bg-bw-accent-subtle'

  return (
    <div role={role} className={`${toneClass} px-4 py-3 ${className}`.trim()}>
      <p className="text-sm font-medium text-bw">{title}</p>
      {children ? (
        <div className="mt-1 text-sm leading-relaxed text-bw-secondary">{children}</div>
      ) : null}
    </div>
  )
}
