import type { SupabaseClient } from '@supabase/supabase-js'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/clerk', () => ({ CLERK_PUBLISHABLE_KEY: '', CLERK_ENABLED: false }))
vi.mock('@clerk/clerk-react', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignOutButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useUser: () => ({ user: { fullName: 'Breath', imageUrl: '', primaryEmailAddress: { emailAddress: 'b@example.com' } } }),
}))

import { INITIAL_SYNC_STATE, type SyncState } from '@/lib/cloudSync/machine'
import { useSyncStore } from '@/lib/cloudSync/store'
import { useGamificationStore } from '@/stores/gamificationStore'
import { getEmptyHistoryState, useHistoryStore } from '@/stores/historyStore'
import { SettingsAccount } from '../SettingsAccount'
import { SettingsPage } from '../SettingsPage'

const ready: SyncState = { tag: 'ready', userId: 'user_1', seq: 1, dirty: false, pushing: false, attempt: 0 }

function cloudClient(stateError: unknown = null) {
  const stateUpsert = vi.fn(async () => ({ error: stateError }))
  const deleteRows = vi.fn(async () => ({ error: null }))
  const client = {
    from: (table: string) => (table === 'user_state'
      ? { upsert: stateUpsert }
      : { delete: () => ({ eq: () => ({ lte: deleteRows }) }) }),
  }
  return { client: client as unknown as SupabaseClient, stateUpsert, deleteRows }
}

beforeEach(() => {
  localStorage.clear()
  useSyncStore.setState({ state: INITIAL_SYNC_STATE, client: null })
  useHistoryStore.setState(getEmptyHistoryState())
  useHistoryStore.getState().addSession({
    techniqueId: 'box_breathing', date: new Date().toISOString(), durationSeconds: 120, rounds: 3,
    holdTimes: [], maxHoldTime: 0, avgHoldTime: 0,
  })
  useGamificationStore.setState({ xp: 100, earnedBadges: [], selectedTheme: 'default' })
})

function openConfirm() {
  render(<MemoryRouter><SettingsPage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: /clear all data/i }))
}

describe('Clear all data, signed in', () => {
  it('says the synced copy goes too, and erases it along with this device', async () => {
    const cloud = cloudClient()
    useSyncStore.setState({ state: ready, client: cloud.client })
    openConfirm()

    expect(screen.getByText(/from this device and from your account/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /erase everything/i }))

    expect(await screen.findByRole('button', { name: /clear all data/i })).toBeInTheDocument()
    expect(cloud.stateUpsert).toHaveBeenCalled()
    expect(cloud.deleteRows).toHaveBeenCalled()
    expect(useHistoryStore.getState().sessions).toHaveLength(0)
    expect(useGamificationStore.getState().xp).toBe(0)
  })

  it('shows the failure and keeps everything when the account cannot be reached', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const cloud = cloudClient(new Error('offline'))
    useSyncStore.setState({ state: ready, client: cloud.client })
    openConfirm()

    fireEvent.click(screen.getByRole('button', { name: /erase everything/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/nothing was erased/i)
    expect(useHistoryStore.getState().sessions).toHaveLength(1)
    expect(useGamificationStore.getState().xp).toBe(100)
  })

  it('signed out, the confirmation speaks only of this device', () => {
    openConfirm()
    expect(screen.getByText('Erase history, progress, badges, and settings from this device?')).toBeInTheDocument()
  })
})

describe('Account sync status', () => {
  it.each([
    [{ tag: 'pulling', userId: 'u', seq: 1, attempt: 0 }, 'Syncing…'],
    [{ ...ready, dirty: true }, 'Syncing…'],
    [ready, 'Synced across your devices'],
    [{ tag: 'error', userId: 'u', seq: 1, attempt: 1, retryAt: 0 }, 'Offline. Saved on this device; will sync when it can.'],
  ] satisfies [SyncState, string][])('shows %o as "%s"', (state, copy) => {
    useSyncStore.setState({ state })
    render(<SettingsAccount />)
    expect(screen.getByRole('status')).toHaveTextContent(copy)
  })
})
