import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Check, Lock } from 'lucide-react'
import { CLERK_ENABLED } from '@/lib/clerk'
import {
  buildBreathFlowExportData,
  parseBreathFlowImportData,
  replaceBreathFlowStorageData,
} from '@/lib/dataExport'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useHistoryStore } from '@/stores/historyStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { btnDestructive, btnSecondary } from '../components/buttonStyles'
import { vibrate } from '../engine/haptics'
import { levelForXP } from '../gamify/levels'
import { ORB_THEMES, resolveOrbTheme } from '../gamify/orbThemes'
import { SAFETY_DISCLOSURE } from '../safety/disclosure'
import { toggleSpring } from '../motion/tokens'
import { useReducedMotion } from '../platform/useReducedMotion'
import { SettingsAccount } from './SettingsAccount'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-bw-border py-5 first:border-t-0">
      <h2 className="text-sm font-medium text-bw">{title}</h2>
      <div className="mt-3">{children}</div>
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
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 py-1">
      <span className="min-w-0">
        <span className="block text-sm text-bw">{label}</span>
        {description && <span className="block text-xs text-bw-secondary">{description}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={[
          'relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-bw-accent',
          checked ? 'bg-bw-accent' : 'bg-bw-faint',
        ].join(' ')}
      >
        <motion.span
          className="absolute top-1 left-0 h-5 w-5 rounded-full bg-bw-surface shadow-sm"
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
    <div className="pb-8">
      <h1 className="bf-display mb-2 text-3xl tracking-tight text-bw">Settings</h1>

      <Section title="Appearance">
        <Toggle
          label="Dark theme"
          description="Light for daytime practice, dark for evening wind-down"
          checked={theme === 'dark'}
          onChange={(dark) => setTheme(dark ? 'dark' : 'light')}
        />

        <p className="mt-4 text-sm text-bw">Orb color</p>
        <p className="text-xs text-bw-secondary">New colors unlock as your level grows.</p>
        <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label="Orb color">
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
                className={[
                  'relative flex h-11 w-11 items-center justify-center rounded-lg transition-transform duration-150 active:scale-95 motion-reduce:active:scale-100',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bw-accent',
                  selected ? 'ring-2 ring-bw-accent ring-offset-2 ring-offset-bw-canvas' : '',
                  !unlocked ? 'opacity-45' : '',
                ].join(' ')}
                style={{
                  background: `radial-gradient(circle at 35% 30%, ${orbTheme.colors[1]}, ${orbTheme.colors[0]})`,
                }}
              >
                {selected && <Check size={16} strokeWidth={2.5} aria-hidden="true" className="text-white drop-shadow" />}
                {!unlocked && <Lock size={14} strokeWidth={2} aria-hidden="true" className="text-white drop-shadow" />}
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Sound">
        <Toggle label="Guiding tones" description="Soft cues at each phase change" checked={soundEnabled} onChange={setSoundEnabled} />
        <label className="mt-3 block">
          <span className="flex items-baseline justify-between text-sm text-bw">
            Volume
            <span className="text-xs tabular-nums text-bw-secondary">{Math.round(soundVolume * 100)}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={soundVolume}
            disabled={!soundEnabled}
            onChange={(event) => setSoundVolume(Number(event.target.value))}
            className="mt-2 h-11 w-full accent-[var(--bw-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bw-accent disabled:opacity-40"
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
            if (enabled) vibrate('light', true) // preview nudge
          }}
        />
      </Section>

      <Section title="Safety">
        <p className="text-sm font-medium text-bw">{SAFETY_DISCLOSURE.title}</p>
        <ul className="mt-2 space-y-1.5">
          {SAFETY_DISCLOSURE.points.map((point) => (
            <li key={point} className="text-xs leading-relaxed text-bw-secondary">{point}</li>
          ))}
        </ul>
      </Section>

      <Section title="Your data">
        <p className="text-xs leading-relaxed text-bw-secondary">
          Everything lives on this device: history, progress, and settings.
          Export a JSON backup, or restore one.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={btnSecondary} onClick={handleExport}>
            Export data
          </button>
          <button type="button" className={btnSecondary} onClick={() => fileInputRef.current?.click()}>
            Import data
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Import BreathFlow data file"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleImport(file)
              event.target.value = ''
            }}
          />
        </div>
        {importError && (
          <p role="alert" className="mt-2 text-xs leading-relaxed text-bw-destructive">
            Import failed: {importError}
          </p>
        )}

        <div className="mt-5">
          {confirmingClear ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p role="status" aria-live="polite" aria-atomic="true" className="flex-1 text-sm text-bw-secondary">
                Erase history, progress, badges, and settings from this device?
              </p>
              <div className="flex gap-2">
                <button ref={confirmClearRef} type="button" className={btnDestructive} onClick={handleClearAll}>
                  Erase everything
                </button>
                <button type="button" className={btnSecondary} onClick={() => setConfirmingClear(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className={btnDestructive} onClick={() => setConfirmingClear(true)}>
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
