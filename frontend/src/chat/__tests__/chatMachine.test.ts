import { describe, expect, it } from 'vitest'
import { MAKING, MAKING_STEP_MS, chatReducer, initialChat, makingLine, moodFor, type ChatEvent, type ChatState } from '../chatMachine'
import type { ChatMessage } from '../conversation'

const send = (over: Partial<Extract<ChatEvent, { type: 'SEND' }>> = {}): ChatEvent => ({
  type: 'SEND',
  text: 'Who is Anthony?',
  retry: false,
  userId: 'u1',
  replyId: 'r1',
  at: 1000,
  intercept: false,
  ...over,
})
const chunk = (content: string, worldAware = true, replyId = 'r1'): ChatEvent => ({ type: 'CHUNK', replyId, content, worldAware, at: 2000 })
const run = (events: ChatEvent[], from: ChatState = initialChat([])) => events.reduce(chatReducer, from)
const reply = (s: ChatState) => s.messages[s.messages.length - 1]

describe('chatReducer', () => {
  it('walks a plain answer from waiting through streaming to done', () => {
    const asked = run([send()])
    expect(asked.turn).toEqual({ phase: 'waiting', replyId: 'r1' })
    expect(asked.messages).toEqual([
      { id: 'u1', role: 'user', content: 'Who is Anthony?', timestamp: 1000 },
      { id: 'r1', role: 'assistant', content: '', timestamp: 1000, status: 'streaming' },
    ])
    const streaming = run([chunk('An engineer')], asked)
    expect(streaming.turn.phase).toBe('streaming')
    expect(reply(streaming).content).toBe('An engineer')
    const done = run([{ type: 'STREAM_END', replyId: 'r1', content: 'An engineer.' }], streaming)
    expect(done.turn).toEqual({ phase: 'idle' })
    expect(done.lastOutcome).toBe('answered')
    expect(reply(done)).toMatchObject({ content: 'An engineer.', status: 'done' })
  })

  it('ignores a send while a turn is under way, and an empty one', () => {
    const asked = run([send()])
    expect(chatReducer(asked, send({ replyId: 'r2' }))).toBe(asked)
    const idle = initialChat([])
    expect(chatReducer(idle, send({ text: '' }))).toBe(idle)
  })

  it('drops events for a reply that no longer owns the chat', () => {
    const asked = run([send()])
    expect(chatReducer(asked, chunk('stale', true, 'old'))).toBe(asked)
    const reset = run([{ type: 'RESET' }], asked)
    expect(reset).toEqual(initialChat([]))
    expect(chatReducer(reset, chunk('late'))).toBe(reset)
    expect(chatReducer(reset, { type: 'FAIL', replyId: 'r1', error: 'x', partial: null })).toBe(reset)
  })

  it('keeps every other message identical while one reply streams', () => {
    const asked = run([send()])
    const next = chatReducer(asked, chunk('Hi'))
    expect(next.messages[0]).toBe(asked.messages[0])
    expect(next.messages[1]).not.toBe(asked.messages[1])
  })

  it('answers from an intercept, or falls through to the model', () => {
    const intercepting = run([send({ intercept: true })])
    expect(intercepting.turn.phase).toBe('intercepting')
    // Chunks cannot arrive before the model is asked.
    expect(chatReducer(intercepting, chunk('x'))).toBe(intercepting)
    const hit = chatReducer(intercepting, { type: 'INTERCEPT_HIT', replyId: 'r1', text: 'A ball!' })
    expect(reply(hit)).toMatchObject({ content: 'A ball!', sent: '', status: 'done' })
    expect(hit.lastOutcome).toBe('local')
    const miss = chatReducer(intercepting, { type: 'INTERCEPT_MISS', replyId: 'r1' })
    expect(miss.turn).toEqual({ phase: 'waiting', replyId: 'r1' })
  })

  it('holds back what might become a world order, then shows it when it does not', () => {
    const undecided = run([send(), chunk('@')])
    expect(undecided.turn).toEqual({ phase: 'undecided', replyId: 'r1', buffered: '@' })
    expect(reply(undecided).content).toBe('')
    const shown = chatReducer(undecided, chunk('@anthony on GitHub.'))
    expect(shown.turn.phase).toBe('streaming')
    expect(reply(shown).content).toBe('@anthony on GitHub.')
    // A page without Lim's world never holds anything back.
    expect(run([send(), chunk('@', false)]).turn.phase).toBe('streaming')
  })

  it('an undecided reply that ends is the whole answer', () => {
    const done = run([send(), chunk('@'), { type: 'STREAM_END', replyId: 'r1', content: '@' }])
    expect(reply(done)).toMatchObject({ content: '@', status: 'done' })
  })

  it('turns a world order into ordering, withdraws any preface, and settles on the order result', () => {
    const prefaced = run([send(), chunk('Sure!')])
    expect(reply(prefaced).content).toBe('Sure!')
    const ordering = chatReducer(prefaced, chunk('Sure!\n@@world {"ops":['))
    expect(ordering.turn).toEqual({ phase: 'ordering', replyId: 'r1', startedAt: 2000 })
    expect(reply(ordering).content).toBe('')
    // The rest of the order is not shown, and the stream ending alone does not settle it.
    expect(chatReducer(ordering, chunk('Sure!\n@@world {"ops":[{}]}'))).toBe(ordering)
    expect(chatReducer(ordering, { type: 'STREAM_END', replyId: 'r1', content: 'x' })).toBe(ordering)
    // A failure mid-order is Lim's to own up to (ORDER_RESULT), not a chat error.
    expect(chatReducer(ordering, { type: 'FAIL', replyId: 'r1', error: 'x', partial: null })).toBe(ordering)
    const done = chatReducer(ordering, { type: 'ORDER_RESULT', replyId: 'r1', text: 'A pinwheel!', order: '@@world {...}' })
    expect(reply(done)).toMatchObject({ content: 'A pinwheel!', sent: '@@world {...}', status: 'done' })
    expect(done.lastOutcome).toBe('local')
  })

  it('keeps a failure apart from the text, with what had arrived', () => {
    const failed = run([send(), chunk('Half an'), { type: 'FAIL', replyId: 'r1', error: 'I lost the connection.', partial: null }])
    expect(reply(failed)).toMatchObject({ content: 'Half an', status: 'error', error: 'I lost the connection.' })
    expect(failed.lastOutcome).toBe('failed')
    const withPartial = run([send(), { type: 'FAIL', replyId: 'r1', error: 'x', partial: 'From the error' }])
    expect(reply(withPartial).content).toBe('From the error')
  })

  it('stops with what was said, and with nothing of a half-written order', () => {
    const stopped = run([send(), chunk('Well, first'), { type: 'STOP', replyId: 'r1' }])
    expect(reply(stopped)).toMatchObject({ content: 'Well, first', status: 'stopped' })
    expect(stopped.lastOutcome).toBe('stopped')
    const undecided = run([send(), chunk('`'), { type: 'STOP', replyId: 'r1' }])
    expect(reply(undecided).content).toBe('`')
    const ordering = run([send(), chunk('@@world {"ops":['), { type: 'STOP', replyId: 'r1' }])
    expect(reply(ordering)).toMatchObject({ content: '', status: 'stopped' })
  })

  it('retries the last question in place of its reply', () => {
    const failed = run([send(), { type: 'FAIL', replyId: 'r1', error: 'x', partial: null }])
    const again = chatReducer(failed, send({ text: '', retry: true, userId: 'u2', replyId: 'r2', at: 3000 }))
    expect(again.messages.map((m) => [m.id, m.content])).toEqual([
      ['u2', 'Who is Anthony?'],
      ['r2', ''],
    ])
    // Nothing to retry: nothing happens.
    const empty = initialChat([])
    expect(chatReducer(empty, send({ retry: true }))).toBe(empty)
  })

  it('CALM clears the last outcome, and is a no-op when there is none', () => {
    const failed = run([send(), { type: 'FAIL', replyId: 'r1', error: 'x', partial: null }])
    expect(chatReducer(failed, { type: 'CALM' }).lastOutcome).toBe('none')
    const calm = initialChat([])
    expect(chatReducer(calm, { type: 'CALM' })).toBe(calm)
  })

  it('starts a new turn with a clean mood', () => {
    const failed = run([send(), { type: 'FAIL', replyId: 'r1', error: 'x', partial: null }])
    expect(chatReducer(failed, send({ userId: 'u2', replyId: 'r2' })).lastOutcome).toBe('none')
  })
})

describe('moodFor', () => {
  const idle = { phase: 'idle' } as const
  it('follows the phase, then the outcome, then typing', () => {
    expect(moodFor({ phase: 'waiting', replyId: 'r' }, 'none', true)).toBe('thinking')
    expect(moodFor({ phase: 'ordering', replyId: 'r', startedAt: 0 }, 'none', false)).toBe('thinking')
    expect(moodFor({ phase: 'streaming', replyId: 'r' }, 'none', false)).toBe('talking')
    expect(moodFor(idle, 'failed', true)).toBe('sad')
    expect(moodFor(idle, 'answered', true)).toBe('happy')
    expect(moodFor(idle, 'stopped', true)).toBe('typing')
    expect(moodFor(idle, 'local', false)).toBe('idle')
  })
})

describe('makingLine', () => {
  const ordering = { phase: 'ordering', replyId: 'r', startedAt: 10_000 } as const
  it('steps through the lines, then cycles the last three', () => {
    expect(makingLine({ phase: 'idle' }, 0)).toBeNull()
    expect(makingLine(ordering, 10_000)).toBe(MAKING[0])
    expect(makingLine(ordering, 10_000 + MAKING_STEP_MS)).toBe(MAKING[1])
    const tail = MAKING.slice(-3)
    for (let n = MAKING.length; n < MAKING.length + 6; n++) {
      expect(tail).toContain(makingLine(ordering, 10_000 + n * MAKING_STEP_MS))
    }
  })
})

describe('initialChat', () => {
  it('starts idle on the saved messages', () => {
    const saved: ChatMessage[] = [{ id: 'u', role: 'user', content: 'hi', timestamp: 1 }]
    expect(initialChat(saved)).toEqual({ messages: saved, turn: { phase: 'idle' }, lastOutcome: 'none' })
  })
})
