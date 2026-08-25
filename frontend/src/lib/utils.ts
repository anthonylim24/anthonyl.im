import { clsx, type ClassValue } from 'clsx'

export { sx, stylex } from '@/styles/merge'
export type { ClassValue }

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

/** @deprecated Use sx() from @/styles/merge for StyleX styles + semantic classes. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}
