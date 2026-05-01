// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  addLocalDays,
  formatLocalDateKey,
  getLocalDateKey,
  getLocalDayStart,
  getLocalWeekStartKey,
} from '../localDates'

describe('local date helpers', () => {
  it('formats keys from local calendar components', () => {
    expect(formatLocalDateKey(new Date(2026, 4, 1, 23, 30))).toBe('2026-05-01')
    expect(formatLocalDateKey(new Date(2026, 0, 5, 8, 0))).toBe('2026-01-05')
  })

  it('keeps date-only keys on their named local day', () => {
    expect(getLocalDateKey('2026-05-01')).toBe('2026-05-01')
  })

  it('returns null for invalid date input', () => {
    expect(getLocalDateKey('not-a-date')).toBeNull()
  })

  it('calculates local day and week starts without UTC conversion', () => {
    expect(formatLocalDateKey(getLocalDayStart(new Date(2026, 4, 1, 23, 30)))).toBe('2026-05-01')
    expect(formatLocalDateKey(addLocalDays(new Date(2026, 4, 1, 12), -1))).toBe('2026-04-30')
    expect(getLocalWeekStartKey(new Date(2026, 4, 3, 12))).toBe('2026-04-27')
  })
})
