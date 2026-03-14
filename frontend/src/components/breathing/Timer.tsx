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
      aria-live="polite"
      aria-atomic="true"
      aria-label={`${seconds} seconds remaining`}
      className={cn(
        'font-mono tabular-nums font-bold tracking-tight text-foreground',
        sizeStyles[size],
        className
      )}
      style={{ fontFeatureSettings: '"tnum" on' }}
    >
      <span className="opacity-90">{seconds}</span>
      <span className="text-muted-foreground text-[0.4em] ml-1">s</span>
    </div>
  )
}
