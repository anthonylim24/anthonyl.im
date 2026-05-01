// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getPostHogConfig } from '../analytics'

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
})
