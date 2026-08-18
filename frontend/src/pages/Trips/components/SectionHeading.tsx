import { mutedInkClass, typeSectionClass, wrapAnywhereClass } from "../ui"

/** Timetable section title. Not a numbered dossier rule. */
export function SectionHeading({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  return (
    <header className="pb-3">
      <h2 className={typeSectionClass}>{title}</h2>
      {subtitle && (
        <p className={`mt-1 max-w-[56ch] text-[0.9375rem] leading-relaxed ${mutedInkClass} ${wrapAnywhereClass}`}>{subtitle}</p>
      )}
    </header>
  )
}

/** @deprecated Use SectionHeading. Kept so older imports keep typechecking. */
export const DossierSectionHeader = SectionHeading
