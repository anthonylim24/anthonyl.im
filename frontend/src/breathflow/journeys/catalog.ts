import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { plannedSessionSeconds } from '../protocols/cadence'
import { getProtocol } from '../protocols/catalog'
import { getRoundsForWindow } from '../recommend/recommendations'

/**
 * Journeys: a few days of practice in a set order, built only from the
 * published protocols (never a safety-gated one) so they add no technique and
 * no claim of their own. Ids are persisted — never rename them.
 */

export const JOURNEY_IDS = ['first_week', 'wind_down', 'steady_focus'] as const
export type JourneyId = typeof JOURNEY_IDS[number]

export interface JourneyStep {
  techniqueId: TechniqueId
  /** Target length; the round count is whatever lands closest. */
  seconds: number
  title: string
  /** One line of coaching for the day. */
  note: string
}

export interface Journey {
  id: JourneyId
  name: string
  blurb: string
  /** The technique whose pigment paints the journey. */
  pigment: TechniqueId
  steps: readonly JourneyStep[]
}

const T = TECHNIQUE_IDS

export const JOURNEYS: readonly Journey[] = [
  {
    id: 'first_week',
    name: 'First week',
    blurb: 'Seven short sessions that walk through the gentle techniques, a little longer each day.',
    pigment: T.CYCLIC_SIGHING,
    steps: [
      { techniqueId: T.CYCLIC_SIGHING, seconds: 120, title: 'The sigh', note: 'Two minutes. Learn the double inhale and the long way out.' },
      { techniqueId: T.DIAPHRAGMATIC_BREATHING, seconds: 180, title: 'Low and slow', note: 'Rest a hand on your belly and let it lead.' },
      { techniqueId: T.RESONANCE_BREATHING, seconds: 180, title: 'Six a minute', note: 'Even in, even out. Let the count carry you.' },
      { techniqueId: T.EXTENDED_EXHALE, seconds: 240, title: 'The long exhale', note: 'Make the way out the longest part of the breath.' },
      { techniqueId: T.BOX_BREATHING, seconds: 240, title: 'Four sides', note: 'Short holds. Shoulders stay soft through each one.' },
      { techniqueId: T.RESONANCE_BREATHING, seconds: 300, title: 'Settle in', note: 'Five minutes at the cadence you met on day three.' },
      { techniqueId: T.CYCLIC_SIGHING, seconds: 300, title: 'Full circle', note: 'The first technique again, at the full five minutes.' },
    ],
  },
  {
    id: 'wind_down',
    name: 'Wind down',
    blurb: 'Five evenings of exhale-heavy breathing to make a habit of slowing before bed.',
    pigment: T.FOUR_SEVEN_EIGHT,
    steps: [
      { techniqueId: T.EXTENDED_EXHALE, seconds: 180, title: 'Dim the lights', note: 'Three minutes, in bed or on the way there.' },
      { techniqueId: T.FOUR_SEVEN_EIGHT, seconds: 180, title: 'Four, seven, eight', note: 'Shorten the hold if it strains. Easy is the point.' },
      { techniqueId: T.RESONANCE_BREATHING, seconds: 300, title: 'A slow tide', note: 'Five even minutes. Eyes closed if you like.' },
      { techniqueId: T.FOUR_SEVEN_EIGHT, seconds: 240, title: 'One track', note: 'Give a busy head the count to follow.' },
      { techniqueId: T.EXTENDED_EXHALE, seconds: 300, title: 'Lights out', note: 'Finish, then stay where you are.' },
    ],
  },
  {
    id: 'steady_focus',
    name: 'Steady focus',
    blurb: 'Five sessions to take before the work that needs your whole attention.',
    pigment: T.BOX_BREATHING,
    steps: [
      { techniqueId: T.DIAPHRAGMATIC_BREATHING, seconds: 180, title: 'Clear the desk', note: 'Unclench first. Belly breathing, three minutes.' },
      { techniqueId: T.BOX_BREATHING, seconds: 180, title: 'Draw the box', note: 'Count each side. The counting is the practice.' },
      { techniqueId: T.RESONANCE_BREATHING, seconds: 240, title: 'Even keel', note: 'Six breaths a minute, then start the task.' },
      { techniqueId: T.BOX_BREATHING, seconds: 240, title: 'Hold the line', note: 'Four minutes. Notice when the mind leaves the count.' },
      { techniqueId: T.BOX_BREATHING, seconds: 300, title: 'Deep work', note: 'The full five, then straight into the work.' },
    ],
  },
]

const JOURNEY_BY_ID = new Map<string, Journey>(JOURNEYS.map((journey) => [journey.id, journey]))

export function isJourneyId(value: unknown): value is JourneyId {
  return typeof value === 'string' && JOURNEY_BY_ID.has(value)
}

export function getJourney(id: JourneyId): Journey {
  return JOURNEY_BY_ID.get(id) as Journey
}

/** The session a step prescribes: rounds chosen to land closest to its length. */
export function stepSession(step: JourneyStep): { techniqueId: TechniqueId; rounds: number; plannedSeconds: number } {
  const protocol = getProtocol(step.techniqueId)
  const rounds = getRoundsForWindow(protocol, step.seconds)
  return { techniqueId: protocol.id, rounds, plannedSeconds: plannedSessionSeconds(protocol, rounds) }
}

/** Index of the first step not yet done, or null once every step is. */
export function nextStepIndex(journey: Journey, done: readonly number[]): number | null {
  const index = journey.steps.findIndex((_, i) => !done.includes(i))
  return index === -1 ? null : index
}
