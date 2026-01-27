import { useState } from 'react'
import { useHistoryStore } from '@/stores/historyStore'
import { Apple, TrendingUp, Info, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

export function AppleHealthCard() {
  const { vo2MaxManual, vo2MaxHistory, setVO2Max } = useHistoryStore()
  const [isExpanded, setIsExpanded] = useState(false)
  const [inputValue, setInputValue] = useState(vo2MaxManual?.toString() ?? '')
  const [isEditing, setIsEditing] = useState(false)

  const handleSave = () => {
    const value = parseFloat(inputValue)
    if (!isNaN(value) && value > 0 && value < 100) {
      setVO2Max(value)
      setIsEditing(false)
    }
  }

  const getVO2MaxCategory = (value: number): { label: string; color: string } => {
    if (value >= 60) return { label: 'Elite', color: 'text-purple-500' }
    if (value >= 52) return { label: 'Excellent', color: 'text-[#60a5fa]' }
    if (value >= 45) return { label: 'Good', color: 'text-[#2dd4bf]' }
    if (value >= 38) return { label: 'Average', color: 'text-[#fbbf24]' }
    return { label: 'Below Average', color: 'text-[#f97316]' }
  }

  const category = vo2MaxManual ? getVO2MaxCategory(vo2MaxManual) : null

  return (
    <div className="liquid-glass-breath rounded-3xl overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-white/20">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[#ff7170] to-[#ff5eb5] flex items-center justify-center shadow-lg shadow-[#ff7170]/25">
              <Apple className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-foreground">
                Apple Health
                <span className="text-xs px-2.5 py-1 rounded-full bg-white/50 text-muted-foreground font-medium">
                  Manual Sync
                </span>
              </h3>
              <p className="text-sm text-muted-foreground">
                Track your VO2Max from Apple Fitness
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-5">
        {/* VO2Max Display/Input */}
        <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-[#ff7170]/10 to-[#ff5eb5]/10 border border-[#ff7170]/20">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-[#ff7170]" />
              <span className="font-semibold text-foreground">VO2 Max</span>
            </div>
            {!isEditing && vo2MaxManual && (
              <button
                onClick={() => setIsEditing(true)}
                className="text-xs font-medium text-[#ff7170] hover:text-[#ff5eb5] transition-colors"
              >
                Update
              </button>
            )}
          </div>

          {isEditing || !vo2MaxManual ? (
            <div className="space-y-4">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <input
                    type="number"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Enter your VO2Max"
                    className="w-full text-4xl font-bold bg-transparent border-b-2 border-[#ff7170]/30 focus:border-[#ff7170] outline-none pb-2 placeholder:text-muted-foreground/50 placeholder:text-2xl text-foreground"
                    min="10"
                    max="99"
                    step="0.1"
                  />
                </div>
                <span className="text-muted-foreground pb-2">ml/kg/min</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#ff7170] to-[#ff5eb5] text-white font-medium shadow-lg shadow-[#ff7170]/25 hover:shadow-xl transition-all duration-300"
                >
                  Save
                </button>
                {vo2MaxManual && (
                  <button
                    onClick={() => {
                      setIsEditing(false)
                      setInputValue(vo2MaxManual.toString())
                    }}
                    className="px-4 py-2 rounded-xl bg-white/50 hover:bg-white/70 text-foreground font-medium transition-all duration-300"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-baseline gap-3">
              <span className="text-5xl font-bold text-foreground">{vo2MaxManual}</span>
              <span className="text-muted-foreground">ml/kg/min</span>
              {category && (
                <span className={cn('text-sm font-semibold ml-2', category.color)}>
                  {category.label}
                </span>
              )}
            </div>
          )}

          {vo2MaxHistory.length > 1 && (
            <div className="mt-4 pt-4 border-t border-[#ff7170]/20">
              <div className="text-xs text-muted-foreground">
                Last updated: {new Date(vo2MaxHistory[vo2MaxHistory.length - 1].date).toLocaleDateString()}
              </div>
            </div>
          )}
        </div>

        {/* Expandable How-To Section */}
        <div className="bg-white/40 rounded-2xl overflow-hidden">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-white/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">How to find your VO2Max</span>
            </div>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {isExpanded && (
            <div className="px-4 pb-4 space-y-4 text-sm">
              <div className="space-y-3">
                <p className="text-muted-foreground">
                  Apple Watch estimates your VO2Max based on outdoor walks, runs, and hikes. Here's how to view it:
                </p>

                <ol className="space-y-2 list-decimal list-inside text-muted-foreground">
                  <li>Open the <strong className="text-foreground">Health</strong> app on your iPhone</li>
                  <li>Tap <strong className="text-foreground">Browse</strong> at the bottom</li>
                  <li>Go to <strong className="text-foreground">Heart → Cardio Fitness</strong></li>
                  <li>Your VO2Max value is displayed at the top</li>
                </ol>

                <div className="p-3 rounded-xl bg-[#fbbf24]/10 border border-[#fbbf24]/20">
                  <p className="text-[#b45309] dark:text-[#fbbf24] text-xs">
                    <strong>Note:</strong> VO2Max estimates require an Apple Watch and outdoor workouts with GPS enabled.
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-white/30">
                <p className="text-xs text-muted-foreground mb-2">
                  Why manual entry? Apple HealthKit requires a native iOS app for direct data access. A companion app is planned for the future.
                </p>
                <a
                  href="https://support.apple.com/en-us/108709"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[#ff7170] hover:text-[#ff5eb5] transition-colors font-medium"
                >
                  Learn more about Cardio Fitness
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
