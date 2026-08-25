import { motion } from 'motion/react'
import { Check } from 'lucide-react'
import { sx } from '@/styles/merge'
import { layout } from '@/styles/common.stylex'
import { pressSpring } from '../motion/tokens'
import { useReducedMotion } from '../platform/useReducedMotion'
import type { BreathingProtocol } from '../protocols/types'
import { bf } from '../styles/breathflow.stylex'

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
    <section aria-label="Safety check" {...sx(bf.bgAccentSubtle, bf.px4, bf.py3)}>
      <h3 {...sx(bf.textSm, bf.fontSemibold, bf.textBw)}>Safety check</h3>
      {protocol.safetyNotice && (
        <p {...sx(bf.mt15, bf.textSm, bf.leadingRelaxed, bf.textSecondary)}>{protocol.safetyNotice}</p>
      )}

      {protocol.contraindications && protocol.contraindications.length > 0 && (
        <div {...sx(bf.mt3)}>
          <p {...sx(bf.textXs, bf.fontMedium, bf.textSecondary)}>Not for you today if any of these apply:</p>
          <ul {...sx(bf.mt15, bf.spaceY1)}>
            {protocol.contraindications.map((item) => (
              <li key={item} {...sx(bf.contraindicationRow)}>
                <span aria-hidden="true" {...sx(bf.bulletDot)} />
                <span {...sx(bf.breakWords)}>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div {...sx(bf.mt4, bf.spaceY1)} role="group" aria-label="Acknowledgement">
        {checklist.map((item, index) => {
          const checked = checkedItems.has(index)
          return (
            <label
              key={item}
              {...sx(bf.safetyLabel)}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(index)}
                {...sx(layout.srOnly, 'peer')}
              />
              <span
                aria-hidden="true"
                {...sx(
                  bf.checkboxBox,
                  checked ? bf.checkboxBoxChecked : bf.checkboxBoxUnchecked,
                )}
              >
                {checked ? (
                  <motion.span
                    initial={reducedMotion ? false : { scale: 0.55, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={pressSpring}
                    {...sx(bf.inlineFlex)}
                  >
                    <Check size={13} strokeWidth={2.5} />
                  </motion.span>
                ) : null}
              </span>
              <span {...sx(bf.minW0, bf.breakWords, bf.textSm, bf.leadingSnug, bf.textBw)}>{item}</span>
            </label>
          )
        })}
      </div>
    </section>
  )
}
