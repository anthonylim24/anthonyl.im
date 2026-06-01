import { useId } from 'react'
import { MOOD_OPTIONS, type MoodValue } from '@/lib/mood'
import { cn } from '@/lib/utils'

interface MoodPickerProps {
  value: MoodValue | null
  onChange: (value: MoodValue) => void
  /** Visible prompt, e.g. "How do you feel right now?" */
  label: string
  /** Optional helper line under the label. */
  hint?: string
  className?: string
}

/**
 * A 5-point tense → calm state picker. Used to bracket a session (before on the
 * setup screen, after in the summary) so the app can show the user how breathing
 * shifted their state. Built as an accessible radio group with 44px+ targets.
 */
export function MoodPicker({ value, onChange, label, hint, className }: MoodPickerProps) {
  const groupId = useId()

  return (
    <div className={className}>
      <div id={`${groupId}-label`} className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary">
        {label}
      </div>
      {hint ? <p className="mt-1 text-[11px] leading-relaxed text-bw-tertiary">{hint}</p> : null}
      <div
        role="radiogroup"
        aria-labelledby={`${groupId}-label`}
        className="mt-3 grid grid-cols-5 gap-1.5"
      >
        {MOOD_OPTIONS.map((option) => {
          const selected = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={option.label}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex min-h-11 flex-col items-center justify-center gap-1.5 border px-1 py-2 transition-colors duration-200',
                selected
                  ? 'border-bw-accent bg-bw-active text-bw'
                  : 'border-bw-border text-bw-tertiary hover:bg-bw-hover hover:text-bw-secondary',
              )}
            >
              {/* A small bar whose height encodes the calm level — a quiet, wordless scale. */}
              <span
                aria-hidden="true"
                className={cn(
                  'w-1 rounded-full transition-colors duration-200',
                  selected ? 'bg-bw-accent' : 'bg-bw-border',
                )}
                style={{ height: `${6 + option.value * 3}px` }}
              />
              <span className="text-[9px] font-medium uppercase tracking-[0.04em] leading-none">
                {option.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
