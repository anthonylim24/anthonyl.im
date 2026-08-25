import { useEffect, useState } from 'react'
import { sx } from '@/lib/utils'
import { DateStrip } from '../components/DateStrip'
import type { TripDay } from '../types'
import { snapRailStickyClass } from '../ui'
import { dayIdsFrom, daysKey } from './hooks'

function useActiveDay(key: string): string | null {
  const [active, setActive] = useState<string | null>(() => dayIdsFrom(key)[0] ?? null)

  useEffect(() => {
    const dayIds = dayIdsFrom(key)
    if (dayIds.length === 0) return
    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        const first = dayIds.find((id) => visible.has(id))
        if (first) setActive(first)
      },
      { rootMargin: '-120px 0px -55% 0px', threshold: 0 },
    )
    for (const id of dayIds) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [key])

  return active
}

export function DayNavigation({ days, timezone }: { days: TripDay[]; timezone: string }) {
  const active = useActiveDay(daysKey(days))

  if (days.length < 2) return null

  return (
    <div {...sx('snap-rail-sticky', snapRailStickyClass)}>
      <DateStrip days={days} timezone={timezone} activeId={active} hrefFor={(day) => `#${day.id}`} />
    </div>
  )
}
