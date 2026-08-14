import { motion } from 'motion/react'
import { Check } from 'lucide-react'
import { pressSpring } from '../motion/tokens'
import { useReducedMotion } from '../platform/useReducedMotion'
import type { BreathingProtocol } from '../protocols/types'

interface SafetyChecklistProps {
  protocol: BreathingProtocol
  checkedItems: ReadonlySet<number>
  onToggle: (index: number) => void
}

/**
 * Advanced-protocol gate: the safety notice, contraindications, and a
 * checklist that must be fully acknowledged before Start enables.
 */
export function SafetyChecklist({ protocol, checkedItems, onToggle }: SafetyChecklistProps) {
  const checklist = protocol.safetyChecklist ?? []
  const reducedMotion = useReducedMotion()
  if (checklist.length === 0) return null

  return (
    <section aria-label="Safety check" className="bg-bw-accent-subtle px-4 py-3">
      <h3 className="text-sm font-semibold text-bw">Safety check</h3>
      {protocol.safetyNotice && (
        <p className="mt-1.5 text-sm leading-relaxed text-bw-secondary">{protocol.safetyNotice}</p>
      )}

      {protocol.contraindications && protocol.contraindications.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-bw-secondary">Not for you today if any of these apply:</p>
          <ul className="mt-1.5 space-y-1">
            {protocol.contraindications.map((item) => (
              <li key={item} className="flex gap-2 text-xs leading-relaxed text-bw-secondary">
                <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-bw-tertiary" />
                <span className="break-words">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 space-y-1" role="group" aria-label="Acknowledgement">
        {checklist.map((item, index) => {
          const checked = checkedItems.has(index)
          return (
            <label
              key={item}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1.5 py-1 transition-colors duration-150 hover:bg-bw-hover"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(index)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={[
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors duration-150',
                  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-bw-accent',
                  checked ? 'border-bw-accent bg-bw-accent text-bw-accent-foreground' : 'border-bw-border bg-bw-surface',
                ].join(' ')}
              >
                {checked ? (
                  <motion.span
                    initial={reducedMotion ? false : { scale: 0.55, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={pressSpring}
                    className="flex"
                  >
                    <Check size={13} strokeWidth={2.5} />
                  </motion.span>
                ) : null}
              </span>
              <span className="min-w-0 break-words text-sm leading-snug text-bw">{item}</span>
            </label>
          )
        })}
      </div>
    </section>
  )
}
