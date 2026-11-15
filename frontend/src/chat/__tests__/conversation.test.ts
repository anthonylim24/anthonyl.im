import { describe, expect, it } from 'vitest'
import { FALLBACK_ERROR, HISTORY_MAX, MAX_MESSAGE, clampTurn, readStored, toHistory, toPrompt, toStored, type ChatMessage } from '../conversation'
import { followUps, prefillFrom, SUGGESTIONS } from '../suggestions'

const user = (id: string, content: string): ChatMessage => ({ id, role: 'user', content, timestamp: 0 })
const lim = (id: string, content: string, extra: Partial<ChatMessage> = {}): ChatMessage =>
  ({ id, role: 'assistant', content, timestamp: 0, status: 'done', ...extra }) as ChatMessage

describe('clampTurn', () => {
  it('leaves anything within the cap alone', () => {
    expect(clampTurn('short', 'user')).toBe('short')
    const exact = 'x'.repeat(MAX_MESSAGE)
    expect(clampTurn(exact, 'assistant')).toBe(exact)
  })

  it('keeps the start of a question and the end of a reply, within the cap', () => {
    const long = `${'a'.repeat(MAX_MESSAGE)}END`
    const q = clampTurn(long, 'user')
    expect(q.length).toBe(MAX_MESSAGE)
    expect(q.startsWith('aaa')).toBe(true)
    expect(q.endsWith('…')).toBe(true)
    const r = clampTurn(`START${'b'.repeat(MAX_MESSAGE)}`, 'assistant')
    expect(r.length).toBe(MAX_MESSAGE)
    expect(r.startsWith('…')).toBe(true)
    expect(r.endsWith('bbb')).toBe(true)
  })

  it('never splits an emoji in half', () => {
    const emoji = '😀'
    const q = clampTurn(`${'a'.repeat(9)}${emoji.repeat(5)}`, 'user', 11)
    expect(q).toBe(`${'a'.repeat(9)}…`)
    const r = clampTurn(`${emoji.repeat(5)}`, 'assistant', 4)
    expect(r).toBe(`…${emoji}`)
  })
})

describe('toHistory', () => {
  it('clamps a long reply so the next question is not rejected', () => {
    const history = toHistory([user('u', 'Write me a novel'), lim('a', 'z'.repeat(20_000))])
    expect(history).toHaveLength(2)
    expect(history.every((t) => t.content.length <= MAX_MESSAGE)).toBe(true)
  })

  it('sends at most HISTORY_MAX turns, starting on a question', () => {
    const many: ChatMessage[] = []
    for (let i = 0; i < 40; i++) many.push(user(`u${i}`, `q${i}`), lim(`a${i}`, `a${i}`))
    const history = toHistory(many)
    expect(history.length).toBeLessThanOrEqual(HISTORY_MAX)
    expect(history[0].role).toBe('user')
    expect(history[history.length - 1]).toEqual({ role: 'assistant', content: 'a39' })
  })

  it('leaves out failed replies, empty ones and toy-box answers', () => {
    const history = toHistory([
      user('u1', 'one'),
      lim('a1', 'partial', { status: 'error', error: 'x' } as Partial<ChatMessage>),
      user('u2', 'give him a ball'),
      lim('a2', 'A ball!', { sent: '' }),
      user('u3', 'two'),
      lim('a3', 'Two.'),
    ])
    expect(history).toEqual([
      { role: 'user', content: 'two' },
      { role: 'assistant', content: 'Two.' },
    ])
  })
})

describe('toPrompt', () => {
  it('trims and caps the question', () => {
    expect(toPrompt('  hi  ')).toBe('hi')
    expect(toPrompt('   ')).toBe('')
    expect(toPrompt('q'.repeat(MAX_MESSAGE + 50)).length).toBe(MAX_MESSAGE)
  })
})

describe('stored conversation', () => {
  it('reads old saves: a ⚠️ error moves out of the text, a half reply becomes stopped', () => {
    const raw = JSON.stringify([
      { id: 'u', role: 'user', content: 'hi', timestamp: 1 },
      { id: 'a', role: 'assistant', content: 'Half a\n\n⚠️ Response timed out — please try again.', timestamp: 2, status: 'error' },
      { id: 'b', role: 'assistant', content: '⚠️ HTTP error! status: 400', timestamp: 3, status: 'error' },
      { id: 'c', role: 'assistant', content: 'cut', timestamp: 4, status: 'streaming' },
      { id: 'd', role: 'assistant', content: 'odd', timestamp: 5, status: 'error' },
      { id: 'e', role: 'assistant', content: 'old', timestamp: 6 },
      { nope: true },
      null,
      { id: 'f', role: 'system', content: 'x' },
    ])
    expect(readStored(raw)).toEqual([
      { id: 'u', role: 'user', content: 'hi', timestamp: 1 },
      { id: 'a', role: 'assistant', content: 'Half a', timestamp: 2, status: 'error', error: 'Response timed out — please try again.' },
      { id: 'b', role: 'assistant', content: '', timestamp: 3, status: 'error', error: 'HTTP error! status: 400' },
      { id: 'c', role: 'assistant', content: 'cut', timestamp: 4, status: 'stopped' },
      { id: 'd', role: 'assistant', content: 'odd', timestamp: 5, status: 'error', error: FALLBACK_ERROR },
      { id: 'e', role: 'assistant', content: 'old', timestamp: 6, status: 'done' },
    ])
  })

  it('survives garbage', () => {
    expect(readStored(null)).toEqual([])
    expect(readStored('{')).toEqual([])
    expect(readStored('{"a":1}')).toEqual([])
  })

  it('writes a reply still being written as stopped, and round-trips', () => {
    const messages: ChatMessage[] = [user('u', 'hi'), lim('a', 'Hal', { status: 'streaming' }), lim('b', 'x', { status: 'error', error: 'Oops' } as Partial<ChatMessage>)]
    const stored = toStored(messages)
    expect(stored[1]).toMatchObject({ status: 'stopped', content: 'Hal' })
    expect(readStored(JSON.stringify(stored))).toEqual(stored)
  })
})

describe('followUps', () => {
  const idle = { phase: 'idle' } as const
  it('offers the opening questions not yet asked, under a settled reply', () => {
    const chat = [user('u', SUGGESTIONS[0].text), lim('a', 'He builds things.')]
    expect(followUps(chat, idle).map((s) => s.text)).toEqual(SUGGESTIONS.slice(1, 4).map((s) => s.text))
  })

  it('offers nothing while a reply is under way, after a failure or a stop, or once all are asked', () => {
    const chat = [user('u', 'hi'), lim('a', 'Hello.')]
    expect(followUps(chat, { phase: 'streaming', replyId: 'a' })).toEqual([])
    expect(followUps([user('u', 'hi'), lim('a', '', { status: 'error', error: 'x' } as Partial<ChatMessage>)], idle)).toEqual([])
    expect(followUps([user('u', 'hi'), lim('a', 'Hal', { status: 'stopped' })], idle)).toEqual([])
    const all = SUGGESTIONS.flatMap((s, i) => [user(`u${i}`, s.text), lim(`a${i}`, 'ok')])
    expect(followUps(all, idle)).toEqual([])
  })
})

describe('prefillFrom', () => {
  it('reads ?q=, trimmed and capped; nothing otherwise', () => {
    expect(prefillFrom(new URLSearchParams('q=%20What%20does%20he%20do%3F%20'))).toBe('What does he do?')
    expect(prefillFrom(new URLSearchParams('q='))).toBeNull()
    expect(prefillFrom(new URLSearchParams(''))).toBeNull()
    expect(prefillFrom(new URLSearchParams({ q: 'x'.repeat(MAX_MESSAGE + 10) }))?.length).toBe(MAX_MESSAGE)
  })
})
