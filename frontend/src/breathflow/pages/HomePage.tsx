import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { LayoutGroup, motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { addLocalDays, formatLocalDateKey, getLocalDateKey, getLocalDayStart } from '@/lib/localDates'
import { sx } from '@/styles/merge'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useHistoryStore, type CompletedSession } from '@/stores/historyStore'
import { PhaseStrip } from '../components/PhaseStrip'
import { btn } from '../components/buttonStyles.stylex'
import { InkChip } from '../motion/InkChip'
import { Notice } from '../motion/Notice'
import { EASE_SETTLE } from '../motion/tokens'
import { formatDuration, formatLocalDate } from '../components/format'
import { useReducedMotion } from '../platform/useReducedMotion'
import { techniquePigment } from '../pigments'
import { getProtocol, isAdvancedProtocol, PROTOCOLS } from '../protocols/catalog'
import type { ProtocolCategory } from '../protocols/types'
import {
  GOALS,
  getDefaultGoalForHour,
  getRoundsForWindow,
  LENGTH_WINDOWS,
  recommendProtocols,
  type LengthWindowId,
  type PracticeGoal,
  type RankedProtocol,
} from '../recommend/recommendations'
import { useRecoveryStatus } from '../safety/useRecoveryStatus'
import { PaintingLoader } from '../components/PaintingLoader'
import { BloomAnchor } from '../scene/BloomAnchor'
import { BloomCanvas } from '../scene/BloomCanvas'
import { idleBreath } from '../scene/breathDrive'
import { buildRepeatParams, buildSessionPath } from '../session/urlParams'
import { bf } from '../styles/breathflow.stylex'
import { home } from '../styles/home.stylex'
import { wc } from '../styles/watercolor.stylex'

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

const readIdle = () => idleBreath(performance.now() / 1000)
const readStill = () => idleBreath(2.75)

/** One-tap reset: a minute of cyclic sighing, no setup. */
const QUICK = getProtocol('cyclic_sighing')
const QUICK_PATH = `${buildSessionPath({ techniqueId: QUICK.id, rounds: getRoundsForWindow(QUICK, 60) })}&autostart=1`

const enter = (reducedMotion: boolean, delay: number) =>
  reducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.8, ease: EASE_SETTLE, delay },
      }

export function HomePage() {
  const sessions = useHistoryStore((state) => state.sessions)
  const dailySessionCount = useGamificationStore((state) => state.dailySessionCount)
  const checkResets = useGamificationStore((state) => state.checkResets)
  const recovery = useRecoveryStatus()
  const reducedMotion = useReducedMotion()
  const heroRef = useRef<HTMLElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    checkResets()
  }, [checkResets])

  const now = new Date()
  const hour = now.getHours()
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
  const pigment = techniquePigment(recommendation.top.protocol.id)

  return (
    <>
      {!ready && <PaintingLoader pigment={pigment} reducedMotion={reducedMotion} />}
      <div aria-busy={!ready} {...sx(wc.reveal, !ready && wc.holding)}>
        <section
          ref={heroRef}
          {...sx(home.hero)}
          style={{ '--bf-mass': pigment.mass, '--bf-glaze': pigment.glaze } as CSSProperties}
          aria-labelledby="bf-greeting"
        >
          <BloomCanvas
            anchorRef={anchorRef}
            pointerHostRef={heroRef}
            mode="play"
            pigment={pigment}
            read={reducedMotion ? readStill : readIdle}
            onLive={setLive}
            onReady={() => setReady(true)}
            style={home.heroCanvas}
          />
          <div {...sx(home.heroGrid)}>
            <div {...sx(home.heroCopy)}>
              <motion.p {...enter(reducedMotion, 0)} {...sx(wc.eyebrow)}>
                {now.toLocaleDateString(undefined, { weekday: 'long' })} · BreathFlow
              </motion.p>
              <motion.h1 id="bf-greeting" {...enter(reducedMotion, 0.06)} {...sx('bf-display', wc.pageTitle, home.greeting)}>
                {getGreeting(hour)}<span {...sx(wc.italic, home.greetingDot)}>.</span>
              </motion.h1>
              <motion.div {...enter(reducedMotion, 0.12)}>
                {isFirstRun ? (
                  <p {...sx(wc.lede, home.lede)}>
                    One guided breathing session is enough to feel the shift. About 5 minutes.
                  </p>
                ) : (
                  <div {...sx(home.streakRow)}>
                    <p {...sx(wc.lede, home.lede)}>
                      {streak > 0
                        ? `${streak}-day streak. ${dailyGoalMet ? 'Practiced today.' : 'A session today keeps it going.'}`
                        : 'A five-minute session starts a new streak.'}
                    </p>
                    <WeekDabs sessions={sessions} />
                  </div>
                )}
              </motion.div>

              <motion.div {...enter(reducedMotion, 0.18)} {...sx(home.choosers)}>
                <LayoutGroup id="home-goal">
                  <div role="group" aria-label="Goal" {...sx(home.chipRow)}>
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
                  <div role="group" aria-label="Session length" {...sx(home.chipRow)}>
                    {LENGTH_WINDOWS.map((option) => (
                      <InkChip
                        key={option.id}
                        active={windowId === option.id}
                        onClick={() => setWindowId(option.id)}
                        label={`${option.label} · ${Math.round(option.seconds / 60)} min`}
                        layoutId="home-length-ink"
                        compact
                      />
                    ))}
                  </div>
                </LayoutGroup>
              </motion.div>

              {showRecoveryNotice && (
                <Notice title="Recovery in progress" live={false} style={bf.mt5}>
                  <p {...sx(bf.tabularNums)}>
                    Breathe easy for {recovery.remainingSeconds}s. Intense protocols are held back until then.
                  </p>
                </Notice>
              )}

              <motion.div {...enter(reducedMotion, 0.24)}>
                <RecommendedBlock ranked={recommendation.top} reducedMotion={reducedMotion} />
              </motion.div>
            </div>

            <div {...sx(home.heroBloom)}>
              <BloomAnchor
                ref={anchorRef}
                pigment={pigment}
                read={reducedMotion ? readStill : readIdle}
                live={live}
                reducedMotion={reducedMotion}
              />
              {!reducedMotion && (
                <p aria-hidden="true" {...sx(home.hint)}>
                  <span {...sx(home.hintFine)}>Poke the cat, or drag it.</span>
                  <span {...sx(home.hintTouch)}>Tap or drag the cat.</span>
                  <span {...sx(wc.italic, home.hintPigment)}>{pigment.name}</span>
                </p>
              )}
            </div>
          </div>
        </section>

        {recommendation.alternatives.length > 0 && (
          <section {...sx(wc.section)} aria-labelledby="bf-alts">
            <div {...sx(wc.sectionHead)}>
              <h2 id="bf-alts" {...sx('bf-display', wc.sectionTitle)}>Also a good fit</h2>
            </div>
            <ol {...sx(home.altList)}>
              {recommendation.alternatives.map((alt) => (
                <li key={alt.protocol.id}>
                  <AlternativeRow ranked={alt} />
                </li>
              ))}
            </ol>
          </section>
        )}

        {recent.length > 0 && (
          <section {...sx(wc.section)} aria-labelledby="bf-recent">
            <div {...sx(wc.sectionHead)}>
              <h2 id="bf-recent" {...sx('bf-display', wc.sectionTitle)}>Pick up where you left off</h2>
            </div>
            <ul {...sx(home.recentList)}>
              {recent.map((session) => {
                const protocol = getProtocol(session.techniqueId)
                const paint = techniquePigment(protocol.id)
                return (
                  <li key={session.id}>
                    <Link
                      to={buildSessionPath(buildRepeatParams(session))}
                      {...sx(home.recentRow)}
                      style={{ '--bf-mass': paint.mass, '--bf-glaze': paint.glaze } as CSSProperties}
                    >
                      <span aria-hidden="true" {...sx('bf-dab', home.recentDab)} />
                      <span {...sx(bf.minW0, bf.flex1)}>
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

        <section {...sx(wc.section)} aria-labelledby="bf-paintbox">
          <div {...sx(wc.sectionHead)}>
            <h2 id="bf-paintbox" {...sx('bf-display', wc.sectionTitle)}>Every technique</h2>
            <p {...sx(bf.textSm, bf.textSecondary)}>Nine breaths, nine pigments.</p>
          </div>
          <div {...sx(home.paintbox)}>
            {CATEGORY_ORDER.map(({ id, label, blurb }) => {
              const protocols = PROTOCOLS.filter((protocol) => protocol.category === id)
              if (protocols.length === 0) return null
              return (
                <div key={id} {...sx(home.category)}>
                  <p {...sx(home.categoryLabel)}>
                    <span {...sx('bf-display', wc.italic, home.categoryName)}>{label}</span>
                    <span {...sx(bf.textXs, bf.textTertiary)}>{blurb}</span>
                  </p>
                  <ul {...sx(home.swatchGrid)}>
                    {protocols.map((protocol) => (
                      <li key={protocol.id}>
                        <TechniqueSwatch protocolId={protocol.id} reducedMotion={reducedMotion} />
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </>
  )
}

function RecommendedBlock({ ranked, reducedMotion }: { ranked: RankedProtocol; reducedMotion: boolean }) {
  const { protocol, rounds, plannedSeconds } = ranked
  const advanced = isAdvancedProtocol(protocol)
  const startPath = `${buildSessionPath({ techniqueId: protocol.id, rounds })}${advanced ? '' : '&autostart=1'}`
  const paint = techniquePigment(protocol.id)

  return (
    <section
      aria-label="Recommended session"
      {...sx(home.recommended)}
      style={{ '--bf-ink': paint.mass, '--bf-mass': paint.mass, '--bf-glaze': paint.glaze } as CSSProperties}
    >
      <p {...sx(wc.eyebrow)}>Recommended now</p>
      <div {...sx(home.recTitleRow)}>
        <motion.h2
          key={protocol.id}
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE_SETTLE }}
          {...sx('bf-display', home.recTitle)}
        >
          {protocol.name}
        </motion.h2>
        <p {...sx(bf.textSm, bf.tabularNums, bf.textSecondary)}>
          {formatDuration(plannedSeconds)} · {rounds} rounds
        </p>
      </div>
      <p {...sx(home.recPurpose)}>{protocol.purpose}</p>
      <p {...sx(bf.mt15, bf.textXs, bf.capitalize, bf.textTertiary)}>
        {protocol.evidenceLevel} evidence · {protocol.intensity}
        {advanced && ' · safety check required'}
      </p>

      <PhaseStrip protocol={protocol} animated={!reducedMotion} pigment={paint} style={bf.mt4} />

      <div {...sx(home.actions)}>
        <Link to={startPath} {...sx(btn.base, btn.primary, home.beginBtn)}>
          Begin
        </Link>
        <Link to={QUICK_PATH} {...sx(btn.base, btn.secondary)}>
          Breathe now · 1 min
        </Link>
      </div>
    </section>
  )
}

function AlternativeRow({ ranked }: { ranked: RankedProtocol }) {
  const { protocol, rounds, plannedSeconds } = ranked
  const paint = techniquePigment(protocol.id)
  return (
    <Link
      to={buildSessionPath({ techniqueId: protocol.id, rounds })}
      {...sx(home.altRow)}
      style={{ '--bf-mass': paint.mass, '--bf-glaze': paint.glaze } as CSSProperties}
    >
      <span aria-hidden="true" {...sx('bf-swatch', home.altSwatch)} />
      <span {...sx(bf.minW0, bf.flex1)}>
        <span {...sx('bf-display', home.altName)}>{protocol.name}</span>
        <span {...sx(bf.block, bf.textXs, bf.tabularNums, bf.textSecondary)}>
          {formatDuration(plannedSeconds)} · {rounds} rounds · <span {...sx(wc.italic)}>{paint.name}</span>
        </span>
      </span>
      <span {...sx(bf.shrink0, bf.textXs, bf.textTertiary)}>
        {isAdvancedProtocol(protocol) ? 'Safety check' : 'Open'}
      </span>
    </Link>
  )
}

function TechniqueSwatch({ protocolId, reducedMotion }: { protocolId: Parameters<typeof getProtocol>[0]; reducedMotion: boolean }) {
  const protocol = getProtocol(protocolId)
  const paint = techniquePigment(protocol.id)
  return (
    <motion.div
      whileHover={reducedMotion ? undefined : { y: -3 }}
      whileTap={reducedMotion ? undefined : { scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
    >
      <Link
        to={buildSessionPath({ techniqueId: protocol.id, rounds: protocol.defaultRounds })}
        {...sx(home.swatchCard)}
        style={{ '--bf-mass': paint.mass, '--bf-glaze': paint.glaze } as CSSProperties}
      >
        <span aria-hidden="true" {...sx('bf-swatch', home.swatchPaint)} />
        <span {...sx(home.swatchTitleRow)}>
          <span {...sx('bf-display', home.swatchName)}>{protocol.name}</span>
          {isAdvancedProtocol(protocol) && <span {...sx(home.safetyFlag)}>Safety check</span>}
        </span>
        <span {...sx(wc.italic, home.swatchPigment)}>{paint.name}</span>
        <span {...sx(home.swatchMeta)}>{protocol.description}</span>
        <span {...sx(home.swatchEvidence)}>
          {protocol.evidenceLevel} evidence · {protocol.intensity} · {protocol.breathsPerMinute} breaths/min
        </span>
      </Link>
    </motion.div>
  )
}

/** The last seven days as dabs of paint: filled where you practiced. */
function WeekDabs({ sessions }: { sessions: readonly CompletedSession[] }) {
  const days = useMemo(() => {
    const practiced = new Set(sessions.map((s) => getLocalDateKey(s.date)).filter(Boolean))
    const today = getLocalDayStart()
    return Array.from({ length: 7 }, (_, i) => {
      const date = addLocalDays(today, i - 6)
      return { key: formatLocalDateKey(date), label: date.toLocaleDateString(undefined, { weekday: 'narrow' }), done: practiced.has(formatLocalDateKey(date)) }
    })
  }, [sessions])
  const count = days.filter((d) => d.done).length

  return (
    <div role="img" aria-label={`Practiced ${count} of the last 7 days`} {...sx(home.week)}>
      {days.map((day) => (
        <span key={day.key} {...sx(home.weekDay)}>
          <span {...sx('bf-dab', home.weekDab, day.done && home.weekDabDone)} />
          <span {...sx(home.weekLabel)}>{day.label}</span>
        </span>
      ))}
    </div>
  )
}
