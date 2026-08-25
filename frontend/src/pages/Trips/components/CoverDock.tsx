import { sx } from '@/lib/utils'
import { coverDockClass, wrapAnywhereClass } from '../ui'
import { styles } from '../trips.stylex'

/** Condensed title that fades in under chrome. Adds no document height. */
export function CoverDock({
  title,
  measure = 'wide',
}: {
  title: string
  measure?: 'wide' | 'form'
}) {
  return (
    <div {...sx('cover-dock', coverDockClass)} aria-hidden>
      <div
        {...sx(
          styles.coverDockInner,
          measure === 'form' ? styles.coverDockInnerForm : styles.coverDockInnerWide,
        )}
      >
        <p {...sx('cover-dock-title', styles.coverDockTitle, wrapAnywhereClass)}>{title}</p>
      </div>
    </div>
  )
}
