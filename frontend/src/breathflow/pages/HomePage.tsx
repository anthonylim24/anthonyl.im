import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { withViteBase } from '@/lib/routerBasename'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useHistoryStore } from '@/stores/historyStore'
import { BreathFlowMark } from '../components/BreathFlowMark'
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
  const theme = useSettingsStore((state) => state.theme)

  useEffect(() => {
    checkResets()
  }, [checkResets])

  const hour = new Date().getHours()
  const [goal, setGoal] = useState<PracticeGoal>(() => getDefaultGoalForHour(hour))
  const [windowId, setWindowId] = useState<LengthWindowId>('standard')
  const windowSeconds = LENGTH_WINDOWS.find((w) => w.id === windowId)?.seconds ?? 300

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
    <div className="space-y-12 pb-8">
      <div className="relative pt-4">
        <div className="pointer-events-none absolute -right-2 top-0 h-28 w-28 opacity-80 sm:h-36 sm:w-36" aria-hidden="true">
          <img
            src={withViteBase('/breathflow-hero-orb.webp')}
            alt=""
            width={576}
            height={324}
            decoding="async"
            fetchPriority={theme === 'dark' ? 'auto' : 'high'}
            className="h-full w-full object-cover object-center dark:hidden"
          />
          <img
            src={withViteBase('/breathflow-orb-dark.webp')}
            alt=""
            width={768}
            height={768}
            decoding="async"
            fetchPriority={theme === 'dark' ? 'high' : 'auto'}
            className="hidden h-full w-full object-cover object-center dark:block"
          />
        </div>
        <div className="relative flex items-end gap-3 pr-28 sm:pr-36">
          <h1 className="bf-display text-[clamp(2.25rem,6vw,3.5rem)] leading-[1.05] tracking-tight text-balance text-bw">
            {getGreeting(hour)}.
          </h1>
          <BreathFlowMark size={36} className="mb-1 hidden h-9 w-9 sm:block" />
        </div>
        {isFirstRun ? (
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-bw-secondary">
            One guided breathing session is enough to feel the shift. About 5 minutes.
          </p>
        ) : (
          <p className="mt-4 text-sm text-bw-secondary">
            {streak > 0
              ? `${streak}-day streak. ${dailyGoalMet ? 'Practiced today.' : 'A session today keeps it going.'}`
              : 'A five-minute session starts a new streak.'}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div role="group" aria-label="Goal" className="flex flex-wrap gap-x-4 gap-y-1">
          {GOALS.map((option) => (
            <TunerChip
              key={option.id}
              active={goal === option.id}
              onClick={() => setGoal(option.id)}
              label={option.label}
            />
          ))}
        </div>
        <div role="group" aria-label="Session length" className="flex flex-wrap gap-x-4 gap-y-1">
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
        <div role="status" className="border-l-2 border-bw-accent pl-4">
          <p className="text-sm font-medium text-bw">Recovery in progress</p>
          <p className="mt-1 text-sm tabular-nums text-bw-secondary">
            Breathe easy for {recovery.remainingSeconds}s. Intense protocols are held back until then.
          </p>
        </div>
      )}

      <RecommendedBlock ranked={recommendation.top} reducedMotion={reducedMotion} />

      <ol className="space-y-2">
        {recommendation.alternatives.map((alt, index) => (
          <li key={alt.protocol.id}>
            <AlternativeRow ranked={alt} index={index + 2} />
          </li>
        ))}
      </ol>

      {recent.length > 0 && (
        <section className="border-t border-bw-border pt-6">
          <h2 className="text-sm font-medium text-bw">Pick up where you left off</h2>
          <ul className="mt-3 space-y-1">
            {recent.map((session) => {
              const protocol = getProtocol(session.techniqueId)
              return (
                <li key={session.id}>
                  <Link
                    to={buildSessionPath(buildRepeatParams(session))}
                    className="flex min-h-11 items-center justify-between gap-3 py-2 transition-colors duration-150 hover:text-bw-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bw-accent"
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

      <section className="border-t border-bw-border pt-6">
        <h2 className="text-sm font-medium text-bw">Every technique</h2>
        <div className="mt-6 space-y-8">
          {CATEGORY_ORDER.map(({ id, label, blurb }) => {
            const protocols = PROTOCOLS.filter((protocol) => protocol.category === id)
            if (protocols.length === 0) return null
            return (
              <div key={id}>
                <p className="text-sm text-bw">
                  {label}
                  <span className="ml-2 text-xs text-bw-tertiary">{blurb}</span>
                </p>
                <ul className="mt-2">
                  {protocols.map((protocol) => (
                    <li key={protocol.id}>
                      <Link
                        to={buildSessionPath({ techniqueId: protocol.id, rounds: protocol.defaultRounds })}
                        className="block py-2.5 transition-colors duration-150 hover:text-bw-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bw-accent"
                      >
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-medium text-bw">{protocol.name}</span>
                          {isAdvancedProtocol(protocol) && (
                            <span className="shrink-0 text-[11px] text-bw-secondary">Safety check</span>
                          )}
                        </span>
                        <span className="mt-0.5 block max-w-md text-xs leading-relaxed text-bw-secondary">
                          {protocol.description}
                        </span>
                        <span className="mt-1 block text-[11px] capitalize text-bw-tertiary">
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
        'min-h-11 text-sm transition-colors duration-150 active:scale-[0.98] motion-reduce:active:scale-100',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bw-accent',
        active
          ? 'font-medium text-bw underline decoration-bw-accent decoration-1 underline-offset-8'
          : 'text-bw-secondary hover:text-bw',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function RecommendedBlock({
  ranked,
  reducedMotion,
}: {
  ranked: RankedProtocol
  reducedMotion: boolean
}) {
  const { protocol, rounds, plannedSeconds } = ranked
  const advanced = isAdvancedProtocol(protocol)
  const startPath = `${buildSessionPath({ techniqueId: protocol.id, rounds })}${advanced ? '' : '&autostart=1'}`

  return (
    <section aria-label="Recommended session" className="sm:pl-8">
      <p className="text-xs text-bw-secondary">Recommended now</p>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="bf-display text-2xl tracking-tight text-balance text-bw sm:text-3xl">
          {protocol.name}
        </h2>
        <p className="bf-display text-sm text-bw-secondary">
          {formatDuration(plannedSeconds)} · {rounds} rounds
        </p>
      </div>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-bw-secondary">{protocol.purpose}</p>
      <p className="mt-1.5 text-xs capitalize text-bw-tertiary">
        {protocol.evidenceLevel} evidence · {protocol.intensity}
        {advanced && ' · safety check required'}
      </p>

      <PhaseStrip protocol={protocol} animated={!reducedMotion} className="mt-5" />

      <Link to={startPath} className={`${btnPrimary} mt-6 w-full sm:w-auto sm:min-w-44`}>
        Begin
      </Link>
    </section>
  )
}

function AlternativeRow({ ranked, index }: { ranked: RankedProtocol; index: number }) {
  const { protocol, rounds, plannedSeconds } = ranked
  return (
    <Link
      to={buildSessionPath({ techniqueId: protocol.id, rounds })}
      className="flex min-h-11 items-center justify-between gap-3 py-2 transition-colors duration-150 hover:text-bw-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bw-accent"
    >
      <span className="min-w-0">
        <span className="bf-display mr-3 text-xs text-bw-tertiary">{String(index).padStart(2, '0')}</span>
        <span className="text-sm font-medium text-bw">{protocol.name}</span>
        <span className="ml-2 text-xs tabular-nums text-bw-secondary">
          {formatDuration(plannedSeconds)} · {rounds} rounds
        </span>
      </span>
      <span className="shrink-0 text-xs text-bw-tertiary">
        {isAdvancedProtocol(protocol) ? 'Safety check' : 'Open'}
      </span>
    </Link>
  )
}
