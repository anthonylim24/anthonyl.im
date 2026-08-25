import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Check, Lock } from 'lucide-react'
import { CLERK_ENABLED } from '@/lib/clerk'
import {
  buildBreathFlowExportData,
  parseBreathFlowImportData,
  replaceBreathFlowStorageData,
} from '@/lib/dataExport'
import { sx } from '@/styles/merge'
import { layout } from '@/styles/common.stylex'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useHistoryStore } from '@/stores/historyStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { btn } from '../components/buttonStyles.stylex'
import { vibrate } from '../engine/haptics'
import { levelForXP } from '../gamify/levels'
import { ORB_THEMES, resolveOrbTheme } from '../gamify/orbThemes'
import { SAFETY_DISCLOSURE } from '../safety/disclosure'
import { toggleSpring } from '../motion/tokens'
import { useReducedMotion } from '../platform/useReducedMotion'
import { bf } from '../styles/breathflow.stylex'
import { SettingsAccount } from './SettingsAccount'

function Section({ title, children, first = false }: { title: string; children: ReactNode; first?: boolean }) {
  return (
    <section {...sx(first ? bf.sectionFirst : bf.section)}>
      <h2 {...sx(bf.textSm, bf.fontMedium, bf.textBw)}>{title}</h2>
      <div {...sx(bf.mt3)}>{children}</div>
    </section>
  )
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  const reducedMotion = useReducedMotion()

  return (
    <label {...sx(bf.toggleLabel)}>
      <span {...sx(bf.minW0)}>
        <span {...sx(bf.block, bf.textSm, bf.textBw)}>{label}</span>
        {description && <span {...sx(bf.block, bf.textXs, bf.textSecondary)}>{description}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        {...sx(layout.srOnly, 'peer')}
      />
      <span
        aria-hidden="true"
        {...sx(bf.toggleTrack, checked ? bf.toggleTrackOn : bf.toggleTrackOff)}
      >
        <motion.span
          {...sx(bf.toggleThumb)}
          initial={false}
          animate={{ x: checked ? 24 : 4 }}
          transition={reducedMotion ? { duration: 0 } : toggleSpring}
        />
      </span>
    </label>
  )
}

export function SettingsPage() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const soundEnabled = useSettingsStore((s) => s.soundEnabled)
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled)
  const soundVolume = useSettingsStore((s) => s.soundVolume)
  const setSoundVolume = useSettingsStore((s) => s.setSoundVolume)
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled)
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled)

  const xp = useGamificationStore((s) => s.xp)
  const selectedTheme = useGamificationStore((s) => s.selectedTheme)
  const setSelectedTheme = useGamificationStore((s) => s.setSelectedTheme)
  const level = levelForXP(xp)
  const activeOrbTheme = resolveOrbTheme(selectedTheme, level)

  const [importError, setImportError] = useState<string | null>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const confirmClearRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (confirmingClear) confirmClearRef.current?.focus()
  }, [confirmingClear])

  function handleExport() {
    const data = buildBreathFlowExportData(localStorage)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `breathflow-export-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(file: File) {
    setImportError(null)
    try {
      const raw: unknown = JSON.parse(await file.text())
      const data = parseBreathFlowImportData(raw)
      replaceBreathFlowStorageData(localStorage, data)
      window.location.reload()
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'That file is not a BreathFlow export.')
    }
  }

  function handleClearAll() {
    useHistoryStore.getState().clearHistory()
    useGamificationStore.getState().resetProgress()
    useSettingsStore.getState().resetSettings()
    setConfirmingClear(false)
  }

  return (
    <div {...sx(bf.pb8)}>
      <h1 {...sx('bf-display', bf.mb2, bf.text3xl, bf.trackingTight, bf.textBw)}>Settings</h1>

      <Section title="Appearance" first>
        <Toggle
          label="Dark theme"
          description="Light for daytime practice, dark for evening wind-down"
          checked={theme === 'dark'}
          onChange={(dark) => setTheme(dark ? 'dark' : 'light')}
        />

        <p {...sx(bf.mt4, bf.textSm, bf.textBw)}>Orb color</p>
        <p {...sx(bf.textXs, bf.textSecondary)}>New colors unlock as your level grows.</p>
        <div {...sx(bf.mt25, bf.flexWrapGap2)} role="group" aria-label="Orb color">
          {ORB_THEMES.map((orbTheme) => {
            const unlocked = orbTheme.unlockLevel <= level
            const selected = activeOrbTheme.id === orbTheme.id
            return (
              <button
                key={orbTheme.id}
                type="button"
                disabled={!unlocked}
                aria-pressed={selected}
                aria-label={unlocked ? orbTheme.name : `${orbTheme.name}, unlocks at level ${orbTheme.unlockLevel}`}
                title={unlocked ? orbTheme.name : `Unlocks at level ${orbTheme.unlockLevel}`}
                onClick={() => setSelectedTheme(orbTheme.id)}
                {...sx(
                  bf.orbColorBtn,
                  selected && bf.orbColorBtnSelected,
                  !unlocked && bf.opacity45,
                )}
                style={{
                  background: `radial-gradient(circle at 35% 30%, ${orbTheme.colors[1]}, ${orbTheme.colors[0]})`,
                }}
              >
                {selected && (
                  <Check
                    size={16}
                    strokeWidth={2.5}
                    aria-hidden="true"
                    className={sx(bf.textWhite, bf.dropShadow).className}
                  />
                )}
                {!unlocked && (
                  <Lock
                    size={14}
                    strokeWidth={2}
                    aria-hidden="true"
                    className={sx(bf.textWhite, bf.dropShadow).className}
                  />
                )}
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Sound">
        <Toggle label="Guiding tones" description="Soft cues at each phase change" checked={soundEnabled} onChange={setSoundEnabled} />
        <label {...sx(bf.mt3, bf.block)}>
          <span {...sx(bf.volumeLabel)}>
            Volume
            <span {...sx(bf.textXs, bf.tabularNums, bf.textSecondary)}>{Math.round(soundVolume * 100)}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={soundVolume}
            disabled={!soundEnabled}
            onChange={(event) => setSoundVolume(Number(event.target.value))}
            {...sx(bf.rangeInput)}
            aria-label="Sound volume"
          />
        </label>
      </Section>

      <Section title="Haptics">
        <Toggle
          label="Vibration feedback"
          description="A light nudge on controls and milestones"
          checked={hapticsEnabled}
          onChange={(enabled) => {
            setHapticsEnabled(enabled)
            if (enabled) vibrate('light', true)
          }}
        />
      </Section>

      <Section title="Safety">
        <p {...sx(bf.textSm, bf.fontMedium, bf.textBw)}>{SAFETY_DISCLOSURE.title}</p>
        <ul {...sx(bf.mt2, bf.spaceY15)}>
          {SAFETY_DISCLOSURE.points.map((point) => (
            <li key={point} {...sx(bf.textXs, bf.leadingRelaxed, bf.textSecondary)}>{point}</li>
          ))}
        </ul>
      </Section>

      <Section title="Your data">
        <p {...sx(bf.textXs, bf.leadingRelaxed, bf.textSecondary)}>
          Everything lives on this device: history, progress, and settings.
          Export a JSON backup, or restore one.
        </p>
        <div {...sx(bf.mt3, bf.flexWrapGap2)}>
          <button type="button" {...sx(btn.base, btn.secondary)} onClick={handleExport}>
            Export data
          </button>
          <button type="button" {...sx(btn.base, btn.secondary)} onClick={() => fileInputRef.current?.click()}>
            Import data
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            {...sx(layout.srOnly)}
            aria-label="Import BreathFlow data file"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleImport(file)
              event.target.value = ''
            }}
          />
        </div>
        {importError && (
          <p role="alert" {...sx(bf.mt2, bf.textXs, bf.leadingRelaxed, bf.textDestructive)}>
            Import failed: {importError}
          </p>
        )}

        <div {...sx(bf.mt5)}>
          {confirmingClear ? (
            <div {...sx(bf.flexColGap2SmRow)}>
              <p role="status" aria-live="polite" aria-atomic="true" {...sx(bf.flex1, bf.textSm, bf.textSecondary)}>
                Erase history, progress, badges, and settings from this device?
              </p>
              <div {...sx(bf.flexItemsCenterGap2)}>
                <button ref={confirmClearRef} type="button" {...sx(btn.base, btn.destructive)} onClick={handleClearAll}>
                  Erase everything
                </button>
                <button type="button" {...sx(btn.base, btn.secondary)} onClick={() => setConfirmingClear(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" {...sx(btn.base, btn.destructive)} onClick={() => setConfirmingClear(true)}>
              Clear all data
            </button>
          )}
        </div>
      </Section>

      {CLERK_ENABLED && (
        <Section title="Account">
          <SettingsAccount />
        </Section>
      )}
    </div>
  )
}
