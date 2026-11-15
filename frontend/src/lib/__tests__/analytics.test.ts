// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getPostHogConfig, hasAnalyticsPrivacyOptOut, loadInflectTracking, shouldLoadInflect } from '../analytics'

describe('Inflect tracking', () => {
  it('skips sign-in and Trips, whose URLs carry tokens', () => {
    for (const path of ['/trips', '/trips/join/abc', '/korea', '/sign-in', '/sign-up', '/preview/pr/4/trips/x']) {
      expect(shouldLoadInflect(path, {})).toBe(false)
    }
    for (const path of ['/', '/lab', '/breathwork/session', '/tripsy']) {
      expect(shouldLoadInflect(path, {})).toBe(true)
    }
  })

  it('honours the same opt-out signals as PostHog', () => {
    expect(shouldLoadInflect('/', { globalPrivacyControl: true })).toBe(false)
    expect(shouldLoadInflect('/', { doNotTrack: '1' })).toBe(false)
  })

  it('adds one async script with its tracking key', () => {
    const appended: Record<string, unknown>[] = []
    const doc = {
      querySelector: () => (appended.length ? {} : null),
      createElement: () => ({ dataset: {} }),
      head: { appendChild: (el: Record<string, unknown>) => appended.push(el) },
    } as unknown as Document
    expect(loadInflectTracking(doc, '/', {})).toBe(true)
    expect(loadInflectTracking(doc, '/', {})).toBe(false)
    expect(appended).toHaveLength(1)
    expect(appended[0]).toMatchObject({
      src: 'https://www.useinflect.ai/inflect-tracking.js',
      async: true,
      dataset: { trackingKey: expect.stringMatching(/^inf_/) },
    })
  })
})

describe('getPostHogConfig', () => {
  it('returns null when no PostHog key is configured', () => {
    expect(getPostHogConfig({})).toBeNull()
    expect(getPostHogConfig({ VITE_POSTHOG_KEY: '   ' })).toBeNull()
  })

  it('uses the default US PostHog host when only a key is configured', () => {
    expect(getPostHogConfig({ VITE_POSTHOG_KEY: 'phc_project' })).toEqual({
      key: 'phc_project',
      apiHost: 'https://us.i.posthog.com',
    })
  })

  it('trims the key and accepts a custom PostHog host', () => {
    expect(
      getPostHogConfig({
        VITE_POSTHOG_KEY: '  phc_project  ',
        VITE_POSTHOG_HOST: '  https://eu.i.posthog.com  ',
      })
    ).toEqual({
      key: 'phc_project',
      apiHost: 'https://eu.i.posthog.com',
    })
  })

  it('detects browser privacy opt-out signals', () => {
    expect(hasAnalyticsPrivacyOptOut({ globalPrivacyControl: true })).toBe(true)
    expect(hasAnalyticsPrivacyOptOut({ doNotTrack: '1' })).toBe(true)
    expect(hasAnalyticsPrivacyOptOut({ doNotTrack: '0' })).toBe(false)
    expect(hasAnalyticsPrivacyOptOut(undefined)).toBe(false)
  })

  it('does not configure PostHog when browser privacy signals opt out', () => {
    expect(
      getPostHogConfig(
        { VITE_POSTHOG_KEY: 'phc_project' },
        { globalPrivacyControl: true }
      )
    ).toBeNull()
    expect(
      getPostHogConfig(
        { VITE_POSTHOG_KEY: 'phc_project' },
        { doNotTrack: '1' }
      )
    ).toBeNull()
  })
})
