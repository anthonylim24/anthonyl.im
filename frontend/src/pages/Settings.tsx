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
    <motion.div className="space-y-0 pb-8" variants={stagger} initial="hidden" animate="show">
      <motion.div variants={fadeUp} className="pb-8">
        <h1 className="font-mono text-lg font-medium text-bw tracking-[0.02em]">
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
                  className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all duration-300 border border-bw-border hover:bg-bw-hover text-bw"
                >
                  <Cloud className="h-3.5 w-3.5" />
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
        <div className="flex gap-3">
          <motion.button
            whileTap={{ scale: 0.98 }}
            transition={motionTransition}
            onClick={() => { haptic('selection'); setTheme('dark') }}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-xs font-medium border transition-all duration-300',
              theme === 'dark'
                ? 'border-bw text-bw'
                : 'border-bw-border text-bw-tertiary hover:text-bw-secondary hover:border-bw-border'
            )}
          >
            <Moon className="h-3.5 w-3.5" />
            <span>Dark</span>
            {theme === 'dark' && (
              <Check className="h-3 w-3 ml-1" />
            )}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.98 }}
            transition={motionTransition}
            onClick={() => { haptic('selection'); setTheme('light') }}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-xs font-medium border transition-all duration-300',
              theme === 'light'
                ? 'border-bw text-bw'
                : 'border-bw-border text-bw-tertiary hover:text-bw-secondary hover:border-bw-border'
            )}
          >
            <Sun className="h-3.5 w-3.5" />
            <span>Light</span>
            {theme === 'light' && (
              <Check className="h-3 w-3 ml-1" />
            )}
          </motion.button>
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
              <button
                onClick={() => { haptic('selection'); setSoundEnabled(!soundEnabled) }}
                aria-checked={soundEnabled}
                role="switch"
                className={cn(
                  'relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 min-h-[24px] min-w-[44px]',
                  soundEnabled ? 'bg-bw' : 'border border-bw-border'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-5 w-5 transform rounded-full shadow-sm transition-transform duration-300',
                    soundEnabled ? 'translate-x-6 bg-bw-canvas' : 'translate-x-1 bg-bw-tertiary'
                  )}
                />
              </button>
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
                  min={0}
                  max={1}
                  step={0.01}
                  value={soundVolume}
                  onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                  className="w-full h-px appearance-none cursor-pointer bg-bw-border accent-bw
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-bw
                    [&::-webkit-slider-thumb]:shadow-sm"
                />
              </div>
            )}
          </div>

          {/* Haptics toggle */}
          <div className="pt-4 border-t border-bw-border">
            <div className="flex items-center justify-between">
              <span className="text-xs text-bw font-medium">Haptics</span>
              <button
                onClick={() => {
                  const next = !hapticsEnabled
                  setHapticsEnabled(next)
                  if (next) setTimeout(() => haptic('nudge'), 50)
                }}
                aria-checked={hapticsEnabled}
                role="switch"
                className={cn(
                  'relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 min-h-[24px] min-w-[44px]',
                  hapticsEnabled ? 'bg-bw' : 'border border-bw-border'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-5 w-5 transform rounded-full shadow-sm transition-transform duration-300',
                    hapticsEnabled ? 'translate-x-6 bg-bw-canvas' : 'translate-x-1 bg-bw-tertiary'
                  )}
                />
              </button>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Data */}
      <motion.section variants={fadeUp} className="border-t border-bw-border pt-5 pb-6">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary mb-4">Data</h2>
        <div className="divide-y divide-bw-border">
          <motion.button
            whileTap={{ scale: 0.99 }}
            transition={motionTransition}
            onClick={() => { haptic('light'); handleExportData() }}
            className="flex items-center gap-3 w-full py-4 hover:bg-bw-hover transition-all duration-300 text-left"
          >
            <Download className="h-3.5 w-3.5 text-bw-tertiary" />
            <div>
              <p className="text-xs font-medium text-bw">Export Data</p>
              <p className="text-[10px] text-bw-tertiary">
                Download all data as JSON
              </p>
            </div>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.99 }}
            transition={motionTransition}
            onClick={handleClearData}
            className={cn(
              'flex items-center gap-3 w-full py-4 transition-all duration-300 text-left',
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
              onClick={() => setConfirmClear(false)}
              className="text-[10px] text-bw-tertiary hover:text-bw-secondary transition-colors py-3"
            >
              Cancel
            </button>
          )}
        </div>
      </motion.section>
    </motion.div>
  )
}
