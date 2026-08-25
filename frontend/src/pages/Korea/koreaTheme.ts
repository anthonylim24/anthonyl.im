// Visual constants for the Korea section. Centralized so callout colors,
// status pills, and reservation type icons stay consistent across pages.

import type { StyleXStyles } from '@stylexjs/stylex'
import type { ReservationStatus, ReservationType } from './types'
import { calloutStyles, statusStyles } from './korea.stylex'

export const statusMeta: Record<
  ReservationStatus,
  { label: string; chip: StyleXStyles; dot: StyleXStyles }
> = {
  confirmed: {
    label: 'Confirmed',
    chip: statusStyles.chipConfirmed,
    dot: statusStyles.dotConfirmed,
  },
  tentative: {
    label: 'Tentative',
    chip: statusStyles.chipTentative,
    dot: statusStyles.dotTentative,
  },
  pending: {
    label: 'Book now',
    chip: statusStyles.chipPending,
    dot: statusStyles.dotPending,
  },
}

export const typeMeta: Record<ReservationType, { icon: string; label: string }> = {
  flight: { icon: '✈️', label: 'Flight' },
  hotel: { icon: '🏨', label: 'Hotel' },
  meal: { icon: '🍴', label: 'Meal' },
  bar: { icon: '🍸', label: 'Bar' },
  experience: { icon: '🎟️', label: 'Experience' },
  transit: { icon: '🚄', label: 'Transit' },
  event: { icon: '🎆', label: 'Event' },
  appointment: { icon: '📅', label: 'Appointment' },
  wedding: { icon: '💒', label: 'Wedding' },
}

export const cityMeta: Record<string, { tag: string }> = {
  Seoul: { tag: 'SE' },
  Busan: { tag: 'BU' },
  Yangju: { tag: 'YJ' },
  Incheon: { tag: 'IC' },
}

export function calloutTone(tone: 'info' | 'warn' | 'success' | 'alert'): StyleXStyles {
  switch (tone) {
    case 'info':
      return calloutStyles.info
    case 'warn':
      return calloutStyles.warn
    case 'success':
      return calloutStyles.success
    case 'alert':
      return calloutStyles.alert
  }
}

export function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  const date = new Date(iso + 'T00:00:00+09:00')
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
    ...opts,
  }).format(date)
}

export function daysUntil(iso: string): number {
  const target = new Date(iso + 'T00:00:00+09:00').getTime()
  const now = Date.now()
  return Math.ceil((target - now) / (24 * 60 * 60 * 1000))
}
