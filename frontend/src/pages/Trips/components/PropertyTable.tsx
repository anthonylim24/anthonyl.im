import type { ReactNode } from "react"
import { mutedInkClass, propertyRowClass, propertyTableClass, wrapAnywhereClass } from "../ui"

export function PropertyTable({ children }: { children: ReactNode }) {
  return <dl className={propertyTableClass}>{children}</dl>
}

export function PropertyRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={propertyRowClass}>
      <dt className={`text-[13px] font-medium ${mutedInkClass}`}>{label}</dt>
      <dd className={`text-sm text-stone-800 dark:text-stone-200 ${wrapAnywhereClass}`}>{value}</dd>
    </div>
  )
}
