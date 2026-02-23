import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @supabase/supabase-js before importing
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}))

import { createClient } from '@supabase/supabase-js'
import { createClerkSupabaseClient } from '../supabase'

describe('createClerkSupabaseClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a Supabase client with accessToken callback', () => {
    const mockSession = { getToken: vi.fn().mockResolvedValue('test-token') }

    const client = createClerkSupabaseClient(mockSession)

    expect(client).toBeDefined()
    expect(createClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        accessToken: expect.any(Function),
      }),
    )
  })

  it('accessToken callback returns the Clerk session token', async () => {
    const mockSession = { getToken: vi.fn().mockResolvedValue('clerk-jwt-123') }

    createClerkSupabaseClient(mockSession)

    // Extract the accessToken callback that was passed to createClient
    const callArgs = vi.mocked(createClient).mock.calls[0]
    const options = callArgs[2] as { accessToken: () => Promise<string | null> }
    const token = await options.accessToken()

    expect(token).toBe('clerk-jwt-123')
    expect(mockSession.getToken).toHaveBeenCalled()
  })

  it('accessToken returns null when session has no token', async () => {
    const mockSession = { getToken: vi.fn().mockResolvedValue(null) }

    createClerkSupabaseClient(mockSession)

    const callArgs = vi.mocked(createClient).mock.calls[0]
    const options = callArgs[2] as { accessToken: () => Promise<string | null> }
    const token = await options.accessToken()

    expect(token).toBeNull()
  })
})
