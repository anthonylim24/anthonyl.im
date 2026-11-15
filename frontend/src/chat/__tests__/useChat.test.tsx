import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY, useChat } from '../useChat'
import { HttpStatusError } from '../../effect/errors'
import { isReloadBlocked } from '../../lib/serviceWorker'

type Invoke = (
  prompt: string,
  history: { role: string; content: string }[],
  onUpdate?: (content: string) => void,
  signal?: AbortSignal,
  world?: unknown,
) => Promise<{ content: string }>

const invoke = vi.fn<Invoke>()
vi.mock('../../lib/apiService', () => ({
  invokeDeepseek: (...args: Parameters<Invoke>) => invoke(...args),
}))

/** A reply the test streams by hand. */
function deferredReply() {
  let onUpdate: ((c: string) => void) | undefined
  let signal: AbortSignal | undefined
  let resolve!: () => void
  let reject!: (e: unknown) => void
  invoke.mockImplementationOnce((_p, _h, cb, sig) => {
    onUpdate = cb
    signal = sig
    return new Promise((res, rej) => {
      resolve = () => res({ content: '' })
      reject = rej
      sig?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
    })
  })
  return {
    chunk: (c: string) => act(() => onUpdate?.(c)),
    finish: () => act(async () => resolve()),
    fail: (e: unknown) => act(async () => reject(e)),
    signal: () => signal,
  }
}

const last = <T,>(list: T[]) => list[list.length - 1]

beforeEach(() => {
  localStorage.clear()
  invoke.mockReset()
})
afterEach(() => vi.restoreAllMocks())

describe('useChat', () => {
  it('streams a reply, fires mascot events, and persists the settled chat', async () => {
    const events = { onSend: vi.fn(), onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
    const reply = deferredReply()
    const { result } = renderHook(() => useChat(events))

    act(() => {
      expect(result.current.send('  Who is Anthony?  ')).toBe(true)
    })
    expect(events.onSend).toHaveBeenCalledOnce()
    expect(result.current.turn.phase).toBe('waiting')
    expect(invoke.mock.calls[0][0]).toBe('Who is Anthony?')

    reply.chunk('A staff')
    reply.chunk('A staff engineer.')
    expect(result.current.turn.phase).toBe('streaming')
    expect(events.onChunk).toHaveBeenCalledTimes(2)
    expect(last(result.current.messages)).toMatchObject({ role: 'assistant', content: 'A staff engineer.', status: 'streaming' })

    await reply.finish()
    expect(result.current.turn.phase).toBe('idle')
    expect(last(result.current.messages)).toMatchObject({ status: 'done' })
    expect(events.onDone).toHaveBeenCalledWith(true, false)
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    expect(stored).toHaveLength(2)
  })

  it('holds off update reloads while a turn runs, and releases on settle or unmount', async () => {
    const reply = deferredReply()
    const { result, unmount } = renderHook(() => useChat())
    expect(isReloadBlocked()).toBe(false)
    act(() => {
      result.current.send('Hi')
    })
    expect(isReloadBlocked()).toBe(true)
    reply.chunk('Hello')
    expect(isReloadBlocked()).toBe(true)
    await reply.finish()
    expect(isReloadBlocked()).toBe(false)

    deferredReply()
    act(() => {
      result.current.send('Again')
    })
    expect(isReloadBlocked()).toBe(true)
    unmount()
    expect(isReloadBlocked()).toBe(false)
  })

  it('ignores sends while a reply is in flight', () => {
    deferredReply()
    const { result } = renderHook(() => useChat())
    act(() => {
      result.current.send('one')
    })
    act(() => {
      expect(result.current.send('two')).toBe(false)
    })
    expect(invoke).toHaveBeenCalledOnce()
  })

  it('stop aborts the request and keeps the partial reply', async () => {
    const reply = deferredReply()
    const onError = vi.fn()
    const { result } = renderHook(() => useChat({ onError }))
    act(() => {
      result.current.send('Tell me everything')
    })
    reply.chunk('Well, first')
    await act(async () => {
      result.current.stop()
    })
    expect(reply.signal()?.aborted).toBe(true)
    await waitFor(() => expect(result.current.turn.phase).toBe('idle'))
    expect(last(result.current.messages)).toMatchObject({ content: 'Well, first', status: 'stopped' })
    expect(onError).not.toHaveBeenCalled()
  })

  it('marks failures, then retries the same question without the failed turn', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const first = deferredReply()
    const onError = vi.fn()
    const { result } = renderHook(() => useChat({ onError }))
    act(() => {
      result.current.send('Where has he worked?')
    })
    await first.fail(new HttpStatusError({ status: 500, message: 'My insides went wobbly.' }))
    expect(onError).toHaveBeenCalledOnce()
    expect(last(result.current.messages)).toMatchObject({ status: 'error' })
    expect(last(result.current.messages)).toMatchObject({ content: '', error: 'My insides went wobbly.' })

    const second = deferredReply()
    act(() => result.current.regenerate())
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke.mock.calls[1][0]).toBe('Where has he worked?')
    expect(invoke.mock.calls[1][1]).toEqual([])
    expect(result.current.messages).toHaveLength(2)
    second.chunk('Lots of places.')
    await second.finish()
    expect(last(result.current.messages)).toMatchObject({ content: 'Lots of places.', status: 'done' })
  })

  it('lets an intercept answer without the model, and falls through when it declines or fails', async () => {
    const onDone = vi.fn()
    const intercept = vi.fn<(text: string, signal: AbortSignal) => Promise<string | null>>()
    const { result } = renderHook(() => useChat({ intercept, onDone }))

    intercept.mockResolvedValueOnce('One ball, coming up!')
    act(() => void result.current.send('give Lim a ball'))
    await waitFor(() => expect(result.current.turn.phase).toBe('idle'))
    expect(invoke).not.toHaveBeenCalled()
    expect(last(result.current.messages)).toMatchObject({ role: 'assistant', content: 'One ball, coming up!', status: 'done' })
    expect(onDone).toHaveBeenLastCalledWith(true, true)

    // Declined: the question goes to the model as usual.
    intercept.mockResolvedValueOnce(null)
    const reply = deferredReply()
    act(() => void result.current.send('Who is Anthony?'))
    await waitFor(() => expect(invoke).toHaveBeenCalledOnce())
    reply.chunk('An engineer.')
    await reply.finish()
    await waitFor(() => expect(result.current.turn.phase).toBe('idle'))
    expect(last(result.current.messages)).toMatchObject({ content: 'An engineer.', status: 'done' })

    // Broken: same.
    intercept.mockRejectedValueOnce(new Error('boom'))
    const again = deferredReply()
    act(() => void result.current.send('And his skills?'))
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2))
    await again.finish()
    await waitFor(() => expect(result.current.turn.phase).toBe('idle'))
  })

  it('stop during an intercept leaves a stopped reply and never calls the model', async () => {
    let release!: (v: string | null) => void
    const intercept = vi.fn(() => new Promise<string | null>((res) => (release = res)))
    const { result } = renderHook(() => useChat({ intercept }))
    act(() => void result.current.send('give him a kite'))
    act(() => result.current.stop())
    await act(async () => release('Here you go!'))
    await waitFor(() => expect(result.current.turn.phase).toBe('idle'))
    expect(invoke).not.toHaveBeenCalled()
    expect(last(result.current.messages)).toMatchObject({ role: 'assistant', status: 'stopped' })
  })

  it('hands a world order to onWorld instead of showing it, and shows Lim\'s line', async () => {
    const events = { world: () => ({ items: ['ball'], place: 'studio' }), onWorldStart: vi.fn(), onWorld: vi.fn(() => ({ text: 'A kite!', ok: true })), onChunk: vi.fn(), onDone: vi.fn() }
    const reply = deferredReply()
    const { result } = renderHook(() => useChat(events))
    act(() => void result.current.send('give him a kite'))
    // The world goes along with the question.
    expect(invoke.mock.calls[0][4]).toEqual({ items: ['ball'], place: 'studio' })
    reply.chunk('@@')
    reply.chunk('@@world {"ops":[{"op":"item"')
    expect(events.onWorldStart).toHaveBeenCalledOnce()
    // Nothing of the order is ever shown, and Lim doesn't lip-sync to it.
    expect(last(result.current.messages).content).toBe('')
    expect(events.onChunk).not.toHaveBeenCalled()
    reply.chunk('@@world {"ops":[{"op":"item","id":"ball"}],"reply":"A kite!"}')
    await reply.finish()
    await waitFor(() => expect(result.current.turn.phase).toBe('idle'))
    expect(events.onWorld).toHaveBeenCalledWith('@@world {"ops":[{"op":"item","id":"ball"}],"reply":"A kite!"}', false)
    expect(last(result.current.messages)).toMatchObject({ content: 'A kite!', status: 'done' })
    expect(events.onDone).toHaveBeenCalledWith(true, true)

    // The order goes back to the model as the order it was, so it keeps to the format;
    // a toy-box reply the model never wrote is left out, with its question.
    const next = deferredReply()
    act(() => void result.current.send('Who is Anthony?'))
    expect(invoke.mock.calls[1][1]).toEqual([
      { role: 'user', content: 'give him a kite' },
      { role: 'assistant', content: '@@world {"ops":[{"op":"item","id":"ball"}],"reply":"A kite!"}' },
    ])
    await next.finish()
  })

  it('leaves toy-box replies out of the history the model sees', async () => {
    const intercept = vi.fn<(text: string, signal: AbortSignal) => Promise<string | null>>()
    const { result } = renderHook(() => useChat({ intercept }))
    intercept.mockResolvedValueOnce('A ball, coming up!')
    act(() => void result.current.send('give him a ball'))
    await waitFor(() => expect(result.current.turn.phase).toBe('idle'))
    intercept.mockResolvedValueOnce(null)
    const reply = deferredReply()
    act(() => void result.current.send('Who is Anthony?'))
    await waitFor(() => expect(invoke).toHaveBeenCalledOnce())
    expect(invoke.mock.calls[0][1]).toEqual([])
    await reply.finish()
  })

  it('shows a reply that only looked like the start of the marker', async () => {
    const events = { onWorldStart: vi.fn(), onWorld: vi.fn(() => ({ text: 'x', ok: true })) }
    const reply = deferredReply()
    const { result } = renderHook(() => useChat(events))
    act(() => void result.current.send('How do I reach him?'))
    reply.chunk('@')
    expect(last(result.current.messages).content).toBe('')
    reply.chunk('@anthony on GitHub.')
    expect(last(result.current.messages).content).toBe('@anthony on GitHub.')
    await reply.finish()
    await waitFor(() => expect(result.current.turn.phase).toBe('idle'))
    expect(events.onWorldStart).not.toHaveBeenCalled()
    expect(events.onWorld).not.toHaveBeenCalled()
    expect(last(result.current.messages).content).toBe('@anthony on GitHub.')
  })

  it('still treats a fenced or prefaced order as an order', async () => {
    const events = { onWorldStart: vi.fn(), onWorld: vi.fn(() => ({ text: 'A kite!', ok: true })), onChunk: vi.fn() }
    const { result } = renderHook(() => useChat(events))
    // Fenced, arriving piece by piece: none of it is ever shown.
    const fenced = deferredReply()
    act(() => void result.current.send('give him a kite'))
    for (const piece of ['`', '```', '```json\n', '```json\n@@wor', '```json\n@@world {"ops":[{"op":"item"']) {
      fenced.chunk(piece)
      expect(last(result.current.messages).content).toBe('')
    }
    expect(events.onWorldStart).toHaveBeenCalledOnce()
    expect(events.onChunk).not.toHaveBeenCalled()
    fenced.chunk('```json\n@@world {"ops":[{"op":"item","id":"ball"}],"reply":"A kite!"}\n```')
    await fenced.finish()
    await waitFor(() => expect(result.current.turn.phase).toBe('idle'))
    expect(last(result.current.messages).content).toBe('A kite!')

    // Prefaced: the preface is withdrawn the moment the marker turns up.
    const prefaced = deferredReply()
    act(() => void result.current.send('give him a boat'))
    prefaced.chunk('Sure!')
    expect(last(result.current.messages).content).toBe('Sure!')
    prefaced.chunk('Sure!\n@@world {"ops":[')
    expect(last(result.current.messages).content).toBe('')
    act(() => result.current.stop())
    await waitFor(() => expect(result.current.turn.phase).toBe('idle'))
    // Stopped mid-order: no JSON is left on screen.
    expect(last(result.current.messages).content).not.toContain('@@world')
  })

  it('an ordinary answer is untouched, even one that mentions the marker later', async () => {
    const events = { onWorldStart: vi.fn(), onWorld: vi.fn(() => ({ text: 'x', ok: true })) }
    const reply = deferredReply()
    const { result } = renderHook(() => useChat(events))
    act(() => void result.current.send('Who is Anthony?'))
    reply.chunk('An engineer. The docs mention @@world orders.')
    await reply.finish()
    await waitFor(() => expect(result.current.turn.phase).toBe('idle'))
    expect(events.onWorldStart).not.toHaveBeenCalled()
    expect(last(result.current.messages).content).toBe('An engineer. The docs mention @@world orders.')
  })

  it('ends the show when an order is stopped or fails part-way', async () => {
    // As the page does it: nothing to add after a Stop, an apology after a failure.
    const events = { onWorldStart: vi.fn(), onWorld: vi.fn((c: string | null, failed: boolean) => ({ text: c ? 'ok' : failed ? "I couldn't make that." : '', ok: Boolean(c) })), onError: vi.fn() }
    const { result } = renderHook(() => useChat(events))

    const stopped = deferredReply()
    act(() => void result.current.send('give him a kite'))
    stopped.chunk('@@world {"ops":[')
    act(() => result.current.stop())
    await waitFor(() => expect(result.current.turn.phase).toBe('idle'))
    expect(events.onWorld).toHaveBeenLastCalledWith(null, false)
    expect(last(result.current.messages)).toMatchObject({ status: 'stopped' })

    const failed = deferredReply()
    act(() => void result.current.send('give him a boat'))
    failed.chunk('@@world {"ops":[')
    await failed.fail(new Error('boom'))
    await waitFor(() => expect(result.current.turn.phase).toBe('idle'))
    expect(events.onWorld).toHaveBeenLastCalledWith(null, true)
    // Lim owns up to it; it is not shown as a chat error.
    expect(last(result.current.messages)).toMatchObject({ content: "I couldn't make that.", status: 'done' })
    expect(events.onError).not.toHaveBeenCalled()

    // Neither the failed order nor Lim's apology is sent back to the model as its own words.
    const next = deferredReply()
    act(() => void result.current.send('Who is Anthony?'))
    expect(invoke.mock.calls[2][1]).toEqual([])
    await next.finish()
  })

  it('restores a saved chat and clears it on new chat', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: 'u', role: 'user', content: 'hi', timestamp: 1 },
        { id: 'a', role: 'assistant', content: 'half', timestamp: 2, status: 'streaming' },
        { nope: true },
      ]),
    )
    const { result } = renderHook(() => useChat())
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[1]).toMatchObject({ status: 'stopped' })

    act(() => result.current.newChat())
    expect(result.current.messages).toEqual([])
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('a request dropped by New chat cannot settle the send that follows it', async () => {
    const first = deferredReply()
    const { result } = renderHook(() => useChat())
    act(() => {
      result.current.send('one')
    })
    first.chunk('Old words')
    const second = deferredReply()
    // New chat aborts the first request; its rejection lands after the next send.
    act(() => result.current.newChat())
    act(() => {
      result.current.send('two')
    })
    await act(async () => {})
    expect(result.current.turn.phase).toBe('waiting')
    expect(result.current.messages.map((m) => m.content)).toEqual(['two', ''])

    second.chunk('New words')
    expect(last(result.current.messages)).toMatchObject({ content: 'New words', status: 'streaming' })
    await second.finish()
    expect(result.current.turn.phase).toBe('idle')
    expect(last(result.current.messages)).toMatchObject({ content: 'New words', status: 'done' })
  })

  it('saves the question as soon as it is asked, and a partial reply on pagehide', async () => {
    const reply = deferredReply()
    const { result } = renderHook(() => useChat())
    act(() => void result.current.send('Tell me a long story'))
    const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    // A reload right now still has the question.
    expect(stored().map((m: { content: string }) => m.content)).toEqual(['Tell me a long story', ''])
    reply.chunk('Once upon')
    // Not written per chunk...
    expect(stored()[1].content).toBe('')
    // ...but when the page goes away, with the reply kept as stopped.
    act(() => void window.dispatchEvent(new Event('pagehide')))
    expect(stored()[1]).toMatchObject({ content: 'Once upon', status: 'stopped' })
    await reply.finish()
    expect(stored()[1]).toMatchObject({ content: 'Once upon', status: 'done' })
  })

  it('also saves when the tab is hidden (mobile browsers may skip pagehide)', () => {
    const reply = deferredReply()
    const { result } = renderHook(() => useChat())
    act(() => void result.current.send('hi'))
    reply.chunk('Hel')
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    visibility.mockRestore()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')[1]).toMatchObject({ content: 'Hel', status: 'stopped' })
  })

  it("keeps a failure out of the text and in the reply's error", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reply = deferredReply()
    const onError = vi.fn()
    const { result } = renderHook(() => useChat({ onError }))
    act(() => void result.current.send('hi'))
    reply.chunk('Half')
    await reply.fail(Object.assign(new Error('I lost the connection part-way through. Try again.'), { partialContent: 'Half an' }))
    expect(last(result.current.messages)).toMatchObject({ content: 'Half an', status: 'error', error: 'I lost the connection part-way through. Try again.' })
    expect(result.current.lastOutcome).toBe('failed')
    expect(onError).toHaveBeenCalledOnce()
  })

  it('sends a long reply back clamped, so the next question is not rejected', async () => {
    const first = deferredReply()
    const { result } = renderHook(() => useChat())
    act(() => void result.current.send('Write a lot'))
    first.chunk('w'.repeat(12_000))
    await first.finish()
    const next = deferredReply()
    act(() => void result.current.send('And?'))
    const history = invoke.mock.calls[1][1]
    expect(history.every((turn) => turn.content.length <= 8_000)).toBe(true)
    await next.finish()
  })
})
