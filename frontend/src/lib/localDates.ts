const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function toLocalDate(input: Date | string | number): Date {
  if (input instanceof Date) {
    return new Date(input)
  }

  if (typeof input === 'string') {
    const dateOnlyMatch = DATE_KEY_PATTERN.exec(input)
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch
      return new Date(Number(year), Number(month) - 1, Number(day))
    }
  }

  return new Date(input)
}

export function formatLocalDateKey(date: Date): string {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join('-')
}

export function getLocalDateKey(input: Date | string | number): string | null {
  const date = toLocalDate(input)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return formatLocalDateKey(date)
}

export function getLocalDayStart(input: Date | string | number = new Date()): Date {
  const date = toLocalDate(input)
  if (Number.isNaN(date.getTime())) {
    return date
  }

  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addLocalDays(date: Date, days: number): Date {
  const nextDate = getLocalDayStart(date)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

export function getLocalWeekStartKey(input: Date | string | number = new Date()): string {
  const monday = getLocalDayStart(input)
  const day = monday.getDay()
  const diff = day === 0 ? -6 : 1 - day
  monday.setDate(monday.getDate() + diff)
  return formatLocalDateKey(monday)
}
