import { useEffect, useMemo, useState } from 'react'
import { LayoutGroup, motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { withViteBase } from '@/lib/routerBasename'
import { sx } from '@/styles/merge'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useHistoryStore } from '@/stores/historyStore'
import { BreathFlowMark } from '../components/BreathFlowMark'
import { PhaseStrip } from '../components/PhaseStrip'
import { btn } from '../components/buttonStyles.stylex'
import { InkChip } from '../motion/InkChip'
import { Notice } from '../motion/Notice'
import { chromeTransition } from '../motion/tokens'
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
import { bf } from '../styles/breathflow.stylex'

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
    <div {...sx(bf.spaceY12, bf.pb8)}>
      <div {...sx(bf.relative, bf.pt4)}>
        <div {...sx(bf.heroDecor, bf.smH36, bf.smW36)} aria-hidden="true">
          <img
            src={withViteBase('/breathflow-hero-orb.webp')}
            alt=""
            width={576}
            height={324}
            decoding="async"
            fetchPriority={theme === 'dark' ? 'auto' : 'high'}
            {...sx(bf.hFull, bf.wFull, bf.objectCover, bf.objectCenter, bf.imgLightOnly)}
          />
          <img
            src={withViteBase('/breathflow-orb-dark.webp')}
            alt=""
            width={768}
            height={768}
            decoding="async"
            fetchPriority={theme === 'dark' ? 'high' : 'auto'}
            {...sx(bf.hFull, bf.wFull, bf.objectCover, bf.objectCenter, bf.imgDarkOnly)}
          />
        </div>
        <div {...sx(bf.relative, bf.flexItemsEnd, bf.gap3, bf.pr28, bf.smPr36)}>
          <h1 {...sx('bf-display', bf.greetingTitle, bf.trackingTight, bf.textBalance, bf.textBw)}>
            {getGreeting(hour)}.
          </h1>
          <BreathFlowMark size={36} {...sx(bf.markHiddenSm)} />
        </div>
        {isFirstRun ? (
          <p {...sx(bf.mt4, bf.maxWSm, bf.textSm, bf.leadingRelaxed, bf.textSecondary)}>
            One guided breathing session is enough to feel the shift. About 5 minutes.
          </p>
        ) : (
          <p {...sx(bf.mt4, bf.textSm, bf.textSecondary)}>
            {streak > 0
              ? `${streak}-day streak. ${dailyGoalMet ? 'Practiced today.' : 'A session today keeps it going.'}`
              : 'A five-minute session starts a new streak.'}
          </p>
        )}
      </div>

      <div {...sx(bf.spaceY3)}>
        <LayoutGroup id="home-goal">
          <div role="group" aria-label="Goal" {...sx(bf.flexWrap, bf.gapX4, bf.gapY1)}>
            {GOALS.map((option) => (
              <InkChip
                key={option.id}
                active={goal === option.id}
                onClick={() => setGoal(option.id)}
                label={option.label}
                layoutId="home-goal-ink"
              />
            ))}
          </div>
        </LayoutGroup>
        <LayoutGroup id="home-length">
          <div role="group" aria-label="Session length" {...sx(bf.flexWrap, bf.gapX4, bf.gapY1)}>
            {LENGTH_WINDOWS.map((option) => (
              <InkChip
                key={option.id}
                active={windowId === option.id}
                onClick={() => setWindowId(option.id)}
                label={`${option.label} · ${Math.round(option.seconds / 60)} min`}
                layoutId="home-length-ink"
              />
            ))}
          </div>
        </LayoutGroup>
      </div>

      {showRecoveryNotice && (
        <Notice title="Recovery in progress" live={false}>
          <p {...sx(bf.tabularNums)}>
            Breathe easy for {recovery.remainingSeconds}s. Intense protocols are held back until then.
          </p>
        </Notice>
      )}

      <RecommendedBlock ranked={recommendation.top} reducedMotion={reducedMotion} />

      <ol {...sx(bf.spaceY2)}>
        {recommendation.alternatives.map((alt, index) => (
          <li key={alt.protocol.id}>
            <AlternativeRow ranked={alt} index={index + 2} />
          </li>
        ))}
      </ol>

      {recent.length > 0 && (
        <section {...sx(bf.borderTop, bf.pt6)}>
          <h2 {...sx(bf.textSm, bf.fontMedium, bf.textBw)}>Pick up where you left off</h2>
          <ul {...sx(bf.mt3, bf.spaceY1)}>
            {recent.map((session) => {
              const protocol = getProtocol(session.techniqueId)
              return (
                <li key={session.id}>
                  <Link
                    to={buildSessionPath(buildRepeatParams(session))}
                    {...sx(bf.linkRow)}
                  >
                    <span {...sx(bf.minW0)}>
                      <span {...sx(bf.block, bf.truncate, bf.textSm, bf.fontMedium, bf.textBw)}>
                        {protocol.name}
                        {session.customPhaseDurations && (
                          <span {...sx(bf.ml2, bf.textXs, bf.fontNormal, bf.textTertiary)}>custom cadence</span>
                        )}
                      </span>
                      <span {...sx(bf.block, bf.textXs, bf.tabularNums, bf.textSecondary)}>
                        {formatLocalDate(session.date)} · {formatDuration(session.durationSeconds)}, {session.rounds} rounds
                      </span>
                    </span>
                    <span {...sx(bf.shrink0, bf.textXs, bf.textTertiary)}>
                      {isAdvancedProtocol(protocol) ? 'Safety check, then repeat' : 'Repeat'}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section {...sx(bf.borderTop, bf.pt6)}>
        <h2 {...sx(bf.textSm, bf.fontMedium, bf.textBw)}>Every technique</h2>
        <div {...sx(bf.mt6, bf.spaceY8)}>
          {CATEGORY_ORDER.map(({ id, label, blurb }) => {
            const protocols = PROTOCOLS.filter((protocol) => protocol.category === id)
            if (protocols.length === 0) return null
            return (
              <div key={id}>
                <p {...sx(bf.textSm, bf.textBw)}>
                  {label}
                  <span {...sx(bf.ml2, bf.textXs, bf.textTertiary)}>{blurb}</span>
                </p>
                <ul {...sx(bf.mt2)}>
                  {protocols.map((protocol) => (
                    <li key={protocol.id}>
                      <Link
                        to={buildSessionPath({ techniqueId: protocol.id, rounds: protocol.defaultRounds })}
                        {...sx(bf.techniqueListLink, bf.textBw)}
                      >
                        <span {...sx(bf.techniqueTitleRow)}>
                          <span {...sx(bf.textSm, bf.fontMedium, bf.textBw)}>{protocol.name}</span>
                          {isAdvancedProtocol(protocol) && (
                            <span {...sx(bf.shrink0, bf.text11px, bf.textSecondary)}>Safety check</span>
                          )}
                        </span>
                        <span {...sx(bf.techniqueMeta)}>{protocol.description}</span>
                        <span {...sx(bf.techniqueEvidence)}>
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
    <section aria-label="Recommended session" {...sx(bf.smPl8)}>
      <p {...sx(bf.textXs, bf.textSecondary)}>Recommended now</p>
      <div {...sx(bf.mt2, bf.flexWrapBaseline)}>
        <motion.h2
          key={protocol.id}
          initial={reducedMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={chromeTransition}
          {...sx('bf-display', bf.text2xl, bf.trackingTight, bf.textBalance, bf.textBw, bf.smText3xl)}
        >
          {protocol.name}
        </motion.h2>
        <p {...sx('bf-display', bf.textSm, bf.textSecondary)}>
          {formatDuration(plannedSeconds)} · {rounds} rounds
        </p>
      </div>
      <p {...sx(bf.mt3, bf.maxWMd, bf.textSm, bf.leadingRelaxed, bf.textSecondary)}>{protocol.purpose}</p>
      <p {...sx(bf.mt15, bf.textXs, bf.capitalize, bf.textTertiary)}>
        {protocol.evidenceLevel} evidence · {protocol.intensity}
        {advanced && ' · safety check required'}
      </p>

      <PhaseStrip protocol={protocol} animated={!reducedMotion} style={bf.mt5} />

      <Link
        to={startPath}
        {...sx(btn.base, btn.primary, btn.mt6, btn.wFull, btn.smWAuto, btn.smMinW44)}
      >
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
      {...sx(bf.linkRow, bf.textBw)}
    >
      <span {...sx(bf.minW0)}>
        <span {...sx('bf-display', bf.mr3, bf.textXs, bf.textTertiary)}>{String(index).padStart(2, '0')}</span>
        <span {...sx(bf.textSm, bf.fontMedium, bf.textBw)}>{protocol.name}</span>
        <span {...sx(bf.ml2, bf.textXs, bf.tabularNums, bf.textSecondary)}>
          {formatDuration(plannedSeconds)} · {rounds} rounds
        </span>
      </span>
      <span {...sx(bf.shrink0, bf.textXs, bf.textTertiary)}>
        {isAdvancedProtocol(protocol) ? 'Safety check' : 'Open'}
      </span>
    </Link>
  )
}
