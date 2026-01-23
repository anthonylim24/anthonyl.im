import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProgressChart } from '@/components/tracking/ProgressChart'
import { SessionHistory } from '@/components/tracking/SessionHistory'
import { PersonalBests } from '@/components/tracking/PersonalBests'
import { AppleHealthCard } from '@/components/tracking/AppleHealthCard'
import { useHistoryStore } from '@/stores/historyStore'
import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatTime, cn } from '@/lib/utils'
import {
  Activity,
  Calendar,
  Clock,
  Trash2,
  Wind,
  Flame,
  Box,
} from 'lucide-react'
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
}> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: {
    icon: <Box className="h-4 w-4" />,
    gradient: 'from-blue-500 to-indigo-600',
  },
  [TECHNIQUE_IDS.CO2_TOLERANCE]: {
    icon: <Flame className="h-4 w-4" />,
    gradient: 'from-orange-500 to-rose-600',
  },
  [TECHNIQUE_IDS.POWER_BREATHING]: {
    icon: <Wind className="h-4 w-4" />,
    gradient: 'from-emerald-500 to-teal-600',
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

  const filteredSessions =
    filterTechnique === 'all'
      ? sessions
      : sessions.filter((s) => s.techniqueId === filterTechnique)

  const totalDuration = sessions.reduce((acc, s) => acc + s.durationSeconds, 0)
  const streak = getStreak()

  const handleClearHistory = () => {
    clearHistory()
    setShowClearDialog(false)
  }

  return (
    <div className="pb-4">
      <div className="space-y-6 sm:space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Progress</h1>
            <p className="text-muted-foreground mt-1">Track your breathing journey</p>
          </div>
          <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-strong border-0">
              <DialogHeader>
                <DialogTitle>Clear All History?</DialogTitle>
                <DialogDescription>
                  This will permanently delete all your session history and
                  personal bests. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowClearDialog(false)}
                >
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleClearHistory}>
                  Clear All
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Card className="group hover:scale-[1.02] transition-transform">
            <CardContent className="p-3 sm:pt-6 sm:p-6">
              <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg sm:rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
                </div>
              </div>
              <div className="text-xl sm:text-3xl font-bold">{sessions.length}</div>
              <div className="text-xs sm:text-sm text-muted-foreground">Sessions</div>
            </CardContent>
          </Card>
          <Card className="group hover:scale-[1.02] transition-transform">
            <CardContent className="p-3 sm:pt-6 sm:p-6">
              <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg sm:rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                  <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
                </div>
              </div>
              <div className="text-xl sm:text-3xl font-bold">{formatTime(totalDuration)}</div>
              <div className="text-xs sm:text-sm text-muted-foreground">Total Time</div>
            </CardContent>
          </Card>
          <Card className="group hover:scale-[1.02] transition-transform">
            <CardContent className="p-3 sm:pt-6 sm:p-6">
              <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg sm:rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                  <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
                </div>
              </div>
              <div className="text-xl sm:text-3xl font-bold">{streak}</div>
              <div className="text-xs sm:text-sm text-muted-foreground">Day Streak</div>
            </CardContent>
          </Card>
        </div>

        {/* Apple Health Integration */}
        <AppleHealthCard />

        {/* Personal Bests */}
        <PersonalBests personalBests={personalBests} />

        {/* Progress Chart */}
        <ProgressChart
          sessions={filteredSessions.filter((s) => s.maxHoldTime > 0)}
        />

        {/* Session History */}
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Session History</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <Tabs
              value={filterTechnique}
              onValueChange={(v) => setFilterTechnique(v as TechniqueId | 'all')}
            >
              <TabsList className="grid grid-cols-4 h-10 sm:h-12 p-1 glass rounded-lg sm:rounded-xl mb-4 sm:mb-6">
                <TabsTrigger value="all" className="rounded-md sm:rounded-lg text-xs sm:text-sm">All</TabsTrigger>
                {Object.values(TECHNIQUE_IDS).map((id) => {
                  const tc = techniqueConfig[id]
                  return (
                    <TabsTrigger key={id} value={id} className="gap-1 sm:gap-1.5 rounded-md sm:rounded-lg">
                      <div className={cn(
                        "h-4 w-4 sm:h-5 sm:w-5 rounded bg-gradient-to-br flex items-center justify-center",
                        tc.gradient
                      )}>
                        <span className="text-white scale-[0.6] sm:scale-75">{tc.icon}</span>
                      </div>
                      <span className="hidden sm:inline text-xs">
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
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
