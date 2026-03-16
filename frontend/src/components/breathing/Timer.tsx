import { cn } from '@/lib/utils'

interface TimerProps {
  seconds: number
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function Timer({ seconds, className, size = 'lg' }: TimerProps) {
  const sizeStyles = {
    sm: 'text-3xl',
    md: 'text-5xl',
    lg: 'text-6xl md:text-7xl',
  }

  return (
    <div
      role="timer"
      aria-live="off"
      aria-label={`${seconds} seconds remaining`}
      className={cn(
        'font-display font-light tabular-nums tracking-[0.04em] text-foreground',
        sizeStyles[size],
        className
      )}
      style={{ fontFeatureSettings: '"tnum" on' }}
    >
      <span className="opacity-90">{seconds}</span>
      <span className="text-muted-foreground text-[0.4em] ml-1" aria-hidden="true">s</span>
    </div>
  )
}
