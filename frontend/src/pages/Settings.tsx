import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { motion } from 'motion/react'
import { SignedIn, SignedOut, SignInButton, useUser } from '@clerk/clerk-react'
import { CLERK_ENABLED } from '@/lib/clerk'
import {
  Download,
  Upload,
  Trash2,
  Check,
  Sun,
  Moon,
  Cloud,
  Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settingsStore'
import { useHaptics } from '@/hooks/useHaptics'
import { useHistoryStore } from '@/stores/historyStore'
import { useEntranceMotion } from '@/lib/motionPresets'
import { useGamificationStore } from '@/stores/gamificationStore'
import { DEFAULT_ORB_THEME_ID, getLevelForXP, getUnlockedThemes, ORB_THEMES } from '@/lib/gamification'
import {
  buildBreathFlowExportData,
  parseBreathFlowImportData,
  replaceBreathFlowStorageData,
} from '@/lib/dataExport'
import { BREATHFLOW_STORAGE_KEYS } from '@/lib/constants'
import { formatLocalDateKey } from '@/lib/localDates'

const IMPORT_STATUS_STORAGE_KEY = 'breathflow-import-status'

interface SettingsSwitchProps {
  checked: boolean
  label: string
  onClick: () => void
}

function SettingsSwitch({ checked, label, onClick }: SettingsSwitchProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-checked={checked}
      role="switch"
      className="inline-flex h-11 w-14 items-center justify-center"
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300',
          checked ? 'bg-bw-accent' : 'border border-bw-border'
        )}
      >
        <span
          className={cn(
            'absolute left-1 top-1 h-5 w-5 transform rounded-full shadow-sm transition-transform duration-300',
            checked ? 'translate-x-5 bg-bw-canvas' : 'translate-x-0 bg-bw-tertiary'
          )}
        />
      </span>
    </button>
  )
}

function AccountInfo() {
  const { user } = useUser()
  if (!user) return null

  return (
    <div className="flex items-center gap-4">
      <img
        src={user.imageUrl}
        alt={user.fullName ?? 'Profile'}
        loading="lazy"
        className="h-10 w-10 ring-1 ring-bw-border"
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-bw truncate">
          {user.fullName}
        </p>
        <p className="text-[10px] text-bw-tertiary truncate">
          {user.primaryEmailAddress?.emailAddress}
        </p>
      </div>
      <div className="flex items-center gap-1.5 px-2.5 py-1 border border-bw-border">
        <div className="h-1 w-1 animate-pulse bg-bw-tertiary" />
        <span className="text-[10px] font-medium text-bw-secondary">Synced</span>
      </div>
    </div>
  )
}

function consumePendingImportStatus() {
  if (typeof window === 'undefined') {
    return null
  }

  const message = window.sessionStorage.getItem(IMPORT_STATUS_STORAGE_KEY)
  if (message) {
    window.sessionStorage.removeItem(IMPORT_STATUS_STORAGE_KEY)
  }
  return message
}

export function Settings() {
  const { stagger, fadeUp, transition: motionTransition, tap } = useEntranceMotion()
  const {
    theme,
    setTheme,
    soundEnabled,
    setSoundEnabled,
    soundVolume,
    setSoundVolume,
    hapticsEnabled,
    setHapticsEnabled,
    resetSettings,
  } = useSettingsStore()
  const { xp, selectedTheme, setSelectedTheme, resetProgress } = useGamificationStore()
  const level = getLevelForXP(xp)
  const unlockedThemeIds = useMemo(
    () => new Set(getUnlockedThemes(level).map((orbTheme) => orbTheme.id)),
    [level]
  )
  const effectiveSelectedTheme = unlockedThemeIds.has(selectedTheme)
    ? selectedTheme
    : DEFAULT_ORB_THEME_ID

  const { clearHistory } = useHistoryStore()

  const { trigger: haptic } = useHaptics()
  const [confirmClear, setConfirmClear] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [dataStatus, setDataStatus] = useState<string | null>(consumePendingImportStatus)
  const importInputRef = useRef<HTMLInputElement>(null)

  const handleExportData = () => {
    setImportError(null)
    setDataStatus('Export started. Your browser will save a BreathFlow JSON backup.')
    const data = buildBreathFlowExportData(localStorage)
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `breathflow-data-${formatLocalDateKey(new Date())}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportData = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return

    try {
      const fileText = await file.text()
      let rawData: unknown
      try {
        rawData = JSON.parse(fileText) as unknown
      } catch {
        throw new Error('Import file must be valid JSON.')
      }
      const data = parseBreathFlowImportData(rawData)

      replaceBreathFlowStorageData(localStorage, data)

      const statusMessage = 'Data import complete. BreathFlow restored your backup.'
      window.sessionStorage.setItem(IMPORT_STATUS_STORAGE_KEY, statusMessage)
      setDataStatus('Import complete. Reloading BreathFlow.')
      haptic('success')
      window.location.reload()
    } catch (error) {
      haptic('error')
      setDataStatus(null)
      setImportError(error instanceof Error ? error.message : 'Could not import this file.')
    } finally {
      input.value = ''
    }
  }

  const handleClearData = () => {
    setImportError(null)
    if (!confirmClear) {
      haptic('error')
      setConfirmClear(true)
      setDataStatus(
        'Clear all data requires confirmation. Press clear again to permanently remove BreathFlow data.',
      )
      return
    }
    haptic([100, 50, 100])
    clearHistory()
    resetProgress()
    resetSettings()
    for (const key of BREATHFLOW_STORAGE_KEYS) {
      localStorage.removeItem(key)
    }
    setConfirmClear(false)
    setDataStatus('All BreathFlow data was cleared.')
  }

  return (
    <motion.div className="space-y-0 pb-8" variants={stagger} initial="hidden" animate="show">
      <motion.div variants={fadeUp} className="pb-8">
        <h1 className="font-display text-4xl font-semibold text-bw leading-none">
          Settings
        </h1>
      </motion.div>

      {/* Account */}
      {CLERK_ENABLED && (
        <motion.section variants={fadeUp} className="border-t border-bw-border pt-5 pb-6">
          <h2 className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary mb-4">Account</h2>
          <SignedOut>
            <div className="flex flex-col items-start gap-3 py-2">
              <p className="text-xs text-bw-tertiary">
                Sign in with Google to sync your progress across devices
              </p>
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="flex min-h-11 items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all duration-300 border border-bw-border hover:bg-bw-hover text-bw"
                >
                  <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
                  Sign in to sync
                </button>
              </SignInButton>
            </div>
          </SignedOut>
          <SignedIn>
            <AccountInfo />
          </SignedIn>
        </motion.section>
      )}

      {/* Appearance */}
      <motion.section variants={fadeUp} className="border-t border-bw-border pt-5 pb-6">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary mb-4">Appearance</h2>
        <div className="flex gap-3" role="group" aria-label="Appearance theme">
          <motion.button
            type="button"
            aria-pressed={theme === 'dark'}
            whileTap={tap(0.98)}
            transition={motionTransition}
            onClick={() => { haptic('selection'); setTheme('dark') }}
            className={cn(
              'flex min-h-11 items-center gap-2 px-4 py-2.5 text-xs font-medium border transition-all duration-300',
              theme === 'dark'
                ? 'border-bw-accent text-bw bg-bw-active'
                : 'border-bw-border text-bw-tertiary hover:text-bw-secondary hover:border-bw-border'
            )}
          >
            <Moon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Dark</span>
            {theme === 'dark' && (
              <Check className="h-3 w-3 ml-1" aria-hidden="true" />
            )}
          </motion.button>
          <motion.button
            type="button"
            aria-pressed={theme === 'light'}
            whileTap={tap(0.98)}
            transition={motionTransition}
            onClick={() => { haptic('selection'); setTheme('light') }}
            className={cn(
              'flex min-h-11 items-center gap-2 px-4 py-2.5 text-xs font-medium border transition-all duration-300',
              theme === 'light'
                ? 'border-bw-accent text-bw bg-bw-active'
                : 'border-bw-border text-bw-tertiary hover:text-bw-secondary hover:border-bw-border'
            )}
          >
            <Sun className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Light</span>
            {theme === 'light' && (
              <Check className="h-3 w-3 ml-1" aria-hidden="true" />
            )}
          </motion.button>
        </div>

      </motion.section>

      {/* Orb palette */}
      <motion.section variants={fadeUp} className="border-t border-bw-border pt-5 pb-6">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary">Orb Palette</h2>
          <span className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-tertiary">
            Level {level}
          </span>
        </div>
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          role="group"
          aria-label={`Orb palettes unlocked through level ${level}`}
        >
          {ORB_THEMES.map((orbTheme) => {
            const unlocked = unlockedThemeIds.has(orbTheme.id)
            const selected = effectiveSelectedTheme === orbTheme.id

            return (
              <motion.button
                key={orbTheme.id}
                type="button"
                disabled={!unlocked}
                aria-pressed={selected}
                aria-label={
                  unlocked
                    ? `${orbTheme.name} orb palette`
                    : `${orbTheme.name} orb palette, unlocks at level ${orbTheme.unlockLevel}`
                }
                whileTap={unlocked ? tap(0.98) : undefined}
                transition={motionTransition}
                onClick={() => {
                  if (!unlocked) return
                  haptic('selection')
                  setSelectedTheme(orbTheme.id)
                }}
                className={cn(
                  'min-h-24 border p-2.5 text-left transition-all duration-300',
                  selected
                    ? 'border-bw-accent bg-bw-active text-bw'
                    : 'border-bw-border text-bw-secondary hover:border-bw-border hover:bg-bw-hover',
                  !unlocked && 'cursor-not-allowed opacity-45 hover:bg-transparent'
                )}
              >
                <span
                  aria-hidden="true"
                  className="mb-3 block h-8 w-full border border-bw-border"
                  style={{
                    background: `linear-gradient(135deg, ${orbTheme.colors[0]}, ${orbTheme.colors[1]})`,
                  }}
                />
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">{orbTheme.name}</span>
                  {selected ? <Check className="h-3.5 w-3.5 text-bw-accent" aria-hidden="true" /> : null}
                  {!unlocked ? <Lock className="h-3.5 w-3.5 text-bw-tertiary" aria-hidden="true" /> : null}
                </span>
                <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.07em] text-bw-tertiary">
                  Lv {orbTheme.unlockLevel}
                </span>
              </motion.button>
            )
          })}
        </div>
      </motion.section>

      {/* Feedback — Sound + Haptics merged */}
      <motion.section variants={fadeUp} className="border-t border-bw-border pt-5 pb-6">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary mb-4">Feedback</h2>
        <div className="space-y-4">
          {/* Sound toggle */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-bw font-medium">Sound</span>
              <SettingsSwitch
                checked={soundEnabled}
                label="Sound"
                onClick={() => { haptic('selection'); setSoundEnabled(!soundEnabled) }}
              />
            </div>
            {soundEnabled && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-bw-tertiary font-medium">Volume</span>
                  <span className="text-[10px] text-bw-tertiary font-medium tabular-nums">
                    {Math.round(soundVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Sound volume"
                  min={0}
                  max={1}
                  step={0.01}
                  value={soundVolume}
                  onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                  className="h-11 w-full appearance-none cursor-pointer bg-transparent accent-bw-accent
                    [&::-webkit-slider-runnable-track]:h-px [&::-webkit-slider-runnable-track]:bg-bw-border
                    [&::-webkit-slider-thumb]:mt-[-7.5px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-bw-accent
                    [&::-webkit-slider-thumb]:shadow-sm
                    [&::-moz-range-track]:h-px [&::-moz-range-track]:bg-bw-border
                    [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full
                    [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-bw-accent"
                />
              </div>
            )}
          </div>

          {/* Haptics toggle */}
          <div className="pt-4 border-t border-bw-border">
            <div className="flex items-center justify-between">
              <span className="text-xs text-bw font-medium">Haptics</span>
              <SettingsSwitch
                checked={hapticsEnabled}
                label="Haptics"
                onClick={() => {
                  const next = !hapticsEnabled
                  setHapticsEnabled(next)
                  if (next) setTimeout(() => haptic('nudge'), 50)
                }}
              />
            </div>
          </div>
        </div>
      </motion.section>

      {/* Data */}
      <motion.section variants={fadeUp} className="border-t border-bw-border pt-5 pb-6">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary mb-4">Data</h2>
        <div className="divide-y divide-bw-border">
          <motion.button
            type="button"
            whileTap={tap(0.99)}
            transition={motionTransition}
            onClick={() => { haptic('light'); handleExportData() }}
            className="flex min-h-11 items-center gap-3 w-full py-4 hover:bg-bw-hover transition-all duration-300 text-left"
          >
            <Download className="h-3.5 w-3.5 text-bw-tertiary" aria-hidden="true" />
            <div>
              <p className="text-xs font-medium text-bw">Export Data</p>
              <p className="text-[10px] text-bw-tertiary">
                Download all data as JSON
              </p>
            </div>
          </motion.button>
          <motion.button
            type="button"
            whileTap={tap(0.99)}
            transition={motionTransition}
            onClick={() => {
              haptic('light')
              setImportError(null)
              setDataStatus(null)
              importInputRef.current?.click()
            }}
            className="flex min-h-11 items-center gap-3 w-full py-4 hover:bg-bw-hover transition-all duration-300 text-left"
          >
            <Upload className="h-3.5 w-3.5 text-bw-tertiary" aria-hidden="true" />
            <div>
              <p className="text-xs font-medium text-bw">Import Data</p>
              <p className="text-[10px] text-bw-tertiary">
                Restore a BreathFlow JSON backup
              </p>
            </div>
          </motion.button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            aria-label="Choose BreathFlow data backup"
            className="sr-only"
            onChange={handleImportData}
          />
          {dataStatus ? (
            <p
              className="py-3 text-xs leading-relaxed text-bw-secondary"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {dataStatus}
            </p>
          ) : null}
          {importError ? (
            <p className="py-3 text-xs leading-relaxed text-red-400" role="alert">
              {importError}
            </p>
          ) : null}
          <motion.button
            type="button"
            whileTap={tap(0.99)}
            transition={motionTransition}
            onClick={handleClearData}
            className={cn(
              'flex min-h-11 items-center gap-3 w-full py-4 transition-all duration-300 text-left',
              confirmClear
                ? 'bg-red-500/5 hover:bg-red-500/10'
                : 'hover:bg-bw-hover'
            )}
          >
            <Trash2
              className={cn(
                'h-3.5 w-3.5',
                confirmClear ? 'text-red-400' : 'text-bw-tertiary'
              )}
              aria-hidden="true"
            />
            <div>
              <p
                className={cn(
                  'text-xs font-medium',
                  confirmClear ? 'text-red-400' : 'text-bw'
                )}
              >
                {confirmClear ? 'Tap again to confirm' : 'Clear All Data'}
              </p>
              <p className="text-[10px] text-bw-tertiary">
                {confirmClear
                  ? 'This action cannot be undone'
                  : 'Remove all session history'}
              </p>
            </div>
          </motion.button>
          {confirmClear && (
            <button
              type="button"
              onClick={() => {
                setConfirmClear(false)
                setDataStatus('Clear data cancelled.')
              }}
              className="min-h-11 text-[10px] text-bw-tertiary hover:text-bw-secondary transition-colors py-3"
            >
              Cancel
            </button>
          )}
        </div>
      </motion.section>
    </motion.div>
  )
}
