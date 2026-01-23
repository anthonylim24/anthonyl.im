import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
    if (value >= 52) return { label: 'Excellent', color: 'text-blue-500' }
    if (value >= 45) return { label: 'Good', color: 'text-green-500' }
    if (value >= 38) return { label: 'Average', color: 'text-yellow-500' }
    return { label: 'Below Average', color: 'text-orange-500' }
  }

  const category = vo2MaxManual ? getVO2MaxCategory(vo2MaxManual) : null

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-pink-500 to-red-500 flex items-center justify-center shadow-lg shadow-pink-500/20">
              <Apple className="h-6 w-6 text-white" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Apple Health
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-normal">
                  Manual Sync
                </span>
              </CardTitle>
              <CardDescription>
                Track your VO2Max from Apple Fitness
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* VO2Max Display/Input */}
        <div className="p-6 rounded-2xl bg-gradient-to-br from-pink-500/5 to-red-500/5 border border-pink-500/10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-pink-500" />
              <span className="font-medium">VO2 Max</span>
            </div>
            {!isEditing && vo2MaxManual && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="text-xs"
              >
                Update
              </Button>
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
                    className="w-full text-4xl font-bold bg-transparent border-b-2 border-pink-500/30 focus:border-pink-500 outline-none pb-2 placeholder:text-muted-foreground/50 placeholder:text-2xl"
                    min="10"
                    max="99"
                    step="0.1"
                  />
                </div>
                <span className="text-muted-foreground pb-2">ml/kg/min</span>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSave}
                  size="sm"
                  className="bg-gradient-to-r from-pink-500 to-red-500 shadow-lg shadow-pink-500/20"
                >
                  Save
                </Button>
                {vo2MaxManual && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsEditing(false)
                      setInputValue(vo2MaxManual.toString())
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-baseline gap-3">
              <span className="text-5xl font-bold">{vo2MaxManual}</span>
              <span className="text-muted-foreground">ml/kg/min</span>
              {category && (
                <span className={cn('text-sm font-medium ml-2', category.color)}>
                  {category.label}
                </span>
              )}
            </div>
          )}

          {vo2MaxHistory.length > 1 && (
            <div className="mt-4 pt-4 border-t border-pink-500/10">
              <div className="text-xs text-muted-foreground">
                Last updated: {new Date(vo2MaxHistory[vo2MaxHistory.length - 1].date).toLocaleDateString()}
              </div>
            </div>
          )}
        </div>

        {/* Expandable How-To Section */}
        <div className="glass rounded-xl overflow-hidden">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-accent/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">How to find your VO2Max</span>
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

                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <p className="text-amber-600 dark:text-amber-400 text-xs">
                    <strong>Note:</strong> VO2Max estimates require an Apple Watch and outdoor workouts with GPS enabled.
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">
                  Why manual entry? Apple HealthKit requires a native iOS app for direct data access. A companion app is planned for the future.
                </p>
                <a
                  href="https://support.apple.com/en-us/108709"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Learn more about Cardio Fitness
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
