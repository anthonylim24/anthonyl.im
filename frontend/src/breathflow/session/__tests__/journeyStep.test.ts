import { describe, expect, it } from 'vitest'
import { getJourney } from '../../journeys/catalog'
import { earnsJourneyStep } from '../journeyStep'

const journey = getJourney('first_week')

describe('earnsJourneyStep', () => {
  it('counts the next day when at least half its rounds were breathed', () => {
    expect(earnsJourneyStep({ journey, step: 0, done: [], roundsCompleted: 10, plannedRounds: 10 })).toBe(true)
    expect(earnsJourneyStep({ journey, step: 0, done: [], roundsCompleted: 5, plannedRounds: 10 })).toBe(true)
    expect(earnsJourneyStep({ journey, step: 2, done: [0, 1], roundsCompleted: 2, plannedRounds: 3 })).toBe(true)
  })

  it('does not count a day ended before half', () => {
    expect(earnsJourneyStep({ journey, step: 0, done: [], roundsCompleted: 4, plannedRounds: 10 })).toBe(false)
    expect(earnsJourneyStep({ journey, step: 0, done: [], roundsCompleted: 1, plannedRounds: 3 })).toBe(false)
  })

  it('does not count a day out of order, or one already done', () => {
    expect(earnsJourneyStep({ journey, step: 3, done: [0], roundsCompleted: 10, plannedRounds: 10 })).toBe(false)
    expect(earnsJourneyStep({ journey, step: 0, done: [0], roundsCompleted: 10, plannedRounds: 10 })).toBe(false)
    expect(earnsJourneyStep({ journey, step: 0, done: [0, 1, 2, 3, 4, 5, 6], roundsCompleted: 10, plannedRounds: 10 })).toBe(false)
  })
})
