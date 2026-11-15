import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import type { LimSceneOptions } from '../scene/limScene'

const scene = {
  dispose: vi.fn(),
  setMood: vi.fn(),
  setNight: vi.fn(),
  world: () => ({ items: [], place: null }),
}

/** When the fake scene paints its first frame, relative to `createLimScene` resolving. */
let firstFrame: 'before' | 'after' = 'before'

vi.mock('../scene/limScene', () => ({
  createLimScene: async (opts: LimSceneOptions) => {
    if (firstFrame === 'before') opts.onFirstFrame?.()
    else setTimeout(() => opts.onFirstFrame?.(), 0)
    return scene
  },
}))

import { LimStage } from '../LimStage'

const stageKind = (container: HTMLElement) => container.querySelector('[data-stage]')?.getAttribute('data-stage')

describe('LimStage', () => {
  beforeEach(() => {
    vi.stubGlobal('WebGL2RenderingContext', class {})
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('goes live when the first frame lands before the scene is handed back', async () => {
    firstFrame = 'before'
    const { container } = render(<LimStage mood="idle" night={false} />)
    await waitFor(() => expect(stageKind(container)).toBe('live'))
  })

  it('goes live when the first frame lands after the scene is handed back', async () => {
    firstFrame = 'after'
    const { container } = render(<LimStage mood="idle" night={false} />)
    await waitFor(() => expect(stageKind(container)).toBe('live'))
  })
})
