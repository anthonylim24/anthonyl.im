// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getJourney } from '@/breathflow/journeys/catalog'
import type { CompletedSession } from '@/stores/historyStore'
import { getDefaultPracticeState, type PersistedPracticeState } from '@/stores/practiceStore'
import { DEFAULT_SETTINGS_STATE } from '@/stores/settingsStore'
import { mergeJourneyProgress, mergePractice, mergeSettings, mergeSnapshots, mergeXP } from '../merge'
import { emptySnapshot, type Snapshot } from '../snapshot'

function session(id: string, date: string, extra: Partial<CompletedSession> = {}): CompletedSession {
  return {
    id, techniqueId: 'box_breathing', date, durationSeconds: 120, rounds: 3,
    holdTimes: [], maxHoldTime: 0, avgHoldTime: 0, ...extra,
  }
}

function snapshot(patch: { [K in keyof Snapshot]?: Partial<Snapshot[K]> }): Snapshot {
  const base = emptySnapshot()
  return {
    history: { ...base.history, ...patch.history },
    gamification: { ...base.gamification, ...patch.gamification },
    settings: { ...base.settings, ...patch.settings },
    practice: { ...base.practice, ...patch.practice },
  }
}

const sortedIds = (s: Snapshot) => s.history.sessions.map((x) => x.id).sort()

describe('mergeXP', () => {
  it('adds what each device earned from the same starting point', () => {
    // Both devices synced at 100; this one earned 30, the other pushed 150.
    expect(mergeXP(130, 150, 100)).toBe(180)
  })

  it('adds nothing when this device has earned nothing since', () => {
    expect(mergeXP(100, 150, 100)).toBe(150)
    expect(mergeXP(150, 150, 150)).toBe(150)
  })

  it('anonymous progress on a first sign-in counts in full', () => {
    expect(mergeXP(40, 500, 0)).toBe(540)
  })

  it('with no recorded base, keeps the larger total (never double-counts)', () => {
    expect(mergeXP(500, 300, null)).toBe(500)
    expect(mergeXP(300, 500, null)).toBe(500)
  })

  it('is idempotent once the base has caught up', () => {
    const merged = mergeXP(130, 150, 100)
    expect(mergeXP(merged, 150, 150)).toBe(merged)
  })
})

describe('mergeSettings', () => {
  const dark = { ...DEFAULT_SETTINGS_STATE, theme: 'dark' as const, updatedAt: 200 }
  const loud = { ...DEFAULT_SETTINGS_STATE, soundVolume: 0.9, updatedAt: 100 }

  it('takes the more recently changed copy, either way round', () => {
    expect(mergeSettings(dark, loud)).toBe(dark)
    expect(mergeSettings(loud, dark)).toBe(dark)
  })

  it('a reload with untouched defaults never overwrites the cloud (the lost-settings bug)', () => {
    const cloudFromBefore = { ...DEFAULT_SETTINGS_STATE, theme: 'dark' as const, updatedAt: 0 }
    expect(mergeSettings({ ...DEFAULT_SETTINGS_STATE }, cloudFromBefore)).toBe(cloudFromBefore)
  })

  it('unstamped local changes still win over unstamped cloud defaults', () => {
    const local = { ...DEFAULT_SETTINGS_STATE, hapticsEnabled: false }
    expect(mergeSettings(local, { ...DEFAULT_SETTINGS_STATE })).toBe(local)
  })

  it('is idempotent', () => {
    for (const [a, b] of [[dark, loud], [loud, dark], [dark, dark]]) {
      const once = mergeSettings(a, b)
      expect(mergeSettings(once, b)).toEqual(once)
    }
  })
})

describe('mergeJourneyProgress', () => {
  const steps = getJourney('first_week').steps.length

  it('unions the steps under the earlier start', () => {
    const a = { startedAt: '2026-05-01T00:00:00.000Z', done: [0, 1] }
    const b = { startedAt: '2026-05-02T00:00:00.000Z', done: [1, 2] }
    const merged = mergeJourneyProgress('first_week', a, b)
    expect(merged.startedAt).toBe(a.startedAt)
    expect([...merged.done].sort()).toEqual([0, 1, 2])
  })

  it('is commutative (as a set of steps) and idempotent', () => {
    const cases = [
      [{ startedAt: '2026-05-01T00:00:00.000Z', done: [0, 3] }, { startedAt: '2026-05-03T00:00:00.000Z', done: [1] }],
      [{ startedAt: '2026-05-01T00:00:00.000Z', done: [] }, { startedAt: '2026-05-01T00:00:00.000Z', done: [2, 0] }],
    ] as const
    for (const [a, b] of cases) {
      const ab = mergeJourneyProgress('first_week', { ...a, done: [...a.done] }, { ...b, done: [...b.done] })
      const ba = mergeJourneyProgress('first_week', { ...b, done: [...b.done] }, { ...a, done: [...a.done] })
      expect(ab.startedAt).toBe(ba.startedAt)
      expect([...ab.done].sort()).toEqual([...ba.done].sort())
      expect(mergeJourneyProgress('first_week', ab, ab)).toEqual(ab)
    }
  })

  it('a restart after finishing is the journey now under way', () => {
    const finished = { startedAt: '2026-04-01T00:00:00.000Z', done: Array.from({ length: steps }, (_, i) => i) }
    const restarted = { startedAt: '2026-05-01T00:00:00.000Z', done: [0] }
    expect(mergeJourneyProgress('first_week', finished, restarted)).toEqual(restarted)
    expect(mergeJourneyProgress('first_week', restarted, finished)).toEqual(restarted)
  })
})

describe('mergePractice', () => {
  const base = getDefaultPracticeState()

  it('keeps the goal and active journey changed most recently, independently', () => {
    const phone: PersistedPracticeState = {
      ...base,
      dailyGoalMinutes: 10,
      goalUpdatedAt: 300,
      activeJourneyId: 'wind_down',
      activeJourneyUpdatedAt: 100,
      journeys: { wind_down: { startedAt: '2026-05-01T00:00:00.000Z', done: [0] } },
    }
    const laptop: PersistedPracticeState = {
      ...base,
      dailyGoalMinutes: 15,
      goalUpdatedAt: 200,
      activeJourneyId: 'first_week',
      activeJourneyUpdatedAt: 400,
      journeys: { first_week: { startedAt: '2026-05-02T00:00:00.000Z', done: [0, 1] } },
    }
    for (const merged of [mergePractice(phone, laptop), mergePractice(laptop, phone)]) {
      expect(merged.dailyGoalMinutes).toBe(10)
      expect(merged.activeJourneyId).toBe('first_week')
      expect(Object.keys(merged.journeys).sort()).toEqual(['first_week', 'wind_down'])
    }
  })

  it('leaving a journey on one device is kept when it is the newer change', () => {
    const left = { ...base, activeJourneyId: null, activeJourneyUpdatedAt: 500, journeys: { wind_down: { startedAt: '2026-05-01T00:00:00.000Z', done: [0] } } }
    const stale = { ...base, activeJourneyId: 'wind_down' as const, activeJourneyUpdatedAt: 100, journeys: left.journeys }
    expect(mergePractice(stale, left).activeJourneyId).toBeNull()
  })

  it('is idempotent', () => {
    const a = { ...base, dailyGoalMinutes: 10, goalUpdatedAt: 5, journeys: { wind_down: { startedAt: '2026-05-01T00:00:00.000Z', done: [1] } } }
    const once = mergePractice(a, base)
    expect(mergePractice(once, base)).toEqual(once)
    expect(mergePractice(once, once)).toEqual(once)
  })
})

describe('mergeSnapshots', () => {
  const own = { xpBase: 0, prefer: 'cloud' as const, localIsOwn: true }

  it('unions sessions from both sides and keeps progress from each', () => {
    const local = snapshot({
      history: { sessions: [session('a', '2026-05-02T10:00:00.000Z'), session('b', '2026-05-01T10:00:00.000Z')] },
      gamification: { xp: 30, earnedBadges: ['first_session'] },
    })
    const cloud = snapshot({
      history: { sessions: [session('b', '2026-05-01T10:00:00.000Z'), session('c', '2026-04-30T10:00:00.000Z')] },
      gamification: { xp: 200, earnedBadges: ['streak_3'] },
    })
    const merged = mergeSnapshots(local, cloud, own)
    expect(merged.history.sessions.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(merged.gamification.xp).toBe(230)
    expect(merged.gamification.earnedBadges.sort()).toEqual(['first_session', 'streak_3'])
  })

  it('the history merge is commutative on which sessions survive, and idempotent', () => {
    const left = snapshot({ history: { sessions: [session('a', '2026-05-02T10:00:00.000Z'), session('b', '2026-05-01T10:00:00.000Z')] } })
    const right = snapshot({ history: { sessions: [session('c', '2026-05-03T10:00:00.000Z'), session('b', '2026-05-01T10:00:00.000Z')] } })
    const lr = mergeSnapshots(left, right, own)
    const rl = mergeSnapshots(right, left, own)
    expect(sortedIds(lr)).toEqual(sortedIds(rl))
    expect(mergeSnapshots(lr, right, { ...own, xpBase: lr.gamification.xp })).toEqual(lr)
  })

  it('a shared session takes the preferred side whole, so a cleared rating stays cleared', () => {
    const cleared = snapshot({ history: { sessions: [session('a', '2026-05-02T10:00:00.000Z', { localDay: '2026-05-02' })] } })
    const rated = snapshot({ history: { sessions: [session('a', '2026-05-02T10:00:00.000Z', { moodAfter: 4 })] } })
    const local = mergeSnapshots(cleared, rated, { ...own, prefer: 'local' }).history.sessions[0]
    expect(local).not.toHaveProperty('moodAfter')
    const cloud = mergeSnapshots(cleared, rated, own).history.sessions[0]
    expect(cloud.moodAfter).toBe(4)
    // The cloud has no column for the local day: it is kept from this device either way.
    expect(cloud.localDay).toBe('2026-05-02')
  })

  it('an erase on another device drops what this device held from before it', () => {
    const local = snapshot({
      history: { sessions: [session('old', '2026-05-01T10:00:00.000Z'), session('new', '2026-05-05T10:00:00.000Z')] },
      gamification: { xp: 500, earnedBadges: ['first_session'] },
      settings: { theme: 'dark', updatedAt: 10 },
    })
    const cloud = snapshot({ history: { resetAt: '2026-05-03T00:00:00.000Z' } })
    const merged = mergeSnapshots(local, cloud, { ...own, xpBase: 500 })
    expect(merged.history.sessions.map((s) => s.id)).toEqual(['new'])
    expect(merged.history.resetAt).toBe('2026-05-03T00:00:00.000Z')
    expect(merged.gamification).toEqual(cloud.gamification)
    expect(merged.settings).toEqual(cloud.settings)
  })

  it("a clear made before signing in never erases the account's history", () => {
    const local = snapshot({ history: { resetAt: '2026-05-10T00:00:00.000Z' } })
    const cloud = snapshot({ history: { sessions: [session('kept', '2026-05-01T10:00:00.000Z')] } })
    const merged = mergeSnapshots(local, cloud, { xpBase: null, prefer: 'cloud', localIsOwn: false })
    expect(merged.history.sessions.map((s) => s.id)).toEqual(['kept'])
    expect(merged.history.resetAt).toBeNull()
  })

  it('a clear made on this device by the owner reaches the cloud copy', () => {
    const local = snapshot({ history: { resetAt: '2026-05-10T00:00:00.000Z' } })
    const cloud = snapshot({ history: { sessions: [session('gone', '2026-05-01T10:00:00.000Z')] } })
    const merged = mergeSnapshots(local, cloud, own)
    expect(merged.history.sessions).toEqual([])
    expect(merged.history.resetAt).toBe('2026-05-10T00:00:00.000Z')
  })
})
