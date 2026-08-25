import { Link } from 'react-router-dom'
import { sx } from '@/lib/utils'
import { formatTripDate } from '../theme'
import { focusRingClass, mutedInkClass, typeHeroTimeClass, wrapAnywhereClass } from '../ui'
import { styles } from '../trips.stylex'
import type { ItineraryItem, TripDay } from '../types'
import { FlipTime } from './FlipTime'

function cityFromZone(timezone: string): string {
  const last = timezone.split('/').pop() ?? timezone
  return last.replace(/_/g, ' ')
}

export function NextDeparture({
  item,
  day,
  timezone,
  to,
  tone = 'sheet',
}: {
  item: ItineraryItem
  day: TripDay
  timezone: string
  to: string
  tone?: 'sheet' | 'band'
}) {
  const time = item.time
  const onBand = tone === 'band'
  return (
    <Link to={to} {...sx('cover-hero', 'group', styles.nextDepartureLink, focusRingClass)}>
      <div {...sx(styles.nextDepartureRow)}>
        {time ? (
          <FlipTime value={time} playOnMount className={typeHeroTimeClass} />
        ) : (
          <span {...sx(styles.nextDepartureFallbackTitle, wrapAnywhereClass)}>
            {formatTripDate(day.date, timezone)}
          </span>
        )}
        <span {...sx('cover-hero-title', styles.nextDepartureItemTitle, wrapAnywhereClass)}>
          {item.title}
        </span>
      </div>
      <p {...sx('cover-extra', onBand ? styles.nextDepartureMetaBand : styles.nextDepartureMeta, mutedInkClass)}>
        {formatTripDate(day.date, timezone)}
        {time ? ` · ${cityFromZone(timezone)}` : ''}
      </p>
    </Link>
  )
}

export function zoneCity(timezone: string): string {
  return cityFromZone(timezone)
}
