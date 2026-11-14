import type { CSSProperties } from 'react'
import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usePracticeStore } from '@/stores/practiceStore'
import { sx, stylex } from '@/styles/merge'
import { getJourney, JOURNEYS, nextStepIndex, stepSession, type Journey } from '../journeys/catalog'
import { techniquePigment } from '../pigments'
import { getProtocol } from '../protocols/catalog'
import { buildSessionPath } from '../session/urlParams'
import { bf } from '../styles/breathflow.stylex'
import { wc } from '../styles/watercolor.stylex'
import { btn } from './buttonStyles.stylex'
import { formatDuration } from './format'

const focusRing = {
  outlineWidth: '2px',
  outlineStyle: 'solid',
  outlineColor: 'var(--bw-accent)',
  outlineOffset: '3px',
} as const

const styles = stylex.create({
  active: {
    padding: { default: '1.25rem', '@media (min-width: 640px)': '1.6rem' },
    borderRadius: '1.6rem',
    backgroundColor: 'color-mix(in srgb, var(--bw-surface) 72%, transparent)',
    boxShadow: 'inset 0 0 0 1px var(--bw-border-subtle), 0 24px 60px -36px rgba(39, 35, 31, 0.35)',
  },
  activeTitle: {
    marginTop: '0.45rem',
    fontSize: 'clamp(1.65rem, 3.2vw, 2.2rem)',
    lineHeight: 1.05,
    letterSpacing: '-0.02em',
    color: 'var(--bw-text)',
  },
  note: {
    marginTop: '0.6rem',
    maxWidth: '34rem',
    fontSize: '0.9rem',
    lineHeight: 1.6,
    color: 'var(--bw-text-secondary)',
  },
  steps: {
    marginTop: '1.1rem',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.45rem',
  },
  step: {
    display: 'block',
    width: '1.15rem',
    height: '1.15rem',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--bw-text) 20%, transparent)',
  },
  stepDone: {
    backgroundColor: 'color-mix(in srgb, var(--bf-mass) 72%, transparent)',
    boxShadow: 'none',
  },
  stepNext: {
    boxShadow: 'inset 0 0 0 2px var(--bf-mass)',
  },
  actions: {
    marginTop: '1.4rem',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.6rem',
  },
  list: {
    display: 'grid',
    gap: '0.5rem',
    gridTemplateColumns: { default: 'minmax(0, 1fr)', '@media (min-width: 900px)': 'repeat(3, minmax(0, 1fr))' },
  },
  listBelow: {
    marginTop: '1rem',
    gridTemplateColumns: { default: 'minmax(0, 1fr)', '@media (min-width: 760px)': 'repeat(2, minmax(0, 1fr))' },
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '1rem',
    borderRadius: '1.1rem',
    boxShadow: 'inset 0 0 0 1px var(--bw-border-subtle)',
  },
  swatch: {
    display: 'block',
    width: '100%',
    height: '1.6rem',
    borderRadius: '0.45rem',
  },
  cardName: {
    marginTop: '0.75rem',
    fontSize: '1.3rem',
    lineHeight: 1.15,
    color: 'var(--bw-text)',
  },
  cardMeta: {
    marginTop: '0.2rem',
    fontSize: '0.75rem',
    fontVariantNumeric: 'lining-nums tabular-nums',
    color: 'var(--bw-text-tertiary)',
  },
  cardBlurb: {
    marginTop: '0.5rem',
    marginBottom: '0.9rem',
    flex: '1 1 auto',
    fontSize: '0.85rem',
    lineHeight: 1.55,
    color: 'var(--bw-text-secondary)',
    textWrap: 'pretty',
  },
  textBtn: {
    minHeight: '44px',
    paddingInline: '0.75rem',
    borderRadius: '999px',
    fontSize: '0.875rem',
    color: 'var(--bw-text-secondary)',
    backgroundColor: 'transparent',
    ':hover': { color: 'var(--bw-text)', backgroundColor: 'var(--bw-hover)' },
    ':focus-visible': focusRing,
  },
  finished: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    color: 'color-mix(in oklab, var(--bf-mass), var(--bw-text) 30%)',
  },
})

function pigmentVars(journey: Journey): CSSProperties {
  const paint = techniquePigment(journey.pigment)
  return { '--bf-ink': paint.mass, '--bf-mass': paint.mass, '--bf-glaze': paint.glaze } as CSSProperties
}

function lengthRange(journey: Journey): string {
  const minutes = journey.steps.map((step) => Math.round(step.seconds / 60))
  const low = Math.min(...minutes)
  const high = Math.max(...minutes)
  return `${journey.steps.length} days · ${low === high ? low : `${low} to ${high}`} min a day`
}

/**
 * Home's journeys: the one under way with its next step ready to begin, and
 * the others to start. Progress lives in the practice store.
 */
export function JourneysSection() {
  const activeId = usePracticeStore((state) => state.activeJourneyId)
  const progress = usePracticeStore((state) => state.journeys)
  const startJourney = usePracticeStore((state) => state.startJourney)
  const leaveJourney = usePracticeStore((state) => state.leaveJourney)

  const active = activeId ? getJourney(activeId) : null
  const activeDone = activeId ? progress[activeId]?.done ?? [] : []
  const nextIndex = active ? nextStepIndex(active, activeDone) : null
  const others = JOURNEYS.filter((journey) => journey.id !== active?.id)

  return (
    <section {...sx(wc.section)} aria-labelledby="bf-journeys">
      <div {...sx(wc.sectionHead)}>
        <h2 id="bf-journeys" {...sx('bf-display', wc.sectionTitle)}>Journeys</h2>
        <p {...sx(bf.textSm, bf.textSecondary)}>A few days of practice, in order.</p>
      </div>

      {active && (
        <div {...sx(styles.active)} style={pigmentVars(active)}>
          {nextIndex === null ? (
            <>
              <p {...sx(wc.eyebrow)}>{active.name}</p>
              <h3 {...sx('bf-display', styles.activeTitle)}>
                All {active.steps.length} days, <span {...sx(wc.italic)}>done.</span>
              </h3>
              <p {...sx(styles.note)}>Start it again whenever you like, or pick another below.</p>
              <StepDabs journey={active} done={activeDone} next={null} />
              <div {...sx(styles.actions)}>
                <button type="button" {...sx(btn.base, btn.secondary)} onClick={() => startJourney(active.id)}>
                  Start again
                </button>
                <button type="button" {...sx(styles.textBtn)} onClick={leaveJourney}>
                  Put it away
                </button>
              </div>
            </>
          ) : (
            <ActiveStep journey={active} done={activeDone} index={nextIndex} onLeave={leaveJourney} />
          )}
        </div>
      )}

      <ul {...sx(styles.list, active && styles.listBelow)}>
        {others.map((journey) => {
          const done = progress[journey.id]?.done ?? []
          const finished = done.length >= journey.steps.length
          return (
            <li key={journey.id}>
              <div {...sx(styles.card)} style={pigmentVars(journey)}>
                <span aria-hidden="true" {...sx('bf-swatch', styles.swatch)} />
                <h3 {...sx('bf-display', styles.cardName)}>{journey.name}</h3>
                <p {...sx(styles.cardMeta)}>
                  {finished ? (
                    <span {...sx(styles.finished)}>
                      <Check size={12} strokeWidth={2.25} aria-hidden="true" />
                      Finished
                    </span>
                  ) : done.length > 0 ? `Day ${done.length} of ${journey.steps.length} done` : lengthRange(journey)}
                </p>
                <p {...sx(styles.cardBlurb)}>{journey.blurb}</p>
                <button
                  type="button"
                  {...sx(btn.base, btn.secondary)}
                  aria-label={`${finished ? 'Start again' : done.length > 0 ? 'Resume' : 'Begin'}: ${journey.name}`}
                  onClick={() => startJourney(journey.id)}
                >
                  {finished ? 'Start again' : done.length > 0 ? 'Resume' : 'Begin'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function ActiveStep({ journey, done, index, onLeave }: { journey: Journey; done: readonly number[]; index: number; onLeave: () => void }) {
  const step = journey.steps[index]
  const session = stepSession(step)
  const path = `${buildSessionPath({ ...session, journey: { id: journey.id, step: index } })}&autostart=1`

  return (
    <>
      <p {...sx(wc.eyebrow)}>
        {journey.name} · day {index + 1} of {journey.steps.length}
      </p>
      <h3 {...sx('bf-display', styles.activeTitle)}>{step.title}</h3>
      <p {...sx(bf.mt15, bf.textSm, bf.tabularNums, bf.textSecondary)}>
        {getProtocol(step.techniqueId).name} · {formatDuration(session.plannedSeconds)}
      </p>
      <p {...sx(styles.note)}>{step.note}</p>
      <StepDabs journey={journey} done={done} next={index} />
      <div {...sx(styles.actions)}>
        <Link to={path} {...sx(btn.base, btn.primary)}>
          {done.length === 0 ? 'Begin day 1' : `Continue · day ${index + 1}`}
        </Link>
        <button type="button" {...sx(styles.textBtn)} onClick={onLeave}>
          Leave journey
        </button>
      </div>
    </>
  )
}

function StepDabs({ journey, done, next }: { journey: Journey; done: readonly number[]; next: number | null }) {
  return (
    <div
      role="img"
      aria-label={`${done.length} of ${journey.steps.length} days done`}
      {...sx(styles.steps)}
    >
      {journey.steps.map((step, i) => (
        <span
          key={`${step.title}-${i}`}
          {...sx('bf-dab', styles.step, done.includes(i) && styles.stepDone, i === next && styles.stepNext)}
        />
      ))}
    </div>
  )
}
