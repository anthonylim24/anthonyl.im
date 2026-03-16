import { useState } from 'react'
import { motion } from 'motion/react'
import { SignedIn, SignedOut, SignInButton, useUser } from '@clerk/clerk-react'
import { CLERK_ENABLED } from '@/lib/clerk'
import {
  Download,
  Trash2,
  Check,
  Sun,
  Moon,
  Cloud,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settingsStore'
import { useHaptics } from '@/hooks/useHaptics'
import { useHistoryStore } from '@/stores/historyStore'

const motionTransition = { type: 'tween' as const, duration: 0.6, ease: [0.33, 0, 0, 1] as const }
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const fadeUp = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: motionTransition } }

function AccountInfo() {
  const { user } = useUser()
  if (!user) return null

  return (
    <div className="flex items-center gap-4">
      <img
        src={user.imageUrl}
        alt={user.fullName ?? 'Profile'}
        loading="lazy"
        className="h-12 w-12 rounded-full ring-2 ring-bw-border"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-bw truncate">
          {user.fullName}
        </p>
        <p className="text-xs text-bw-tertiary truncate">
          {user.primaryEmailAddress?.emailAddress}
        </p>
      </div>
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-bw-border bg-bw-hover">
        <div className="h-1.5 w-1.5 rounded-full animate-pulse bg-bw-tertiary" />
        <span className="text-[11px] font-medium text-bw-secondary">Synced</span>
      </div>
    </div>
  )
}

export function Settings() {
  const {
    theme,
    setTheme,
    soundEnabled,
    setSoundEnabled,
    soundVolume,
    setSoundVolume,
    hapticsEnabled,
    setHapticsEnabled,
  } = useSettingsStore()

  const { clearHistory } = useHistoryStore()

  const { trigger: haptic } = useHaptics()
  const [confirmClear, setConfirmClear] = useState(false)

  const handleExportData = () => {
    const data: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        data[key] = localStorage.getItem(key) ?? ''
      }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `breathflow-data-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleClearData = () => {
    if (!confirmClear) {
      haptic('error')
      setConfirmClear(true)
      return
    }
    haptic([100, 50, 100])
    clearHistory()
    setConfirmClear(false)
  }

  return (
    <motion.div className="space-y-8 pb-8" variants={stagger} initial="hidden" animate="show">
      <motion.div variants={fadeUp}>
        <h1 className="font-display text-[clamp(2rem,6vw,3rem)] font-light text-bw tracking-[0.04em] leading-[0.95]">
          Settings
        </h1>
      </motion.div>

      {/* Account */}
      {CLERK_ENABLED && (
        <motion.section variants={fadeUp} className="card-elevated rounded-[22px] p-5">
          <h2 className="font-display text-base font-light text-bw tracking-[0.04em] mb-4">Account</h2>
          <SignedOut>
            <div className="flex flex-col items-center gap-3 py-2">
              <p className="text-sm text-bw-tertiary text-center">
                Sign in with Google to sync your progress across devices
              </p>
              <SignInButton mode="modal">
                <button
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 border border-bw-border hover:border-bw-border hover:bg-bw-hover text-bw"
                >
                  <Cloud className="h-4 w-4" />
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
      <motion.section variants={fadeUp} className="card-elevated rounded-[22px] p-5">
        <h2 className="font-display text-base font-light text-bw tracking-[0.04em] mb-4">Appearance</h2>
        <div className="grid grid-cols-2 gap-3">
          <motion.button
            whileTap={{ scale: 0.98 }}
            transition={motionTransition}
            onClick={() => { haptic('selection'); setTheme('dark') }}
            className={cn(
              'relative flex items-center gap-3 p-4 rounded-[16px] border transition-all duration-300',
              theme === 'dark'
                ? 'bg-foreground text-background border-transparent'
                : 'border-bw-border surface-well text-bw-secondary hover:border-bw-border'
            )}
          >
            <Moon className="h-5 w-5" />
            <span className="font-semibold text-sm">Dark</span>
            {theme === 'dark' && (
              <Check className="absolute top-3 right-3 h-4 w-4" />
            )}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.98 }}
            transition={motionTransition}
            onClick={() => { haptic('selection'); setTheme('light') }}
            className={cn(
              'relative flex items-center gap-3 p-4 rounded-[16px] border transition-all duration-300',
              theme === 'light'
                ? 'bg-foreground text-background border-transparent'
                : 'border-bw-border surface-well text-bw-secondary hover:border-bw-border'
            )}
          >
            <Sun className="h-5 w-5" />
            <span className="font-semibold text-sm">Light</span>
            {theme === 'light' && (
              <Check className="absolute top-3 right-3 h-4 w-4" />
            )}
          </motion.button>
        </div>

      </motion.section>

      {/* Feedback — Sound + Haptics merged */}
      <motion.section variants={fadeUp} className="card-elevated rounded-[22px] p-5">
        <h2 className="font-display text-base font-light text-bw tracking-[0.04em] mb-4">Feedback</h2>
        <div className="space-y-4">
          {/* Sound toggle */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-bw font-semibold">Sound</span>
              <button
                onClick={() => { haptic('selection'); setSoundEnabled(!soundEnabled) }}
                aria-checked={soundEnabled}
                role="switch"
                className={cn(
                  'relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 min-h-[44px] min-w-[44px]',
                  soundEnabled ? 'bg-primary' : 'surface-well'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform duration-300',
                    soundEnabled ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </button>
            </div>
            {soundEnabled && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-bw-tertiary font-medium">Volume</span>
                  <span className="text-xs text-bw-tertiary font-medium tabular-nums">
                    {Math.round(soundVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={soundVolume}
                  onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-bw-active accent-primary
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary
                    [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-primary/30"
                />
              </div>
            )}
          </div>

          {/* Haptics toggle */}
          <div className="pt-4 border-t border-bw-border-subtle">
            <div className="flex items-center justify-between">
              <span className="text-sm text-bw font-semibold">Haptics</span>
              <button
                onClick={() => {
                  const next = !hapticsEnabled
                  setHapticsEnabled(next)
                  if (next) setTimeout(() => haptic('nudge'), 50)
                }}
                aria-checked={hapticsEnabled}
                role="switch"
                className={cn(
                  'relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 min-h-[44px] min-w-[44px]',
                  hapticsEnabled ? 'bg-primary' : 'surface-well'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform duration-300',
                    hapticsEnabled ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </button>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Data */}
      <motion.section variants={fadeUp} className="card-elevated rounded-[22px] p-5">
        <h2 className="font-display text-base font-light text-bw tracking-[0.04em] mb-4">Data</h2>
        <div className="flex flex-col gap-2.5">
          <motion.button
            whileTap={{ scale: 0.99 }}
            transition={motionTransition}
            onClick={() => { haptic('light'); handleExportData() }}
            className="flex items-center gap-3 w-full p-4 rounded-[16px] surface-well hover:bg-bw-hover transition-all duration-300 text-left"
          >
            <Download className="h-4 w-4 text-bw-tertiary" />
            <div>
              <p className="text-sm font-semibold text-bw">Export Data</p>
              <p className="text-xs text-bw-tertiary">
                Download all data as JSON
              </p>
            </div>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.99 }}
            transition={motionTransition}
            onClick={handleClearData}
            className={cn(
              'flex items-center gap-3 w-full p-4 rounded-[16px] transition-all duration-300 text-left',
              confirmClear
                ? 'bg-red-500/15 hover:bg-red-500/20 border border-red-500/20'
                : 'surface-well hover:bg-bw-hover'
            )}
          >
            <Trash2
              className={cn(
                'h-4 w-4',
                confirmClear ? 'text-red-400' : 'text-bw-tertiary'
              )}
            />
            <div>
              <p
                className={cn(
                  'text-sm font-semibold',
                  confirmClear ? 'text-red-400' : 'text-bw'
                )}
              >
                {confirmClear ? 'Tap again to confirm' : 'Clear All Data'}
              </p>
              <p className="text-xs text-bw-tertiary">
                {confirmClear
                  ? 'This action cannot be undone'
                  : 'Remove all session history'}
              </p>
            </div>
          </motion.button>
          {confirmClear && (
            <button
              onClick={() => setConfirmClear(false)}
              className="text-xs text-bw-tertiary hover:text-bw-secondary transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </motion.section>
    </motion.div>
  )
}
