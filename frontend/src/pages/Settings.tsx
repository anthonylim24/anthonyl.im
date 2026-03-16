import { useState } from 'react'
import { motion } from 'motion/react'
import { SignedIn, SignedOut, SignInButton, useUser } from '@clerk/clerk-react'
import { CLERK_ENABLED } from '@/lib/clerk'
import {
  Download,
  Trash2,
  Lock,
  Check,
  Sun,
  Moon,
  Cloud,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ACCENT, ACCENT_BRIGHT, withAlpha } from '@/lib/palette'
import { useSettingsStore } from '@/stores/settingsStore'
import { useHaptics } from '@/hooks/useHaptics'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useHistoryStore } from '@/stores/historyStore'
import { getLevelForXP, ORB_THEMES } from '@/lib/gamification'

const spring = { type: 'spring' as const, stiffness: 300, damping: 30, mass: 1 }
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } }
const fadeUp = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: spring } }

function AccountInfo() {
  const { user } = useUser()
  if (!user) return null

  return (
    <div className="flex items-center gap-4">
      <img
        src={user.imageUrl}
        alt={user.fullName ?? 'Profile'}
        loading="lazy"
        className="h-12 w-12 rounded-full ring-2 ring-zinc-200"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-zinc-900 truncate">
          {user.fullName}
        </p>
        <p className="text-xs text-zinc-400 truncate">
          {user.primaryEmailAddress?.emailAddress}
        </p>
      </div>
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border" style={{ background: withAlpha(ACCENT, 0.1), borderColor: withAlpha(ACCENT, 0.2) }}>
        <div className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: ACCENT_BRIGHT }} />
        <span className="text-[11px] font-medium" style={{ color: ACCENT_BRIGHT }}>Synced</span>
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

  const { xp, selectedTheme, setSelectedTheme } = useGamificationStore()
  const { clearHistory } = useHistoryStore()

  const { trigger: haptic } = useHaptics()
  const [confirmClear, setConfirmClear] = useState(false)

  const currentLevel = getLevelForXP(xp)

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
        <h1 className="font-display text-[clamp(2rem,6vw,3rem)] font-extrabold text-zinc-900 tracking-[-0.02em] leading-[0.95]">
          Settings
        </h1>
      </motion.div>

      {/* Account */}
      {CLERK_ENABLED && (
        <motion.section variants={fadeUp} className="card-elevated rounded-[22px] p-5">
          <h2 className="font-display text-base font-bold text-zinc-900 mb-4">Account</h2>
          <SignedOut>
            <div className="flex flex-col items-center gap-3 py-2">
              <p className="text-sm text-zinc-400 text-center">
                Sign in with Google to sync your progress across devices
              </p>
              <SignInButton mode="modal">
                <button
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-zinc-900"
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

      {/* Appearance — Theme + Orb Theme merged */}
      <motion.section variants={fadeUp} className="card-elevated rounded-[22px] p-5">
        <h2 className="font-display text-base font-bold text-zinc-900 mb-4">Appearance</h2>
        <div className="grid grid-cols-2 gap-3">
          <motion.button
            whileTap={{ scale: 0.98 }}
            transition={spring}
            onClick={() => { haptic('selection'); setTheme('dark') }}
            className={cn(
              'relative flex items-center gap-3 p-4 rounded-[16px] border transition-all duration-300',
              theme === 'dark'
                ? 'border-primary/60 bg-primary/10'
                : 'border-zinc-200 surface-well hover:border-zinc-300'
            )}
          >
            <Moon className="h-5 w-5 text-zinc-900" />
            <span className="text-zinc-900 font-semibold text-sm">Dark</span>
            {theme === 'dark' && (
              <Check className="absolute top-3 right-3 h-4 w-4 text-primary" />
            )}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.98 }}
            transition={spring}
            onClick={() => { haptic('selection'); setTheme('light') }}
            className={cn(
              'relative flex items-center gap-3 p-4 rounded-[16px] border transition-all duration-300',
              theme === 'light'
                ? 'border-primary/60 bg-primary/10'
                : 'border-zinc-200 surface-well hover:border-zinc-300'
            )}
          >
            <Sun className="h-5 w-5 text-zinc-900" />
            <span className="text-zinc-900 font-semibold text-sm">Light</span>
            {theme === 'light' && (
              <Check className="absolute top-3 right-3 h-4 w-4 text-primary" />
            )}
          </motion.button>
        </div>

        {/* Orb Theme */}
        <div className="mt-5 pt-5 border-t border-zinc-100">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-400 font-medium">Orb Theme</span>
            <span className="text-[11px] text-zinc-400 font-medium tracking-wide uppercase">
              Level {currentLevel}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {ORB_THEMES.map((orbTheme) => {
              const isUnlocked = currentLevel >= orbTheme.unlockLevel
              const isSelected = selectedTheme === orbTheme.id
              return (
                <motion.button
                  key={orbTheme.id}
                  whileTap={isUnlocked ? { scale: 0.95 } : undefined}
                  transition={spring}
                  onClick={() => { if (isUnlocked) { haptic('selection'); setSelectedTheme(orbTheme.id) } }}
                  disabled={!isUnlocked}
                  className={cn(
                    'flex flex-col items-center gap-2.5 p-3 rounded-[16px] transition-all duration-300',
                    isUnlocked
                      ? 'hover:bg-zinc-50 cursor-pointer'
                      : 'opacity-25 cursor-not-allowed'
                  )}
                >
                  <div className="relative">
                    <div
                      className={cn(
                        'h-14 w-14 rounded-full transition-all duration-300',
                        isSelected && 'ring-2 ring-zinc-900/80 ring-offset-2 ring-offset-transparent scale-110'
                      )}
                      style={{
                        background: `linear-gradient(135deg, ${orbTheme.colors[0]}, ${orbTheme.colors[1]})`,
                        boxShadow: isSelected ? `0 8px 24px -4px ${orbTheme.colors[0]}50` : undefined,
                      }}
                    />
                    {!isUnlocked && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Lock className="h-4 w-4 text-zinc-400" />
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-zinc-500 font-medium">{orbTheme.name}</span>
                  {!isUnlocked && (
                    <span className="text-[10px] text-zinc-400 -mt-1">
                      Lvl {orbTheme.unlockLevel}
                    </span>
                  )}
                </motion.button>
              )
            })}
          </div>
        </div>
      </motion.section>

      {/* Feedback — Sound + Haptics merged */}
      <motion.section variants={fadeUp} className="card-elevated rounded-[22px] p-5">
        <h2 className="font-display text-base font-bold text-zinc-900 mb-4">Feedback</h2>
        <div className="space-y-4">
          {/* Sound toggle */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-900 font-semibold">Sound</span>
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
                  <span className="text-xs text-zinc-400 font-medium">Volume</span>
                  <span className="text-xs text-zinc-400 font-medium tabular-nums">
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
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-zinc-200 accent-primary
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary
                    [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-primary/30"
                />
              </div>
            )}
          </div>

          {/* Haptics toggle */}
          <div className="pt-4 border-t border-zinc-100">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-900 font-semibold">Haptics</span>
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
        <h2 className="font-display text-base font-bold text-zinc-900 mb-4">Data</h2>
        <div className="flex flex-col gap-2.5">
          <motion.button
            whileTap={{ scale: 0.99 }}
            transition={spring}
            onClick={() => { haptic('light'); handleExportData() }}
            className="flex items-center gap-3 w-full p-4 rounded-[16px] surface-well hover:bg-zinc-50 transition-all duration-300 text-left"
          >
            <Download className="h-4 w-4 text-zinc-400" />
            <div>
              <p className="text-sm font-semibold text-zinc-900">Export Data</p>
              <p className="text-xs text-zinc-400">
                Download all data as JSON
              </p>
            </div>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.99 }}
            transition={spring}
            onClick={handleClearData}
            className={cn(
              'flex items-center gap-3 w-full p-4 rounded-[16px] transition-all duration-300 text-left',
              confirmClear
                ? 'bg-red-500/15 hover:bg-red-500/20 border border-red-500/20'
                : 'surface-well hover:bg-zinc-50'
            )}
          >
            <Trash2
              className={cn(
                'h-4 w-4',
                confirmClear ? 'text-red-400' : 'text-zinc-400'
              )}
            />
            <div>
              <p
                className={cn(
                  'text-sm font-semibold',
                  confirmClear ? 'text-red-400' : 'text-zinc-900'
                )}
              >
                {confirmClear ? 'Tap again to confirm' : 'Clear All Data'}
              </p>
              <p className="text-xs text-zinc-400">
                {confirmClear
                  ? 'This action cannot be undone'
                  : 'Remove all session history'}
              </p>
            </div>
          </motion.button>
          {confirmClear && (
            <button
              onClick={() => setConfirmClear(false)}
              className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </motion.section>
    </motion.div>
  )
}
