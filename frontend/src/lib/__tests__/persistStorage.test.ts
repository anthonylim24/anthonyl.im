// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { createBrowserJSONStorage } from '../persistStorage'

describe('createBrowserJSONStorage', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window')
    Reflect.deleteProperty(globalThis, 'document')
  })

  it('does not touch localStorage when no browser document is available', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        get localStorage() {
          throw new Error('localStorage should not be accessed outside the browser')
        },
      },
    })

    expect(createBrowserJSONStorage()).toBeUndefined()
  })
})
