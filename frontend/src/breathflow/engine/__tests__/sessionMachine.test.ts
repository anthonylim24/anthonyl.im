import { describe, expect, it } from 'vitest'
import { getProtocol } from '../../protocols/catalog'
import type { CompletionResult } from '../../session/completeSession'
import { advanceOneSecond, getCurrentPhase, startCursor, type Cursor, type EngineConfig } from '../sessionEngine'
import {
  BACKGROUND_GRACE_MS,
  freshLeadIn,
  nextTickAt,
  reduceSession,
  sessionClock,
  SETUP,
  type Saved,
  type Session,
  type SessionEffect,
  type SessionEvent,
} from '../sessionMachine'

/** Box breathing, 4 s phases: 16 s a round. */
const box: EngineConfig = { protocol: getProtocol('box_breathing'), rounds: 2 }

function cursorAfter(seconds: number, config = box): Cursor {
  let cursor = startCursor(config)
  for (let i = 0; i < seconds; i++) cursor = advanceOneSecond(config, cursor).cursor
  return cursor
}

function running(seconds = 0, extra: Partial<Extract<Session, { tag: 'running' }>> = {}): Session {
  return { tag: 'running', cursor: cursorAfter(seconds), originMs: 0, applied: seconds, hiddenAt: null, ...extra }
}

function savedFor(rounds: number, plannedRounds: number, extra: Partial<CompletionResult> = {}): Saved {
  const result = {
    session: { id: 's1', rounds },
    xpEarned: 20,
    newBadgeIds: [],
    isPersonalBest: false,
    streak: 1,
    plannedRounds,
    ...extra,
  } as unknown as CompletionResult
  return { result, journey: null }
}

function run(session: Session, ...events: SessionEvent[]) {
  const effects: SessionEffect[] = []
  let current = session
  for (const event of events) {
    const [next, output] = reduceSession(box, current, event)
    current = next
    effects.push(...output)
  }
  return { session: current, effects }
}

const types = (effects: readonly SessionEffect[]) => effects.map((effect) => effect.type)
const cues = (effects: readonly SessionEffect[]) => effects.filter((effect) => effect.type === 'cue')

const STATES: Record<Session['tag'] | 'background', Session> = {
  setup: SETUP,
  leadIn: freshLeadIn(),
  running: running(5),
  paused: { tag: 'paused', cursor: cursorAfter(5), carryMs: 300, reason: 'user' },
  background: { tag: 'paused', cursor: cursorAfter(5), carryMs: 0, reason: 'background' },
  saving: { tag: 'saving', completion: { roundsCompleted: 2, plannedRounds: 2, holdTimes: [] } },
  summary: { tag: 'summary', ...savedFor(2, 2) },
}

const EVENTS: SessionEvent[] = [
  { type: 'START' },
  { type: 'REPEAT' },
  { type: 'LEAD_TICK', now: 6000 },
  { type: 'CANCEL' },
  { type: 'TICK', now: 6000 },
  { type: 'PAUSE', now: 6000 },
  { type: 'RESUME', now: 6000 },
  { type: 'HIDDEN', now: 6000 },
  { type: 'VISIBLE', now: 6000 },
  { type: 'RESTART', now: 6000 },
  { type: 'FINISH' },
  { type: 'SAVED', saved: savedFor(2, 2) },
  { type: 'LEAVE' },
]

/** Which events move each state, and where to. Everything else must be ignored. */
const TRANSITIONS: Record<keyof typeof STATES, Partial<Record<SessionEvent['type'], Session['tag']>>> = {
  setup: { START: 'leadIn' },
  leadIn: { LEAD_TICK: 'leadIn', CANCEL: 'setup', HIDDEN: 'setup', FINISH: 'setup', LEAVE: 'setup' },
  running: { TICK: 'running', PAUSE: 'paused', HIDDEN: 'running', RESTART: 'running', FINISH: 'setup', LEAVE: 'setup' },
  paused: { RESUME: 'running', RESTART: 'running', FINISH: 'setup', LEAVE: 'setup' },
  background: { RESUME: 'leadIn', VISIBLE: 'paused', RESTART: 'running', FINISH: 'setup', LEAVE: 'setup' },
  saving: { SAVED: 'summary', LEAVE: 'setup' },
  summary: { REPEAT: 'leadIn', LEAVE: 'setup' },
}

describe('session machine: the whole table', () => {
  for (const [name, state] of Object.entries(STATES) as [keyof typeof STATES, Session][]) {
    for (const event of EVENTS) {
      const expected = TRANSITIONS[name][event.type]
      it(`${name} + ${event.type} → ${expected ?? 'ignored'}`, () => {
        const [next, effects] = reduceSession(box, state, event)
        if (expected === undefined) {
          expect(next).toBe(state)
          expect(effects).toEqual([])
        } else {
          expect(next.tag).toBe(expected)
        }
      })
    }
  }
})

describe('session machine: lead-in', () => {
  it('Start counts down three seconds, then breathes from round 1 with one start cue', () => {
    const started = run(SETUP, { type: 'START' })
    expect(started.session).toEqual({ tag: 'leadIn', secondsLeft: 3, resumeAt: null })
    expect(types(started.effects)).toEqual(['speak', 'announce'])

    const counted = run(started.session, { type: 'LEAD_TICK', now: 1000 }, { type: 'LEAD_TICK', now: 2000 })
    expect(counted.session).toMatchObject({ tag: 'leadIn', secondsLeft: 1 })
    expect(counted.effects).toEqual([])

    const breathing = run(counted.session, { type: 'LEAD_TICK', now: 3000 })
    expect(breathing.session).toEqual({ tag: 'running', cursor: startCursor(box), originMs: 3000, applied: 0, hiddenAt: null })
    expect(cues(breathing.effects)).toEqual([{ type: 'cue', kind: 'start' }])
    expect(breathing.effects).toContainEqual({ type: 'vibrate', kind: 'success' })
  })

  it('Repeat then Cancel lands in setup, never in a finished engine', () => {
    const { session } = run(STATES.summary, { type: 'REPEAT' }, { type: 'CANCEL' })
    expect(session).toBe(SETUP)
  })

  it('Escape (FINISH) during the lead-in cancels it', () => {
    expect(run(freshLeadIn(), { type: 'FINISH' }).session).toBe(SETUP)
  })

  it('Restart is ignored outside a breathing session', () => {
    for (const state of [SETUP, freshLeadIn(), STATES.summary, STATES.saving]) {
      expect(reduceSession(box, state, { type: 'RESTART', now: 0 })[0]).toBe(state)
    }
  })
})

describe('session machine: the clock', () => {
  it('a second with no phase change says nothing', () => {
    const { session, effects } = run(running(0), { type: 'TICK', now: 1000 })
    expect(session).toMatchObject({ tag: 'running', applied: 1, cursor: { secondsLeftInPhase: 3 } })
    expect(effects).toEqual([])
  })

  it('an early timer callback changes nothing', () => {
    const state = running(0)
    expect(reduceSession(box, state, { type: 'TICK', now: 999 })[0]).toBe(state)
  })

  it('a phase change cues, vibrates, speaks and announces once', () => {
    const { effects } = run(running(3), { type: 'TICK', now: 4000 })
    expect(types(effects)).toEqual(['cue', 'vibrate', 'speak', 'announce'])
    expect(effects[0]).toEqual({ type: 'cue', kind: 'hold_in' })
  })

  it('a late timer applies every missed second but voices only the latest phase', () => {
    const { session, effects } = run(running(0), { type: 'TICK', now: 9500 })
    expect(session).toMatchObject({ tag: 'running', applied: 9 })
    if (session.tag !== 'running') throw new Error('expected running')
    expect(getCurrentPhase(box, session.cursor)).toBe('exhale')
    expect(cues(effects)).toEqual([{ type: 'cue', kind: 'exhale' }])
  })

  it('aims each timeout at the true end of the current second', () => {
    const state = running(2, { originMs: 500 })
    if (state.tag !== 'running') throw new Error('expected running')
    expect(nextTickAt(state)).toBe(3500)
  })

  it('the last second persists exactly once, then the summary celebrates once', () => {
    const last = running(31)
    const ended = run(last, { type: 'TICK', now: 32_000 }, { type: 'TICK', now: 40_000 }, { type: 'FINISH' })
    expect(ended.session).toEqual({ tag: 'saving', completion: { roundsCompleted: 2, plannedRounds: 2, holdTimes: [4, 4, 4, 4] } })
    expect(types(ended.effects)).toEqual(['persist'])

    const shown = run(ended.session, { type: 'SAVED', saved: savedFor(2, 2) }, { type: 'SAVED', saved: savedFor(2, 2) })
    expect(shown.session.tag).toBe('summary')
    expect(cues(shown.effects)).toEqual([{ type: 'cue', kind: 'complete' }])
    expect(shown.effects).toContainEqual({ type: 'speak', text: 'Session complete' })
  })

  it('a summary with a personal best celebrates', () => {
    const { effects } = run(STATES.saving, { type: 'SAVED', saved: savedFor(2, 2, { isPersonalBest: true }) })
    expect(effects).toContainEqual({ type: 'vibrate', kind: 'celebration' })
  })
})

describe('session machine: pause keeps the fraction of a second', () => {
  it('carries the ms already breathed across the pause', () => {
    const paused = run(running(2), { type: 'PAUSE', now: 2600 })
    expect(paused.session).toMatchObject({ tag: 'paused', carryMs: 600, reason: 'user' })

    const resumed = run(paused.session, { type: 'RESUME', now: 10_000 })
    expect(resumed.session).toMatchObject({ tag: 'running', originMs: 9400, applied: 0 })
    if (resumed.session.tag !== 'running') throw new Error('expected running')
    // The paused second finishes 400 ms after resuming, not a whole second later.
    expect(nextTickAt(resumed.session)).toBe(10_400)
    expect(sessionClock(resumed.session)?.secondStartMs).toBe(9400)
  })

  it('pausing many times never stretches the phase', () => {
    let state = running(0)
    let now = 0
    // Ten pauses of 30 s, each 300 ms into a second, across one 4 s inhale.
    for (let i = 0; i < 10; i++) {
      now += 300
      state = run(state, { type: 'TICK', now }, { type: 'PAUSE', now }).session
      now += 30_000
      state = run(state, { type: 'RESUME', now }).session
    }
    // 3 s of breathing so far: the inhale ends exactly 1 s later.
    expect(state).toMatchObject({ tag: 'running', cursor: { phaseIndex: 0, secondsLeftInPhase: 1 } })
    state = run(state, { type: 'TICK', now: now + 999 }).session
    expect(state).toMatchObject({ cursor: { phaseIndex: 0 } })
    state = run(state, { type: 'TICK', now: now + 1000 }).session
    expect(state).toMatchObject({ cursor: { phaseIndex: 1 } })
  })

  it('the first round discards on End; later rounds keep what was breathed', () => {
    const discarded = run(running(5), { type: 'FINISH' })
    expect(discarded.session).toBe(SETUP)
    expect(types(discarded.effects)).not.toContain('persist')

    const kept = run(running(18), { type: 'PAUSE', now: 18_200 }, { type: 'FINISH' })
    expect(kept.session).toEqual({ tag: 'saving', completion: { roundsCompleted: 1, plannedRounds: 2, holdTimes: [4, 4] } })
    expect(types(kept.effects)).toContain('persist')
  })
})

describe('session machine: the background', () => {
  it('a short glance away carries on, voicing only where the breath is now', () => {
    const { session, effects } = run(running(0), { type: 'HIDDEN', now: 500 }, { type: 'VISIBLE', now: 2900 })
    expect(session).toMatchObject({ tag: 'running', applied: 2, hiddenAt: null })
    expect(effects).toEqual([])
  })

  it('a long absence pauses at most a grace window past leaving, without a burst of cues', () => {
    const { session, effects } = run(running(0), { type: 'HIDDEN', now: 2000 }, { type: 'VISIBLE', now: 600_000 })
    expect(session).toMatchObject({ tag: 'paused', reason: 'background' })
    if (session.tag !== 'paused') throw new Error('expected paused')
    expect(session.cursor).toEqual(cursorAfter((2000 + BACKGROUND_GRACE_MS) / 1000))
    expect(types(effects)).not.toContain('cue')
    expect(types(effects)).not.toContain('vibrate')
    expect(types(effects)).not.toContain('persist')
    expect(effects[effects.length - 1]).toMatchObject({ type: 'announce', text: expect.stringMatching(/^Welcome back/) })
  })

  it('a session nobody breathed never completes', () => {
    const { session, effects } = run(running(0), { type: 'HIDDEN', now: 100 }, { type: 'TICK', now: 3_600_000 })
    expect(session.tag).toBe('paused')
    expect(types(effects)).not.toContain('persist')
  })

  it('the clock firing in the background pauses too', () => {
    const { session } = run(running(0), { type: 'HIDDEN', now: 0 }, { type: 'TICK', now: 3000 })
    expect(session).toMatchObject({ tag: 'paused', reason: 'background' })
  })

  it('returning restarts the current phase from its beginning after a lead-in', () => {
    const away = run(running(0), { type: 'HIDDEN', now: 1000 }, { type: 'VISIBLE', now: 60_000 }).session
    if (away.tag !== 'paused') throw new Error('expected paused')
    expect(getCurrentPhase(box, away.cursor)).toBe('hold_in') // 4 s in

    const leadIn = run(away, { type: 'RESUME', now: 70_000 })
    expect(leadIn.session).toMatchObject({ tag: 'leadIn', secondsLeft: 3, resumeAt: { phaseIndex: 1, secondsLeftInPhase: 4, heldSecondsThisPhase: 0 } })
    expect(leadIn.effects).toContainEqual({ type: 'announce', text: expect.stringMatching(/Hold again from the beginning/) })

    const back = run(leadIn.session, { type: 'LEAD_TICK', now: 71_000 }, { type: 'LEAD_TICK', now: 72_000 }, { type: 'LEAD_TICK', now: 73_000 })
    expect(back.session).toMatchObject({ tag: 'running', originMs: 73_000, applied: 0, cursor: { phaseIndex: 1, secondsLeftInPhase: 4 } })
    expect(cues(back.effects)).toEqual([{ type: 'cue', kind: 'hold_in' }])
  })

  it('cancelling the return lead-in goes back to the welcome, not to setup', () => {
    const away: Session = STATES.background
    const { session } = run(away, { type: 'RESUME', now: 0 }, { type: 'CANCEL' })
    expect(session).toMatchObject({ tag: 'paused', reason: 'background' })
  })

  it('leaving during a lead-in does not start breathing unseen', () => {
    expect(run(freshLeadIn(), { type: 'HIDDEN', now: 0 }).session).toBe(SETUP)
    const returning = run(STATES.background, { type: 'RESUME', now: 0 }, { type: 'HIDDEN', now: 10 }).session
    expect(returning).toMatchObject({ tag: 'paused', reason: 'background' })
  })

  it('a user pause stays a user pause across the background', () => {
    const { session } = run(STATES.paused, { type: 'HIDDEN', now: 0 }, { type: 'VISIBLE', now: 60_000 })
    expect(session).toBe(STATES.paused)
  })
})

describe('session clock for the visuals', () => {
  it('waits at the start of the phase a return lead-in will pick up', () => {
    const leadIn = run(STATES.background, { type: 'RESUME', now: 0 }).session
    expect(sessionClock(leadIn)).toMatchObject({ status: 'paused', carryMs: 0, cursor: { secondsLeftInPhase: 4 } })
    expect(sessionClock(freshLeadIn())).toBeNull()
    expect(sessionClock(SETUP)).toBeNull()
  })
})
