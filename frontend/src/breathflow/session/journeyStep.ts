import { nextStepIndex, type Journey } from '../journeys/catalog'

/** How a session moved its journey along, for the summary. */
export interface JourneyOutcome {
  name: string
  /** 1-based day this session was. */
  day: number
  total: number
  /** This session finished the whole journey. */
  finished: boolean
  /** Title of the next day, or null when none is left. */
  next: string | null
}

/**
 * A journey day counts only when it is the day that comes next (days are
 * breathed in order) and at least half of its planned rounds were breathed,
 * so a session ended a minute in does not tick the day off.
 */
export function earnsJourneyStep(input: {
  journey: Journey
  step: number
  done: readonly number[]
  roundsCompleted: number
  plannedRounds: number
}): boolean {
  if (nextStepIndex(input.journey, input.done) !== input.step) return false
  return input.roundsCompleted * 2 >= input.plannedRounds
}
