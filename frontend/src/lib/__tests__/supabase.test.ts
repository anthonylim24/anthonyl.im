import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @supabase/supabase-js before importing
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}))

import { createClient } from '@supabase/supabase-js'
import { createClerkSupabaseClient, getSupabaseConfig } from '../supabase'

const SUPABASE_ENV = {
  VITE_SUPABASE_URL: ' https://project.supabase.co ',
  VITE_SUPABASE_ANON_KEY: ' anon-key ',
}

describe('getSupabaseConfig', () => {
  it('returns null when Supabase env vars are missing', () => {
    expect(getSupabaseConfig({})).toBeNull()
    expect(getSupabaseConfig({ VITE_SUPABASE_URL: 'https://project.supabase.co' })).toBeNull()
    expect(getSupabaseConfig({ VITE_SUPABASE_ANON_KEY: 'anon-key' })).toBeNull()
  })

  it('trims and returns configured Supabase credentials', () => {
    expect(getSupabaseConfig(SUPABASE_ENV)).toEqual({
      url: 'https://project.supabase.co',
      anonKey: 'anon-key',
    })
  })
})

describe('createClerkSupabaseClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a Supabase client with accessToken callback', () => {
    const mockSession = { getToken: vi.fn().mockResolvedValue('test-token') }

    const client = createClerkSupabaseClient(mockSession, SUPABASE_ENV)

    expect(client).toBeDefined()
    expect(createClient).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'anon-key',
      expect.objectContaining({
        accessToken: expect.any(Function),
      }),
    )
  })

  it('accessToken callback returns the Clerk session token', async () => {
    const mockSession = { getToken: vi.fn().mockResolvedValue('clerk-jwt-123') }

    createClerkSupabaseClient(mockSession, SUPABASE_ENV)

    // Extract the accessToken callback that was passed to createClient
    const callArgs = vi.mocked(createClient).mock.calls[0]
    const options = callArgs[2] as { accessToken: () => Promise<string | null> }
    const token = await options.accessToken()

    expect(token).toBe('clerk-jwt-123')
    expect(mockSession.getToken).toHaveBeenCalled()
  })

  it('accessToken returns null when session has no token', async () => {
    const mockSession = { getToken: vi.fn().mockResolvedValue(null) }

    createClerkSupabaseClient(mockSession, SUPABASE_ENV)

    const callArgs = vi.mocked(createClient).mock.calls[0]
    const options = callArgs[2] as { accessToken: () => Promise<string | null> }
    const token = await options.accessToken()

    expect(token).toBeNull()
  })

  it('does not create a client when Supabase env vars are missing', () => {
    const mockSession = { getToken: vi.fn().mockResolvedValue('test-token') }

    expect(createClerkSupabaseClient(mockSession, {})).toBeNull()
    expect(createClient).not.toHaveBeenCalled()
  })
})
