import { useState } from 'react'
import {
  Palette,
  Volume2,
  Smartphone,
  Sparkles,
  Database,
  Download,
  Trash2,
  Lock,
  Check,
  Sun,
  Moon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settingsStore'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useHistoryStore } from '@/stores/historyStore'
import { getLevelForXP, ORB_THEMES } from '@/lib/gamification'

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
      setConfirmClear(true)
      return
    }
    clearHistory()
    setConfirmClear(false)
  }

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-white/50 mt-1">Customize your experience</p>
      </div>

      {/* Theme */}
      <section className="liquid-glass-breath rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Palette className="h-5 w-5 text-white/50" />
          <h2 className="text-lg font-semibold text-white">Theme</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setTheme('dark')}
            className={cn(
              'relative flex items-center gap-3 p-4 rounded-xl border transition-all duration-200',
              theme === 'dark'
                ? 'border-[#6E7BF2] bg-[#6E7BF2]/10'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            )}
          >
            <Moon className="h-5 w-5 text-white" />
            <span className="text-white font-medium">Dark</span>
            {theme === 'dark' && (
              <Check className="absolute top-3 right-3 h-4 w-4 text-[#8B96FF]" />
            )}
          </button>
          <button
            onClick={() => setTheme('light')}
            className={cn(
              'relative flex items-center gap-3 p-4 rounded-xl border transition-all duration-200',
              theme === 'light'
                ? 'border-[#6E7BF2] bg-[#6E7BF2]/10'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            )}
          >
            <Sun className="h-5 w-5 text-white" />
            <span className="text-white font-medium">Light</span>
            {theme === 'light' && (
              <Check className="absolute top-3 right-3 h-4 w-4 text-[#8B96FF]" />
            )}
          </button>
        </div>
      </section>

      {/* Sound */}
      <section className="liquid-glass-breath rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Volume2 className="h-5 w-5 text-white/50" />
            <h2 className="text-lg font-semibold text-white">Sound</h2>
          </div>
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              soundEnabled ? 'bg-[#6E7BF2]' : 'bg-white/10'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                soundEnabled ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>
        {soundEnabled && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-white/50">Volume</span>
              <span className="text-sm text-white/50">
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
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/10 accent-[#6E7BF2]
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#6E7BF2]
                [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-[#6E7BF2]/25"
            />
          </div>
        )}
      </section>

      {/* Haptics */}
      <section className="liquid-glass-breath rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-white/50" />
            <h2 className="text-lg font-semibold text-white">Haptics</h2>
          </div>
          <button
            onClick={() => setHapticsEnabled(!hapticsEnabled)}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              hapticsEnabled ? 'bg-[#6E7BF2]' : 'bg-white/10'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                hapticsEnabled ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>
      </section>

      {/* Orb Theme */}
      <section className="liquid-glass-breath rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-white/50" />
          <h2 className="text-lg font-semibold text-white">Orb Theme</h2>
          <span className="text-xs text-white/40 ml-auto">
            Level {currentLevel}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {ORB_THEMES.map((orbTheme) => {
            const isUnlocked = currentLevel >= orbTheme.unlockLevel
            const isSelected = selectedTheme === orbTheme.id
            return (
              <button
                key={orbTheme.id}
                onClick={() => isUnlocked && setSelectedTheme(orbTheme.id)}
                disabled={!isUnlocked}
                className={cn(
                  'flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-200',
                  isUnlocked
                    ? 'hover:bg-white/5 cursor-pointer'
                    : 'opacity-30 cursor-not-allowed'
                )}
              >
                <div className="relative">
                  <div
                    className={cn(
                      'h-12 w-12 rounded-full',
                      isSelected && 'ring-2 ring-white ring-offset-2 ring-offset-transparent'
                    )}
                    style={{
                      background: `linear-gradient(135deg, ${orbTheme.colors[0]}, ${orbTheme.colors[1]})`,
                    }}
                  />
                  {!isUnlocked && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Lock className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
                <span className="text-xs text-white/50">{orbTheme.name}</span>
                {!isUnlocked && (
                  <span className="text-[10px] text-white/40">
                    Lvl {orbTheme.unlockLevel}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </section>

      {/* Data */}
      <section className="liquid-glass-breath rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Database className="h-5 w-5 text-white/50" />
          <h2 className="text-lg font-semibold text-white">Data</h2>
        </div>
        <div className="flex flex-col gap-3">
          <button
            onClick={handleExportData}
            className="flex items-center gap-3 w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-left"
          >
            <Download className="h-4 w-4 text-white/50" />
            <div>
              <p className="text-sm font-medium text-white">Export Data</p>
              <p className="text-xs text-white/40">
                Download all data as JSON
              </p>
            </div>
          </button>
          <button
            onClick={handleClearData}
            className={cn(
              'flex items-center gap-3 w-full p-3 rounded-xl transition-colors text-left',
              confirmClear
                ? 'bg-red-500/20 hover:bg-red-500/30'
                : 'bg-white/5 hover:bg-white/10'
            )}
          >
            <Trash2
              className={cn(
                'h-4 w-4',
                confirmClear ? 'text-red-400' : 'text-white/50'
              )}
            />
            <div>
              <p
                className={cn(
                  'text-sm font-medium',
                  confirmClear ? 'text-red-400' : 'text-white'
                )}
              >
                {confirmClear ? 'Tap again to confirm' : 'Clear All Data'}
              </p>
              <p className="text-xs text-white/40">
                {confirmClear
                  ? 'This action cannot be undone'
                  : 'Remove all session history'}
              </p>
            </div>
          </button>
          {confirmClear && (
            <button
              onClick={() => setConfirmClear(false)}
              className="text-xs text-white/40 hover:text-white/60 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
