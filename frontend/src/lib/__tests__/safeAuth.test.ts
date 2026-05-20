import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

describe('safeAuth dev-bearer escape hatch', () => {
  const importMetaEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    vi.resetModules()
    // Reset any env state between tests
    delete importMetaEnv.VITE_DEV_BEARER
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('returns null token when Clerk disabled AND no dev bearer', async () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', '')
    vi.stubEnv('VITE_DEV_BEARER', '')
    const { useGetToken, clerkEnabled } = await import('../safeAuth')
    expect(clerkEnabled).toBe(false)
    const getToken = useGetToken()
    await expect(getToken()).resolves.toBeNull()
  })

  test('returns dev bearer when Clerk disabled AND VITE_DEV_BEARER set', async () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', '')
    vi.stubEnv('VITE_DEV_BEARER', 'dev-test-token')
    const { useGetToken, clerkEnabled } = await import('../safeAuth')
    expect(clerkEnabled).toBe(true)
    const getToken = useGetToken()
    await expect(getToken()).resolves.toBe('dev-test-token')
  })
})
