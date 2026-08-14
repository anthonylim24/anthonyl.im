import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}))

vi.mock('@/lib/apiService', () => ({
  invokeDeepseek: (...args: unknown[]) => mockInvoke(...args),
}))

import { useChatSession } from '../useChatSession'

beforeEach(() => {
  mockInvoke.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useChatSession', () => {
  it('appends the user turn before the streaming assistant turn', async () => {
    mockInvoke.mockImplementation(async (_prompt, _history, onUpdate: (content: string) => void) => {
      onUpdate('Door')
      onUpdate('DoorDash')
      return { content: 'DoorDash' }
    })

    const { result } = renderHook(() => useChatSession())

    await act(async () => {
      await result.current.send('What does Anthony build at DoorDash?')
    })

    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      content: 'What does Anthony build at DoorDash?',
    })
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'DoorDash',
    })
    expect(mockInvoke).toHaveBeenCalledWith(
      'What does Anthony build at DoorDash?',
      [],
      expect.any(Function),
    )
  })

  it('ignores late stream updates after unmount', async () => {
    let onUpdate: ((content: string) => void) | undefined
    mockInvoke.mockImplementation((_prompt, _history, cb: (content: string) => void) => {
      onUpdate = cb
      return new Promise(() => {})
    })

    const { result, unmount } = renderHook(() => useChatSession())

    act(() => {
      void result.current.send('hello')
    })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2)
    })

    unmount()
    expect(() => onUpdate?.('late chunk')).not.toThrow()
  })

  it('retries the last question without duplicating the user turn', async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error('network'))
      .mockImplementation(async (_prompt, _history, onUpdate: (content: string) => void) => {
        onUpdate('Reached at the email on file.')
        return { content: 'Reached at the email on file.' }
      })

    const { result } = renderHook(() => useChatSession())

    await act(async () => {
      await result.current.send('How do I reach him?')
    })

    expect(result.current.error).toBe(true)
    expect(result.current.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'How do I reach him?' }),
    ])

    await act(async () => {
      await result.current.retry()
    })

    expect(result.current.error).toBe(false)
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages.filter((message) => message.role === 'user')).toHaveLength(1)
    expect(result.current.messages[1].content).toBe('Reached at the email on file.')
    expect(mockInvoke).toHaveBeenCalledTimes(2)
    expect(mockInvoke).toHaveBeenLastCalledWith('How do I reach him?', [], expect.any(Function))
  })
})
