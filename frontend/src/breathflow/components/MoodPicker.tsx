import { LayoutGroup } from 'motion/react'
import { MOOD_OPTIONS, type MoodValue } from '@/lib/mood'
import { InkChip } from '../motion/InkChip'

interface MoodPickerProps {
  label: string
  value: MoodValue | undefined
  /** Tapping the selected option again clears it (undefined). */
  onChange: (value: MoodValue | undefined) => void
}

/** Optional 1–5 calm scale: Tense, Unsettled, Neutral, Settled, Calm. */
export function MoodPicker({ label, value, onChange }: MoodPickerProps) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm text-bw-secondary">{label}</legend>
      <LayoutGroup id="mood-picker">
        <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
          {MOOD_OPTIONS.map((option) => {
            const selected = value === option.value
            return (
              <InkChip
                key={option.value}
                active={selected}
                onClick={() => onChange(selected ? undefined : option.value)}
                label={option.label}
                layoutId="mood-ink"
              />
            )
          })}
        </div>
      </LayoutGroup>
    </fieldset>
  )
}
