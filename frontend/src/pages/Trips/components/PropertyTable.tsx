import { sx } from '@/lib/utils'
import { propertyRowClass, propertyTableClass, wrapAnywhereClass } from '../ui'
import { styles } from '../trips.stylex'
import type { ReactNode } from 'react'

export function PropertyTable({ children }: { children: ReactNode }) {
  return <dl {...sx(propertyTableClass)}>{children}</dl>
}

export function PropertyRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div {...sx(propertyRowClass)}>
      <dt {...sx(styles.propertyLabel)}>{label}</dt>
      <dd {...sx(styles.propertyValue, wrapAnywhereClass)}>{value}</dd>
    </div>
  )
}
