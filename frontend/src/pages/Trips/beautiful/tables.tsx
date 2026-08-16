import type { ReactNode } from "react"
import { accentChipBtnClass, chipBtnClass } from "../ui"
import type { FilterChip } from "./types"

export function FilterTable({
  filters,
  active,
  onFilter,
  children,
  empty,
  label,
}: {
  filters: FilterChip[]
  active: string
  onFilter: (id: string) => void
  children: ReactNode
  empty?: ReactNode
  label: string
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={label}>
        {filters.map((chip) => {
          const selected = chip.id === active
          return (
            <button
              key={chip.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onFilter(chip.id)}
              className={selected ? accentChipBtnClass : chipBtnClass}
            >
              {chip.label}
              <span className="font-mono-trips tabular-nums">{chip.count}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-4">{children ?? empty}</div>
    </div>
  )
}
