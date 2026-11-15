import { PHASE_LABELS, type BreathPhase } from '@/lib/constants'
import { getCoachingCue, LEAD_IN_CUE, LEAD_IN_SECONDS } from '../protocols/coaching'
import type { CompletionResult } from '../session/completeSession'
import type { JourneyOutcome } from '../session/journeyStep'
import type { CueKind } from './audio'
import { phaseHaptic, type HapticKind } from './haptics'
import {
  advanceOneSecond,
  getCurrentPhase,
  getCurrentPhaseSeconds,
  restartPhase,
  startCursor,
  type Cursor,
  type EngineConfig,
  type EngineStatus,
} from './sessionEngine'
import { phasePhrase } from './voice'

/**
 * A breathing session as one pure state machine. `reduceSession` decides
 * what a session becomes and lists what should happen as a result (cues,
 * speech, haptics, announcements, persistence); `useSessionEngine` performs
 * those effects and drives the clock. Every mode is one tag, so a lead-in
 * while running, or a summary nobody earned, cannot be written down.
 *
 * Times (`now`, `originMs`) are `performance.now()` milliseconds.
 */

export type LeadInSecond = 1 | 2 | 3

export interface Completion {
  roundsCompleted: number
  plannedRounds: number
  holdTimes: readonly number[]
}

export interface Saved {
  result: CompletionResult
  journey: JourneyOutcome | null
}

export type Session =
  | { tag: 'setup' }
  /** "Get ready". `resumeAt` is the phase a return from the background picks up at; null for a fresh start. */
  | { tag: 'leadIn'; secondsLeft: LeadInSecond; resumeAt: Cursor | null }
  /**
   * Breathing. Second n of the clock ends at `originMs + n * 1000`; `applied`
   * seconds of it are already in `cursor`. `hiddenAt` is when the page went
   * into the background, while it is there.
   */
  | { tag: 'running'; cursor: Cursor; originMs: number; applied: number; hiddenAt: number | null }
  /** `carryMs` is how far into the current second the pause landed (0 … 999). */
  | { tag: 'paused'; cursor: Cursor; carryMs: number; reason: 'user' | 'background' }
  /** The persist effect is running; it answers with SAVED. Never rendered on its own. */
  | { tag: 'saving'; completion: Completion }
  | { tag: 'summary'; result: CompletionResult; journey: JourneyOutcome | null }

export type SessionEvent =
  | { type: 'START' }
  | { type: 'REPEAT' }
  | { type: 'LEAD_TICK'; now: number }
  | { type: 'CANCEL' }
  | { type: 'TICK'; now: number }
  | { type: 'PAUSE'; now: number }
  | { type: 'RESUME'; now: number }
  | { type: 'HIDDEN'; now: number }
  | { type: 'VISIBLE'; now: number }
  | { type: 'RESTART'; now: number }
  | { type: 'FINISH' }
  | { type: 'SAVED'; saved: Saved }
  | { type: 'LEAVE' }

export type SessionEffect =
  | { type: 'cue'; kind: CueKind }
  | { type: 'speak'; text: string }
  /** Stop any speech in progress. */
  | { type: 'hush' }
  | { type: 'vibrate'; kind: HapticKind }
  | { type: 'announce'; text: string }
  | { type: 'persist'; completion: Completion }

export type Transition = readonly [Session, readonly SessionEffect[]]

/**
 * A page hidden this long is treated as stepped away: the session pauses
 * instead of breathing on unseen. Shorter glances (a notification) carry on.
 */
export const BACKGROUND_GRACE_MS = 3000

export const SETUP: Session = { tag: 'setup' }

export function freshLeadIn(): Session {
  return { tag: 'leadIn', secondsLeft: LEAD_IN_SECONDS, resumeAt: null }
}

export function reduceSession(config: EngineConfig, session: Session, event: SessionEvent): Transition {
  const same: Transition = [session, []]
  switch (event.type) {
    case 'START':
      return session.tag === 'setup' ? beginLeadIn(config) : same
    case 'REPEAT':
      return session.tag === 'summary' ? beginLeadIn(config) : same
    case 'LEAVE':
      return session.tag === 'setup' ? same : [SETUP, [{ type: 'hush' }]]
    case 'LEAD_TICK':
      return session.tag === 'leadIn' ? leadTick(config, session, event.now) : same
    case 'CANCEL':
      if (session.tag !== 'leadIn') return same
      return session.resumeAt
        ? [background(session.resumeAt), [{ type: 'hush' }, { type: 'announce', text: 'Cancelled. Still paused.' }]]
        : [SETUP, [{ type: 'hush' }, { type: 'announce', text: 'Cancelled.' }]]
    case 'TICK':
      return session.tag === 'running' ? tick(config, session, event.now) : same
    case 'PAUSE':
      if (session.tag !== 'running') return same
      return [
        { tag: 'paused', cursor: session.cursor, carryMs: carryOf(session, event.now), reason: 'user' },
        [{ type: 'hush' }, { type: 'vibrate', kind: 'light' }, { type: 'announce', text: 'Paused.' }],
      ]
    case 'RESUME':
      if (session.tag !== 'paused') return same
      if (session.reason === 'background') return returnLeadIn(config, session.cursor)
      return [
        { tag: 'running', cursor: session.cursor, originMs: event.now - session.carryMs, applied: 0, hiddenAt: null },
        [{ type: 'vibrate', kind: 'light' }, { type: 'announce', text: 'Resumed.' }],
      ]
    case 'HIDDEN':
      if (session.tag === 'running') return session.hiddenAt === null ? [{ ...session, hiddenAt: event.now }, []] : same
      if (session.tag === 'leadIn') {
        return session.resumeAt
          ? [background(session.resumeAt), [{ type: 'hush' }]]
          : [SETUP, [{ type: 'hush' }, { type: 'announce', text: 'Cancelled.' }]]
      }
      return same
    case 'VISIBLE':
      if (session.tag === 'running' && session.hiddenAt !== null) {
        if (event.now - session.hiddenAt < BACKGROUND_GRACE_MS) {
          return tick(config, { ...session, hiddenAt: null }, event.now)
        }
        const [next, effects] = tick(config, session, event.now)
        return next.tag === 'paused' ? [next, [...effects, welcomeBack(config, next.cursor)]] : [next, effects]
      }
      if (session.tag === 'paused' && session.reason === 'background') return [session, [welcomeBack(config, session.cursor)]]
      return same
    case 'RESTART':
      if (session.tag !== 'running' && session.tag !== 'paused') return same
      return [
        { tag: 'running', cursor: startCursor(config), originMs: event.now, applied: 0, hiddenAt: null },
        [
          { type: 'cue', kind: 'start' },
          firstPhrase(config),
          { type: 'vibrate', kind: 'light' },
          { type: 'announce', text: `Restarted. Round 1 of ${config.rounds}.` },
        ],
      ]
    case 'FINISH':
      if (session.tag === 'leadIn') return reduceSession(config, session, { type: 'CANCEL' })
      if (session.tag !== 'running' && session.tag !== 'paused') return same
      // Inside the first round there is nothing worth keeping.
      if (session.cursor.roundIndex === 0) {
        return [SETUP, [
          { type: 'hush' },
          { type: 'vibrate', kind: 'error' },
          { type: 'announce', text: 'Ended before the first round finished. Nothing was saved.' },
        ]]
      }
      return complete(config, session.cursor.roundIndex, session.cursor.holdTimes)
    case 'SAVED':
      return session.tag === 'saving' ? saved(config, event.saved) : same
  }
}

function beginLeadIn(config: EngineConfig): Transition {
  return [freshLeadIn(), [
    { type: 'speak', text: 'Get ready' },
    { type: 'announce', text: `Get ready. ${config.protocol.name} starts in ${LEAD_IN_SECONDS} seconds. ${LEAD_IN_CUE}` },
  ]]
}

function returnLeadIn(config: EngineConfig, cursor: Cursor): Transition {
  const resumeAt = restartPhase(config, cursor)
  const label = PHASE_LABELS[getCurrentPhase(config, resumeAt)]
  return [{ tag: 'leadIn', secondsLeft: LEAD_IN_SECONDS, resumeAt }, [
    { type: 'speak', text: 'Get ready' },
    { type: 'announce', text: `Get ready. ${label} again from the beginning, in ${LEAD_IN_SECONDS} seconds.` },
  ]]
}

function leadTick(config: EngineConfig, session: Extract<Session, { tag: 'leadIn' }>, now: number): Transition {
  if (session.secondsLeft > 1) {
    return [{ ...session, secondsLeft: (session.secondsLeft - 1) as LeadInSecond }, []]
  }
  if (session.resumeAt) {
    return [
      { tag: 'running', cursor: session.resumeAt, originMs: now, applied: 0, hiddenAt: null },
      phaseEffects(config, session.resumeAt),
    ]
  }
  const cursor = startCursor(config)
  const phase = getCurrentPhase(config, cursor)
  return [
    { tag: 'running', cursor, originMs: now, applied: 0, hiddenAt: null },
    [
      { type: 'cue', kind: 'start' },
      firstPhrase(config),
      { type: 'vibrate', kind: 'success' },
      {
        type: 'announce',
        text: `${config.protocol.name} started. Round 1 of ${config.rounds}. ${PHASE_LABELS[phase]} for ${formatPhaseSeconds(getCurrentPhaseSeconds(config, cursor))}.`,
      },
    ],
  ]
}

/**
 * Apply every second that is due. Seconds the timer missed (a late callback,
 * a brief trip to the background) are applied to the cursor, but only the
 * last phase change is voiced: one cue for where the breath is now, never a
 * burst of every phase that went by.
 */
function tick(config: EngineConfig, session: Extract<Session, { tag: 'running' }>, now: number): Transition {
  const away = session.hiddenAt !== null && now - session.hiddenAt >= BACKGROUND_GRACE_MS
  // Nothing is breathed past the grace window: an unseen page does not finish a session.
  const until = away && session.hiddenAt !== null ? Math.min(now, session.hiddenAt + BACKGROUND_GRACE_MS) : now
  const due = Math.floor((until - session.originMs) / 1000)

  let { cursor, applied } = session
  let phaseChanged = false
  while (applied < due) {
    const step = advanceOneSecond(config, cursor)
    applied += 1
    if (step.boundary === 'complete') return complete(config, config.rounds, step.cursor.holdTimes)
    cursor = step.cursor
    if (step.boundary === 'phase') phaseChanged = true
  }

  if (away) {
    return [
      background(cursor),
      [{ type: 'hush' }, { type: 'announce', text: 'Paused while you were away.' }],
    ]
  }
  if (applied === session.applied) return [session, []]
  return [{ ...session, cursor, applied }, phaseChanged ? phaseEffects(config, cursor) : []]
}

function complete(config: EngineConfig, roundsCompleted: number, holdTimes: readonly number[]): Transition {
  const completion: Completion = { roundsCompleted, plannedRounds: config.rounds, holdTimes }
  return [{ tag: 'saving', completion }, [{ type: 'persist', completion }]]
}

function saved(config: EngineConfig, { result, journey }: Saved): Transition {
  const early = result.session.rounds < result.plannedRounds
  const name = config.protocol.name
  return [{ tag: 'summary', result, journey }, [
    { type: 'cue', kind: 'complete' },
    { type: 'speak', text: early ? 'Session ended' : 'Session complete' },
    { type: 'vibrate', kind: result.isPersonalBest || result.newBadgeIds.length > 0 ? 'celebration' : 'success' },
    {
      type: 'announce',
      text: early
        ? `Ended early. ${name}, ${result.session.rounds} of ${result.plannedRounds} rounds kept. ${result.xpEarned} XP earned.`
        : `Session complete. ${name}, ${result.session.rounds} rounds. ${result.xpEarned} XP earned.`,
    },
  ]]
}

function background(cursor: Cursor): Session {
  return { tag: 'paused', cursor, carryMs: 0, reason: 'background' }
}

function welcomeBack(config: EngineConfig, cursor: Cursor): SessionEffect {
  const label = PHASE_LABELS[getCurrentPhase(config, cursor)]
  return {
    type: 'announce',
    text: `Welcome back. Paused at round ${cursor.roundIndex + 1} of ${config.rounds}. Continue when you are ready; ${label} starts again from the beginning.`,
  }
}

function carryOf(session: Extract<Session, { tag: 'running' }>, now: number): number {
  return Math.min(999, Math.max(0, now - session.originMs - session.applied * 1000))
}

function firstPhrase(config: EngineConfig): SessionEffect {
  const cursor = startCursor(config)
  return { type: 'speak', text: phasePhrase(getCurrentPhase(config, cursor), getCurrentPhaseSeconds(config, cursor)) }
}

function phaseEffects(config: EngineConfig, cursor: Cursor): SessionEffect[] {
  const phase: BreathPhase = getCurrentPhase(config, cursor)
  const seconds = getCurrentPhaseSeconds(config, cursor)
  return [
    { type: 'cue', kind: phase },
    { type: 'vibrate', kind: phaseHaptic(phase) },
    { type: 'speak', text: phasePhrase(phase, seconds) },
    {
      type: 'announce',
      text: `Round ${cursor.roundIndex + 1} of ${config.rounds}. ${PHASE_LABELS[phase]} for ${formatPhaseSeconds(seconds)}. ${getCoachingCue(config.protocol.id, phase)}`,
    },
  ]
}

function formatPhaseSeconds(seconds: number): string {
  return seconds === 1 ? '1 second' : `${seconds} seconds`
}

/** When the running clock's next second ends. */
export function nextTickAt(session: Extract<Session, { tag: 'running' }>): number {
  return session.originMs + (session.applied + 1) * 1000
}

/** Where the breath is, for the visuals: the cursor plus the sub-second position. */
export interface SessionClock {
  cursor: Cursor
  status: EngineStatus
  /** Running: when the current second began. */
  secondStartMs: number
  /** Paused: how far into the current second the pause landed. */
  carryMs: number
}

export function sessionClock(session: Session): SessionClock | null {
  switch (session.tag) {
    case 'running':
      return { cursor: session.cursor, status: 'running', secondStartMs: session.originMs + session.applied * 1000, carryMs: 0 }
    case 'paused':
      return { cursor: session.cursor, status: 'paused', secondStartMs: 0, carryMs: session.carryMs }
    case 'leadIn':
      // A return waits at the start of the phase it will pick up.
      return session.resumeAt ? { cursor: session.resumeAt, status: 'paused', secondStartMs: 0, carryMs: 0 } : null
    default:
      return null
  }
}
