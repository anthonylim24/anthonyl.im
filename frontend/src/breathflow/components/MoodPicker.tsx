import { MOOD_OPTIONS, type MoodValue } from '@/lib/mood'

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
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {MOOD_OPTIONS.map((option) => {
          const selected = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(selected ? undefined : option.value)}
              className={[
                'min-h-11 rounded-lg border px-3.5 text-sm transition-colors duration-200 active:scale-[0.98]',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bw-accent',
                selected
                  ? 'border-bw-accent bg-bw-accent text-bw-accent-foreground font-medium'
                  : 'border-bw-border bg-bw-surface text-bw-secondary hover:bg-bw-hover',
              ].join(' ')}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
