import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY, useChat } from '../useChat'

type Invoke = (
  prompt: string,
  history: { role: string; content: string }[],
  onUpdate?: (content: string) => void,
  signal?: AbortSignal,
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
    expect(result.current.status).toBe('thinking')
    expect(invoke.mock.calls[0][0]).toBe('Who is Anthony?')

    reply.chunk('A staff')
    reply.chunk('A staff engineer.')
    expect(result.current.status).toBe('streaming')
    expect(events.onChunk).toHaveBeenCalledTimes(2)
    expect(last(result.current.messages)).toMatchObject({ role: 'assistant', content: 'A staff engineer.', status: 'streaming' })

    await reply.finish()
    expect(result.current.status).toBe('idle')
    expect(last(result.current.messages)?.status).toBe('done')
    expect(events.onDone).toHaveBeenCalledWith(true)
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    expect(stored).toHaveLength(2)
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
    await waitFor(() => expect(result.current.status).toBe('idle'))
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
    await first.fail(new Error('HTTP error! status: 500'))
    expect(onError).toHaveBeenCalledOnce()
    expect(last(result.current.messages)).toMatchObject({ status: 'error' })
    expect(last(result.current.messages)?.content).toContain('HTTP error! status: 500')

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
    expect(result.current.messages[1].status).toBe('stopped')

    act(() => result.current.newChat())
    expect(result.current.messages).toEqual([])
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
