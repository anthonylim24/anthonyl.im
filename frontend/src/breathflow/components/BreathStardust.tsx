import { memo } from 'react'
import { createPortal } from 'react-dom'
import { withViteBase } from '@/lib/routerBasename'
import { sx } from '@/styles/merge'

export const BreathStardust = memo(function BreathStardust() {
  if (typeof document === 'undefined') return null

  return createPortal(
    <div {...sx('bf-stardust')} aria-hidden="true" data-testid="breath-stardust">
      <img
        src={withViteBase('/breathflow-stardust.webp')}
        alt=""
        {...sx('bf-stardust-media')}
      />
    </div>,
    document.body,
  )
})
