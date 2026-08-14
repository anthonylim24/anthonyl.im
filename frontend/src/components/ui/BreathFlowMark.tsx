import { withViteBase } from '@/lib/routerBasename'
import { cn } from '@/lib/utils'

interface BreathFlowMarkProps {
  size?: number
  className?: string
}

export function BreathFlowMark({ size = 28, className }: BreathFlowMarkProps) {
  return (
    <img
      src={withViteBase('/breathflow-mark.png')}
      alt=""
      width={size}
      height={size}
      decoding="async"
      className={cn('shrink-0 object-contain', className)}
    />
  )
}
