import type { ReactNode } from 'react'
import { sx } from '@/styles/merge'
import { bf } from '../styles/breathflow.stylex'

export function Notice({
  role = 'status',
  tone = 'accent',
  title,
  children,
  className,
  style,
  live = true,
}: {
  role?: 'status' | 'alert'
  tone?: 'accent' | 'danger'
  title: string
  children?: ReactNode
  className?: string
  style?: Parameters<typeof sx>[0]
  /** Recovery countdowns pass false so each second is not re-announced. */
  live?: boolean
}) {
  return (
    <div
      role={role}
      aria-live={live ? undefined : 'off'}
      {...sx(tone === 'danger' ? bf.noticeDanger : bf.noticeAccent, style ?? className)}
    >
      <p {...sx(bf.breakWords, bf.textSm, bf.fontMedium, bf.textBw)}>{title}</p>
      {children ? (
        <div {...sx(bf.mt1, bf.breakWords, bf.textSm, bf.leadingRelaxed, bf.textSecondary)}>
          {children}
        </div>
      ) : null}
    </div>
  )
}
