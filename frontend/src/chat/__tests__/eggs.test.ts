import { describe, expect, it } from 'vitest'
import { konami, stuntFor } from '../eggs'

describe('typed easter eggs', () => {
  it('finds the trick a message names', () => {
    expect(stuntFor('Can Lim do a backflip?')).toBe('flip')
    expect(stuntFor('spin for me')).toBe('spin')
    expect(stuntFor('I love this')).toBe('love')
    expect(stuntFor('hello there')).toBe('wave')
    expect(stuntFor('good night Lim')).toBe('sleep')
    expect(stuntFor('BOOO')).toBe('boo')
  })

  it('leaves ordinary questions alone', () => {
    expect(stuntFor("What is Anthony's background?")).toBeNull()
    expect(stuntFor('What are his biggest projects?')).toBeNull()
    expect(stuntFor('Tell me about his bookshelf')).toBeNull()
    expect(stuntFor('Which popular tools does he use?')).toBeNull()
  })

  it('only greets when the message opens with the greeting', () => {
    expect(stuntFor('say hi to him for me')).toBeNull()
  })

  it('recognises the Konami code, and only the whole of it', () => {
    const code = konami()
    const keys = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b']
    expect(keys.map(code).some(Boolean)).toBe(false)
    expect(code('A')).toBe(true)
    expect(code('a')).toBe(false)
  })
})
