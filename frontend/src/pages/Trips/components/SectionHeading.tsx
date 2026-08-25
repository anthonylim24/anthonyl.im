import { sx } from '@/lib/utils'
import { mutedInkClass, typeSectionClass } from '../ui'
import { styles } from '../trips.stylex'

/** Timetable section title. Not a numbered dossier rule. */
export function SectionHeading({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  return (
    <header {...sx(styles.sectionHeading)}>
      <h2 {...sx(typeSectionClass)}>{title}</h2>
      {subtitle ? <p {...sx(styles.sectionSubtitle, mutedInkClass)}>{subtitle}</p> : null}
    </header>
  )
}

/** @deprecated Use SectionHeading. Kept so older imports keep typechecking. */
export const DossierSectionHeader = SectionHeading
