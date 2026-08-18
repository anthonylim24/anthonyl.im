import { mutedInkClass, wrapAnywhereClass } from "../ui"

/** Product section title. Not a numbered dossier rule. */
export function SectionHeading({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  return (
    <header className="pb-3">
      <h2 className="text-[15px] font-semibold tracking-tight text-stone-900 dark:text-stone-100">{title}</h2>
      {subtitle && (
        <p className={`mt-1 max-w-[56ch] text-sm leading-relaxed ${mutedInkClass} ${wrapAnywhereClass}`}>{subtitle}</p>
      )}
    </header>
  )
}

/** @deprecated Use SectionHeading. Kept so older imports keep typechecking. */
export const DossierSectionHeader = SectionHeading
