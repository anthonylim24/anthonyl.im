import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Play, ShieldCheck } from 'lucide-react'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useHistoryStore } from '@/stores/historyStore'
import { PhaseStrip } from '../components/PhaseStrip'
import { btnPrimary } from '../components/buttonStyles'
import { formatDuration, formatLocalDate } from '../components/format'
import { useReducedMotion } from '../platform/useReducedMotion'
import { getProtocol, isAdvancedProtocol, PROTOCOLS } from '../protocols/catalog'
import type { ProtocolCategory } from '../protocols/types'
import {
  GOALS,
  getDefaultGoalForHour,
  LENGTH_WINDOWS,
  recommendProtocols,
  type LengthWindowId,
  type PracticeGoal,
  type RankedProtocol,
} from '../recommend/recommendations'
import { useRecoveryStatus } from '../safety/useRecoveryStatus'
import { buildRepeatParams, buildSessionPath } from '../session/urlParams'

function getGreeting(hour: number): string {
  if (hour < 5) return 'Still up'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

const CATEGORY_ORDER: readonly { id: ProtocolCategory; label: string; blurb: string }[] = [
  { id: 'calm', label: 'Calm', blurb: 'Slow the system down' },
  { id: 'focus', label: 'Focus', blurb: 'Steady attention under pressure' },
  { id: 'sleep', label: 'Sleep', blurb: 'Downshift toward rest' },
  { id: 'performance', label: 'Performance', blurb: 'Train, deliberately' },
  { id: 'recovery', label: 'Recovery', blurb: 'Settle the breath after effort' },
]

export function HomePage() {
  const sessions = useHistoryStore((state) => state.sessions)
  const dailySessionCount = useGamificationStore((state) => state.dailySessionCount)
  const checkResets = useGamificationStore((state) => state.checkResets)
  const recovery = useRecoveryStatus()
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    checkResets()
  }, [checkResets])

  const hour = new Date().getHours()
  const [goal, setGoal] = useState<PracticeGoal>(() => getDefaultGoalForHour(hour))
  const [windowId, setWindowId] = useState<LengthWindowId>('standard')
  const windowSeconds = LENGTH_WINDOWS.find((w) => w.id === windowId)?.seconds ?? 300

  // getStreak() returns a primitive, so the selector subscription is stable.
  const streak = useHistoryStore((state) => state.getStreak())
  const isFirstRun = sessions.length === 0
  const dailyGoalMet = dailySessionCount > 0

  const recommendation = useMemo(
    () => recommendProtocols({
      goal,
      windowSeconds,
      now: new Date(),
      sessions,
      dailyGoalMet,
      recoveryActive: recovery.isActive,
    }),
    [goal, windowSeconds, sessions, dailyGoalMet, recovery.isActive],
  )

  const recent = sessions.slice(0, 3)
  const showRecoveryNotice = goal === 'perform' && recovery.isActive

  return (
    <div className="space-y-9 pb-8">
      {/* Greeting */}
      <div className="pt-2">
        <h1 className="text-3xl font-semibold tracking-tight text-bw sm:text-4xl">
          {getGreeting(hour)}.
        </h1>
        {isFirstRun ? (
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-bw-secondary">
            One guided breathing session is enough to feel the shift. About 5 minutes.
          </p>
        ) : (
          <p className="mt-2 text-sm text-bw-secondary">
            {streak > 0
              ? `${streak}-day streak. ${dailyGoalMet ? 'Practiced today.' : 'A session today keeps it going.'}`
              : 'A five-minute session starts a new streak.'}
          </p>
        )}
      </div>

      {/* Tuner */}
      <div className="space-y-3">
        <div role="group" aria-label="Goal" className="flex flex-wrap gap-1.5">
          {GOALS.map((option) => (
            <TunerChip
              key={option.id}
              active={goal === option.id}
              onClick={() => setGoal(option.id)}
              label={option.label}
            />
          ))}
        </div>
        <div role="group" aria-label="Session length" className="flex flex-wrap gap-1.5">
          {LENGTH_WINDOWS.map((option) => (
            <TunerChip
              key={option.id}
              active={windowId === option.id}
              onClick={() => setWindowId(option.id)}
              label={`${option.label} · ${Math.round(option.seconds / 60)} min`}
            />
          ))}
        </div>
      </div>

      {showRecoveryNotice && (
        <div role="status" className="rounded-2xl border border-bw-border bg-bw-surface p-4">
          <p className="text-sm font-medium text-bw">Recovery in progress</p>
          <p className="mt-1 text-sm tabular-nums text-bw-secondary">
            Breathe easy for {recovery.remainingSeconds}s. Intense protocols are held back until then.
          </p>
        </div>
      )}

      {/* Recommended */}
      <RecommendedCard ranked={recommendation.top} reducedMotion={reducedMotion} primary />
      <div className="grid gap-2 sm:grid-cols-2">
        {recommendation.alternatives.map((alt) => (
          <AlternativeRow key={alt.protocol.id} ranked={alt} />
        ))}
      </div>

      {/* Recent */}
      {recent.length > 0 && (
        <section className="border-t border-bw-border pt-5">
          <h2 className="text-sm font-semibold text-bw">Pick up where you left off</h2>
          <ul className="mt-2 divide-y divide-bw-border-subtle">
            {recent.map((session) => {
              const protocol = getProtocol(session.techniqueId)
              return (
                <li key={session.id}>
                  <Link
                    to={buildSessionPath(buildRepeatParams(session))}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-lg py-2 transition-colors duration-150 hover:bg-bw-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bw-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-bw">
                        {protocol.name}
                        {session.customPhaseDurations && (
                          <span className="ml-2 text-xs font-normal text-bw-tertiary">custom cadence</span>
                        )}
                      </span>
                      <span className="block text-xs tabular-nums text-bw-secondary">
                        {formatLocalDate(session.date)} · {formatDuration(session.durationSeconds)}, {session.rounds} rounds
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-bw-tertiary">
                      {isAdvancedProtocol(protocol) ? 'Safety check, then repeat' : 'Repeat'}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Catalog */}
      <section className="border-t border-bw-border pt-5">
        <h2 className="text-lg font-semibold tracking-tight text-bw">Every technique</h2>
        <div className="mt-4 space-y-7">
          {CATEGORY_ORDER.map(({ id, label, blurb }) => {
            const protocols = PROTOCOLS.filter((protocol) => protocol.category === id)
            if (protocols.length === 0) return null
            return (
              <div key={id}>
                <div className="flex items-baseline gap-3">
                  <h3 className="text-sm font-semibold text-bw">{label}</h3>
                  <p className="text-xs text-bw-tertiary">{blurb}</p>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {protocols.map((protocol) => (
                    <li key={protocol.id}>
                      <Link
                        to={buildSessionPath({ techniqueId: protocol.id, rounds: protocol.defaultRounds })}
                        className="block rounded-2xl border border-bw-border bg-bw-surface p-3.5 transition-colors duration-150 hover:bg-bw-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bw-accent"
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-bw">{protocol.name}</span>
                          {isAdvancedProtocol(protocol) && (
                            <span className="flex shrink-0 items-center gap-1 text-[11px] text-bw-secondary">
                              <ShieldCheck size={13} strokeWidth={1.75} aria-hidden="true" />
                              Safety check
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-bw-secondary">
                          {protocol.description}
                        </span>
                        <span className="mt-1.5 block text-[11px] capitalize text-bw-tertiary">
                          {protocol.evidenceLevel} evidence · {protocol.intensity} ·{' '}
                          {protocol.breathsPerMinute} breaths/min
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function TunerChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        'min-h-11 rounded-lg border px-3.5 text-sm transition-colors duration-150 active:scale-[0.98]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bw-accent',
        active
          ? 'border-bw-accent bg-bw-accent text-bw-accent-foreground font-medium'
          : 'border-bw-border bg-bw-surface text-bw-secondary hover:bg-bw-hover',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function RecommendedCard({
  ranked,
  reducedMotion,
  primary,
}: {
  ranked: RankedProtocol
  reducedMotion: boolean
  primary?: boolean
}) {
  const { protocol, rounds, plannedSeconds } = ranked
  const advanced = isAdvancedProtocol(protocol)
  const startPath = `${buildSessionPath({ techniqueId: protocol.id, rounds })}${advanced ? '' : '&autostart=1'}`

  return (
    <section
      aria-label="Recommended session"
      className="rounded-2xl border border-bw-border bg-bw-surface p-5 sm:p-6"
    >
      <p className="text-xs font-medium text-bw-secondary">Recommended now</p>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-bw sm:text-2xl">{protocol.name}</h2>
        <p className="text-sm tabular-nums text-bw-secondary">
          {formatDuration(plannedSeconds)} · {rounds} rounds
        </p>
      </div>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-bw-secondary">{protocol.purpose}</p>
      <p className="mt-1.5 text-xs capitalize text-bw-tertiary">
        {protocol.evidenceLevel} evidence · {protocol.intensity}
        {advanced && ' · safety check required'}
      </p>

      <PhaseStrip protocol={protocol} animated={!reducedMotion} className="mt-4" />

      {primary && (
        <Link to={startPath} className={`${btnPrimary} mt-5 w-full sm:w-auto sm:min-w-44`}>
          <Play size={16} strokeWidth={1.75} aria-hidden="true" />
          Begin
        </Link>
      )}
    </section>
  )
}

function AlternativeRow({ ranked }: { ranked: RankedProtocol }) {
  const { protocol, rounds, plannedSeconds } = ranked
  return (
    <Link
      to={buildSessionPath({ techniqueId: protocol.id, rounds })}
      className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-bw-border bg-bw-surface px-4 py-3 transition-colors duration-150 hover:bg-bw-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bw-accent"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-bw">{protocol.name}</span>
        <span className="block text-xs tabular-nums text-bw-secondary">
          {formatDuration(plannedSeconds)} · {rounds} rounds
        </span>
      </span>
      <span className="shrink-0 text-xs text-bw-tertiary">
        {isAdvancedProtocol(protocol) ? 'Safety check' : 'Open'}
      </span>
    </Link>
  )
}
