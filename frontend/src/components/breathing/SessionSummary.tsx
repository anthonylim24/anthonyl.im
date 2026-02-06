import { BADGES } from '@/lib/gamification'
import { formatTime } from '@/lib/utils'
import { Trophy, Zap, Target, Clock, Star, X } from 'lucide-react'

interface SessionSummaryProps {
  xpEarned: number
  newBadges: string[]
  rounds: number
  durationSeconds: number
  holdTimes: number[]
  isNewPersonalBest: boolean
  onClose: () => void
}

export function SessionSummary({
  xpEarned,
  newBadges,
  rounds,
  durationSeconds,
  holdTimes,
  isNewPersonalBest,
  onClose,
}: SessionSummaryProps) {
  const maxHold = holdTimes.length > 0 ? Math.max(...holdTimes) : 0
  const avgHold =
    holdTimes.length > 0
      ? Math.round(holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length)
      : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm rounded-3xl bg-gradient-to-b from-[#1a1e30] to-[#0f1220] border border-white/10 shadow-2xl animate-scale-in overflow-hidden">
        <div className="relative px-6 pt-8 pb-4 text-center">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-white/50 hover:text-white/80 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/30">
            <Trophy className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">Session Complete</h2>
          <div className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-full bg-blue-500/20 border border-blue-500/30">
            <Zap className="h-4 w-4 text-blue-400" />
            <span className="text-blue-300 font-bold">+{xpEarned} XP</span>
          </div>
        </div>

        <div className="px-6 pb-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/5 p-3 text-center">
              <Target className="h-5 w-5 mx-auto mb-1 text-white/40" />
              <div className="text-xl font-bold text-white">{rounds}</div>
              <div className="text-xs text-white/40">Rounds</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3 text-center">
              <Clock className="h-5 w-5 mx-auto mb-1 text-white/40" />
              <div className="text-xl font-bold text-white">
                {formatTime(durationSeconds)}
              </div>
              <div className="text-xs text-white/40">Duration</div>
            </div>
          </div>

          {holdTimes.length > 0 && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="rounded-xl bg-white/5 p-3 text-center">
                <div className="text-xl font-bold text-amber-400">
                  {maxHold}s
                </div>
                <div className="text-xs text-white/40">Best Hold</div>
              </div>
              <div className="rounded-xl bg-white/5 p-3 text-center">
                <div className="text-xl font-bold text-white">{avgHold}s</div>
                <div className="text-xs text-white/40">Avg Hold</div>
              </div>
            </div>
          )}

          {isNewPersonalBest && (
            <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/20 text-center">
              <div className="flex items-center justify-center gap-2">
                <Star className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-semibold text-amber-300">
                  New Personal Best!
                </span>
                <Star className="h-4 w-4 text-amber-400" />
              </div>
            </div>
          )}

          {newBadges.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-xs text-white/40 text-center font-medium uppercase tracking-wider">
                Badges Unlocked
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {newBadges.map((badgeId) => {
                  const badge = BADGES.find((b) => b.id === badgeId)
                  if (!badge) return null
                  return (
                    <div
                      key={badgeId}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/30"
                    >
                      <span className="text-xs font-medium text-amber-300">
                        {badge.name}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
