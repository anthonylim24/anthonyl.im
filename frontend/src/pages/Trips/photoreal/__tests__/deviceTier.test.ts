import { describe, it, expect } from 'vitest'
import { detectTier, tierFromSignals, isAppleGpu } from '../deviceTier'

describe('deviceTier', () => {
  describe('detectTier', () => {
    it('returns one of low/medium/high', () => {
      const tier = detectTier()
      expect(['low', 'medium', 'high']).toContain(tier)
    })
  })

  describe('tierFromSignals', () => {
    it('classifies iPhone 17 Pro-class Apple GPU as high', () => {
      expect(isAppleGpu('Apple GPU')).toBe(true)
      expect(tierFromSignals({ cores: 6, mem: 0, dpr: 3, gpu: 'Apple GPU' })).toBe('high')
    })

    it('classifies a 3× phone with no unmasked renderer as high', () => {
      expect(tierFromSignals({ cores: 6, mem: 0, dpr: 3, gpu: '' })).toBe('high')
    })

    it('classifies Safari privacy (empty GPU, 4 cores, 3× DPR) as high', () => {
      expect(tierFromSignals({ cores: 4, mem: 0, dpr: 3, gpu: '' })).toBe('high')
    })

    it('does not demote a desktop GPU just because DPR is 3', () => {
      expect(tierFromSignals({ cores: 8, mem: 8, dpr: 3, gpu: 'NVIDIA GeForce RTX 4070' })).toBe('high')
    })

    it('keeps Mali / SwiftShader on low', () => {
      expect(tierFromSignals({ cores: 8, mem: 8, dpr: 2, gpu: 'Mali-G78' })).toBe('low')
      expect(tierFromSignals({ cores: 8, mem: 8, dpr: 1, gpu: 'Google SwiftShader' })).toBe('low')
    })
  })
})
