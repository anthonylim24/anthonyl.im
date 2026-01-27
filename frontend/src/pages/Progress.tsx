import { useState, useMemo } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProgressChart } from '@/components/tracking/ProgressChart'
import { SessionHistory } from '@/components/tracking/SessionHistory'
import { PersonalBests } from '@/components/tracking/PersonalBests'
import { AppleHealthCard } from '@/components/tracking/AppleHealthCard'
import { useHistoryStore } from '@/stores/historyStore'
import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatTime, cn } from '@/lib/utils'
import { Activity, Calendar, Clock, Trash2, Wind, Flame, Box, TrendingUp, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const techniqueConfig: Record<TechniqueId, {
  icon: React.ReactNode
  gradient: string
  glow: string
}> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: {
    icon: <Box className="h-4 w-4" />,
    gradient: 'from-[#60a5fa] to-[#818cf8]',
    glow: 'shadow-[#60a5fa]/30',
  },
  [TECHNIQUE_IDS.CO2_TOLERANCE]: {
    icon: <Flame className="h-4 w-4" />,
    gradient: 'from-[#fbbf24] to-[#f97316]',
    glow: 'shadow-[#fbbf24]/30',
  },
  [TECHNIQUE_IDS.POWER_BREATHING]: {
    icon: <Wind className="h-4 w-4" />,
    gradient: 'from-[#2dd4bf] to-[#22d3ee]',
    glow: 'shadow-[#2dd4bf]/30',
  },
}

export function Progress() {
  const {
    sessions,
    personalBests,
    clearHistory,
    getStreak,
  } = useHistoryStore()

  const [filterTechnique, setFilterTechnique] = useState<TechniqueId | 'all'>('all')
  const [showClearDialog, setShowClearDialog] = useState(false)

  // Memoize filtered sessions and computed values
  const filteredSessions = useMemo(() =>
    filterTechnique === 'all'
      ? sessions
      : sessions.filter((s) => s.techniqueId === filterTechnique),
    [sessions, filterTechnique]
  )

  const totalDuration = useMemo(() =>
    sessions.reduce((acc, s) => acc + s.durationSeconds, 0),
    [sessions]
  )

  // Memoize expensive getStreak() calculation
  const streak = useMemo(() => getStreak(), [sessions])

  const handleClearHistory = () => {
    clearHistory()
    setShowClearDialog(false)
  }

  return (
    <div className="pb-4">
      <div className="space-y-8 sm:space-y-10">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full liquid-glass-breath text-sm font-medium animate-scale-in">
              <TrendingUp className="h-4 w-4 text-[#ff7170]" />
              <span className="text-foreground/80">Your Journey</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground opacity-0 animate-slide-up stagger-1">
              <span className="gradient-text-breath">Progress</span> Tracking
            </h1>
            <p className="text-muted-foreground text-sm opacity-0 animate-slide-up stagger-2">Track your breathing journey</p>
          </div>
          <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
            <DialogTrigger asChild>
              <button className="px-4 py-2 rounded-xl text-sm font-medium text-red-500 hover:bg-red-500/10 transition-all duration-300 flex items-center gap-2">
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            </DialogTrigger>
            <DialogContent className="liquid-glass-breath border-0 rounded-3xl">
              <DialogHeader>
                <DialogTitle className="text-foreground">Clear All History?</DialogTitle>
                <DialogDescription>
                  This will permanently delete all your session history and
                  personal bests. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <button
                  onClick={() => setShowClearDialog(false)}
                  className="px-4 py-2 rounded-xl bg-white/50 hover:bg-white/70 text-foreground font-medium transition-all duration-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearHistory}
                  className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium transition-all duration-300"
                >
                  Clear All
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 opacity-0 animate-slide-up stagger-3">
          <div className="liquid-glass-breath rounded-2xl p-4 sm:p-6 group hover:scale-[1.02] transition-all duration-300">
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-[#60a5fa] to-[#818cf8] flex items-center justify-center shadow-lg shadow-[#60a5fa]/25 group-hover:scale-110 transition-transform duration-300">
                <Activity className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-foreground">{sessions.length}</div>
            <div className="text-xs sm:text-sm text-muted-foreground font-medium">Sessions</div>
          </div>
          <div className="liquid-glass-breath rounded-2xl p-4 sm:p-6 group hover:scale-[1.02] transition-all duration-300">
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-[#ff7170] to-[#ff5eb5] flex items-center justify-center shadow-lg shadow-[#ff7170]/25 group-hover:scale-110 transition-transform duration-300">
                <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-foreground">{formatTime(totalDuration)}</div>
            <div className="text-xs sm:text-sm text-muted-foreground font-medium">Total Time</div>
          </div>
          <div className="liquid-glass-breath rounded-2xl p-4 sm:p-6 group hover:scale-[1.02] transition-all duration-300">
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-[#fbbf24] to-[#f97316] flex items-center justify-center shadow-lg shadow-[#fbbf24]/25 group-hover:scale-110 transition-transform duration-300">
                <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-foreground">{streak}</div>
            <div className="text-xs sm:text-sm text-muted-foreground font-medium">Day Streak</div>
          </div>
        </div>

        {/* Apple Health Integration */}
        <div className="opacity-0 animate-slide-up stagger-4">
          <AppleHealthCard />
        </div>

        {/* Personal Bests */}
        <div className="opacity-0 animate-slide-up stagger-5">
          <PersonalBests personalBests={personalBests} />
        </div>

        {/* Progress Chart */}
        <div className="opacity-0 animate-scale-in" style={{ animationDelay: '0.6s' }}>
          <ProgressChart
            sessions={filteredSessions.filter((s) => s.maxHoldTime > 0)}
          />
        </div>

        {/* Session History */}
        <div className="liquid-glass-breath rounded-3xl overflow-hidden opacity-0 animate-scale-in" style={{ animationDelay: '0.7s' }}>
          <div className="p-5 sm:p-6 border-b border-white/20">
            <h3 className="text-base sm:text-lg font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#ff7170]" />
              Session History
            </h3>
          </div>
          <div className="p-5 sm:p-6">
            <Tabs
              value={filterTechnique}
              onValueChange={(v) => setFilterTechnique(v as TechniqueId | 'all')}
            >
              <TabsList className="grid grid-cols-4 h-12 sm:h-14 p-1.5 liquid-glass-breath rounded-xl mb-5 sm:mb-6">
                <TabsTrigger value="all" className="rounded-lg text-xs sm:text-sm data-[state=active]:bg-white/60 data-[state=active]:shadow-md">All</TabsTrigger>
                {Object.values(TECHNIQUE_IDS).map((id) => {
                  const tc = techniqueConfig[id]
                  return (
                    <TabsTrigger key={id} value={id} className="gap-1 sm:gap-1.5 rounded-lg data-[state=active]:bg-white/60 data-[state=active]:shadow-md">
                      <div className={cn(
                        "h-5 w-5 sm:h-6 sm:w-6 rounded bg-gradient-to-br flex items-center justify-center shadow-sm",
                        tc.gradient
                      )}>
                        <span className="text-white scale-75">{tc.icon}</span>
                      </div>
                      <span className="hidden sm:inline text-xs font-medium">
                        {breathingProtocols[id].name.split(' ')[0]}
                      </span>
                    </TabsTrigger>
                  )
                })}
              </TabsList>

              <TabsContent value={filterTechnique}>
                <SessionHistory sessions={filteredSessions} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  )
}
