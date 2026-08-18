import { ChevronDown } from "lucide-react"
import { TripStatusChip } from "../components/StatusChip"
import type { TripStatus } from "../types"

const TRIP_STATUSES: readonly TripStatus[] = ["draft", "active", "archived", "completed"]

/**
 * Trip status in the header meta line: reads as a status chip, behaves as a
 * native select. The select covers the chip transparently, so it keeps the
 * platform picker and its own accessible name while the visual stays quiet.
 */
export function TripStatusSelect({
  status,
  editable,
  disabled = false,
  onChange,
}: {
  status: TripStatus
  editable: boolean
  disabled?: boolean
  onChange: (status: TripStatus) => void
}) {
  if (!editable) return <TripStatusChip status={status} />

  return (
    <span className="relative -my-3 inline-flex items-center gap-1 rounded-[length:var(--trips-radius)] py-3 pr-1 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[color:var(--trips-focus)]">
      <TripStatusChip status={status} />
      <ChevronDown className="h-3 w-3 shrink-0 text-stone-500 dark:text-stone-400" strokeWidth={1.5} aria-hidden />
      <select
        value={status}
        aria-label="Trip status"
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as TripStatus)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
      >
        {TRIP_STATUSES.map((s) => (
          <option key={s} value={s} className="capitalize">
            {s}
          </option>
        ))}
      </select>
    </span>
  )
}
