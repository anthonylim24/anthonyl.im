import { memo } from 'react'
import { createPortal } from 'react-dom'
import { withViteBase } from '@/lib/routerBasename'

export const BreathStardust = memo(function BreathStardust() {
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="breath-stardust" aria-hidden="true" data-testid="breath-stardust">
      <img
        src={withViteBase('/breathflow-stardust.webp')}
        alt=""
        className="breath-stardust-media"
      />
    </div>,
    document.body,
  )
})
