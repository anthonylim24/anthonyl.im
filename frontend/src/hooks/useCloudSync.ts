import { useEffect, useRef, useCallback } from 'react'
import { useAuth, useUser, useSession } from '@clerk/clerk-react'
import { createClerkSupabaseClient } from '@/lib/supabase'
import { useHistoryStore, type CompletedSession, type PersonalBest } from '@/stores/historyStore'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { STORAGE_KEYS, type TechniqueId } from '@/lib/constants'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Merge utilities (exported for testing) ───────────────────────

interface CloudUserState {
  xp: number
  earned_badges: string[]
  selected_theme: string
  personal_bests: Record<string, { techniqueId: string; maxHoldTime: number; date: string }>
  settings: Record<string, unknown>
  [key: string]: unknown
}

export function mergeUserState(local: CloudUserState, cloud: CloudUserState): CloudUserState {
  // XP: take higher
  const xp = Math.max(local.xp ?? 0, cloud.xp ?? 0)

  // Badges: union
  const allBadges = new Set([...(local.earned_badges ?? []), ...(cloud.earned_badges ?? [])])
  const earned_badges = Array.from(allBadges)

  // Personal bests: best per technique
  const personal_bests: CloudUserState['personal_bests'] = { ...cloud.personal_bests }
  for (const [technique, localBest] of Object.entries(local.personal_bests ?? {})) {
    const cloudBest = personal_bests[technique]
    if (!cloudBest || localBest.maxHoldTime > cloudBest.maxHoldTime) {
      personal_bests[technique] = localBest
    }
  }

  // Settings and theme: prefer local (user's current device)
  const settings = Object.keys(local.settings ?? {}).length > 0
    ? local.settings
    : cloud.settings
  const selected_theme = local.selected_theme !== 'default'
    ? local.selected_theme
    : cloud.selected_theme

  return {
    ...cloud,
    xp,
    earned_badges,
    selected_theme,
    personal_bests,
    settings,
  }
}

export function mergeSessionHistory(
  local: CompletedSession[],
  cloud: CompletedSession[],
): CompletedSession[] {
  const seen = new Map<string, CompletedSession>()
  for (const s of [...cloud, ...local]) {
    if (!seen.has(s.id)) {
      seen.set(s.id, s)
    }
  }
  return Array.from(seen.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )
}

// ─── Cloud sync hook ──────────────────────────────────────────────

const DEBOUNCE_MS = 2000

export function useCloudSync() {
  const { isSignedIn } = useAuth()
  const { user } = useUser()
  const { session } = useSession()
  const supabaseRef = useRef<SupabaseClient | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSyncingRef = useRef(false)
  const hasMergedRef = useRef(false)

  // Create Supabase client when session is available
  useEffect(() => {
    if (session) {
      supabaseRef.current = createClerkSupabaseClient(session)
    } else {
      supabaseRef.current = null
    }
  }, [session])

  // ─── Upsert profile ──────────────────────────────────────────
  const upsertProfile = useCallback(async () => {
    const supabase = supabaseRef.current
    if (!supabase || !user) return

    try {
      await supabase.from('profiles').upsert({
        user_id: user.id,
        email: user.primaryEmailAddress?.emailAddress ?? null,
        name: user.fullName ?? null,
        avatar_url: user.imageUrl ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
    } catch (err) {
      console.error('[CloudSync] Failed to upsert profile:', err)
    }
  }, [user])

  // ─── Fetch cloud data and hydrate stores ──────────────────────
  const fetchAndHydrate = useCallback(async () => {
    const supabase = supabaseRef.current
    if (!supabase || !user) return

    try {
      // Fetch user state
      const { data: cloudState } = await supabase
        .from('user_state')
        .select('*')
        .eq('user_id', user.id)
        .single()

      // Fetch sessions
      const { data: cloudSessions } = await supabase
        .from('sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })

      // Get local data from stores
      const localHistory = useHistoryStore.getState()
      const localGamification = useGamificationStore.getState()
      const localSettings = useSettingsStore.getState()

      const hasLocalData =
        localHistory.sessions.length > 0 ||
        localGamification.xp > 0 ||
        localGamification.earnedBadges.length > 0

      if (hasLocalData && !hasMergedRef.current) {
        // First-login merge: merge local into cloud
        const localState: CloudUserState = {
          xp: localGamification.xp,
          earned_badges: localGamification.earnedBadges,
          selected_theme: localGamification.selectedTheme,
          daily_session_count: localGamification.dailySessionCount,
          weekly_session_count: localGamification.weeklySessionCount,
          last_daily_reset: localGamification.lastDailyReset,
          last_weekly_reset: localGamification.lastWeeklyReset,
          personal_bests: localHistory.personalBests as CloudUserState['personal_bests'],
          vo2_max_manual: localHistory.vo2MaxManual,
          vo2_max_history: localHistory.vo2MaxHistory,
          settings: {
            theme: localSettings.theme,
            soundEnabled: localSettings.soundEnabled,
            soundVolume: localSettings.soundVolume,
            hapticsEnabled: localSettings.hapticsEnabled,
          },
        }

        const cloudStateData: CloudUserState = cloudState ?? {
          xp: 0,
          earned_badges: [],
          selected_theme: 'default',
          personal_bests: {},
          settings: {},
        }

        const merged = mergeUserState(localState, cloudStateData)

        // Upsert merged state to cloud
        await supabase.from('user_state').upsert({
          user_id: user.id,
          ...merged,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

        // Insert local sessions that aren't in cloud
        const cloudSessionMap = new Map(
          (cloudSessions ?? []).map((s: CompletedSession) => [s.id, true]),
        )
        const newSessions = localHistory.sessions.filter(s => !cloudSessionMap.has(s.id))
        if (newSessions.length > 0) {
          await supabase.from('sessions').insert(
            newSessions.map(s => ({
              id: s.id,
              user_id: user.id,
              technique_id: s.techniqueId,
              date: s.date,
              duration_seconds: s.durationSeconds,
              rounds: s.rounds,
              hold_times: s.holdTimes,
              max_hold_time: s.maxHoldTime,
              avg_hold_time: s.avgHoldTime,
            })),
          )
        }

        // Merge session lists for store hydration
        const allSessions = mergeSessionHistory(
          localHistory.sessions,
          (cloudSessions ?? []).map(mapCloudSession),
        )

        // Hydrate stores with merged data
        hydrateStores(merged, allSessions)

        // Mark merge complete before clearing localStorage to prevent
        // re-merge with empty data if a subsequent error occurs
        hasMergedRef.current = true

        // Clear localStorage now that cloud has the merged data
        localStorage.removeItem(STORAGE_KEYS.SESSION_HISTORY)
        localStorage.removeItem('breathwork-gamification')
        localStorage.removeItem('breathwork-settings')
      } else if (cloudState) {
        // Subsequent login: hydrate from cloud
        const sessions = (cloudSessions ?? []).map(mapCloudSession)
        hydrateStores(cloudState, sessions)
      }
    } catch (err) {
      console.error('[CloudSync] Failed to fetch/hydrate:', err)
    }
  }, [user])

  // ─── Write stores back to Supabase (debounced) ────────────────
  const syncToCloud = useCallback(async () => {
    const supabase = supabaseRef.current
    if (!supabase || !user || isSyncingRef.current) return

    isSyncingRef.current = true
    try {
      const history = useHistoryStore.getState()
      const gamification = useGamificationStore.getState()
      const settings = useSettingsStore.getState()

      await supabase.from('user_state').upsert({
        user_id: user.id,
        xp: gamification.xp,
        earned_badges: gamification.earnedBadges,
        selected_theme: gamification.selectedTheme,
        daily_session_count: gamification.dailySessionCount,
        weekly_session_count: gamification.weeklySessionCount,
        last_daily_reset: gamification.lastDailyReset,
        last_weekly_reset: gamification.lastWeeklyReset,
        personal_bests: history.personalBests,
        vo2_max_manual: history.vo2MaxManual,
        vo2_max_history: history.vo2MaxHistory,
        settings: {
          theme: settings.theme,
          soundEnabled: settings.soundEnabled,
          soundVolume: settings.soundVolume,
          hapticsEnabled: settings.hapticsEnabled,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

      // Upsert recent sessions (idempotent via ON CONFLICT)
      const recentSessions = history.sessions.slice(0, 50)
      if (recentSessions.length > 0) {
        await supabase.from('sessions').upsert(
          recentSessions.map(s => ({
            id: s.id,
            user_id: user.id,
            technique_id: s.techniqueId,
            date: s.date,
            duration_seconds: s.durationSeconds,
            rounds: s.rounds,
            hold_times: s.holdTimes,
            max_hold_time: s.maxHoldTime,
            avg_hold_time: s.avgHoldTime,
          })),
          { onConflict: 'id' },
        )
      }
    } catch (err) {
      console.error('[CloudSync] Failed to sync to cloud:', err)
    } finally {
      isSyncingRef.current = false
    }
  }, [user])

  const debouncedSync = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(syncToCloud, DEBOUNCE_MS)
  }, [syncToCloud])

  // ─── Initial fetch on sign-in ─────────────────────────────────
  useEffect(() => {
    if (isSignedIn && supabaseRef.current && user) {
      upsertProfile()
      fetchAndHydrate()
    }
  }, [isSignedIn, session, user, upsertProfile, fetchAndHydrate])

  // ─── Subscribe to store changes for sync ──────────────────────
  useEffect(() => {
    if (!isSignedIn) return

    const unsubHistory = useHistoryStore.subscribe(debouncedSync)
    const unsubGamification = useGamificationStore.subscribe(debouncedSync)
    const unsubSettings = useSettingsStore.subscribe(debouncedSync)

    return () => {
      unsubHistory()
      unsubGamification()
      unsubSettings()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [isSignedIn, debouncedSync])
}

// ─── Helpers ────────────────────────────────────────────────────

function mapCloudSession(row: Record<string, unknown>): CompletedSession {
  return {
    id: row.id as string,
    techniqueId: row.technique_id as CompletedSession['techniqueId'],
    date: row.date as string,
    durationSeconds: row.duration_seconds as number,
    rounds: row.rounds as number,
    holdTimes: (row.hold_times as number[]) ?? [],
    maxHoldTime: row.max_hold_time as number,
    avgHoldTime: row.avg_hold_time as number,
  }
}

function hydrateStores(state: CloudUserState, sessions: CompletedSession[]) {
  useHistoryStore.setState({
    sessions,
    personalBests: (state.personal_bests ?? {}) as Record<TechniqueId, PersonalBest | undefined>,
    vo2MaxManual: (state.vo2_max_manual as number) ?? null,
    vo2MaxHistory: (state.vo2_max_history as { value: number; date: string }[]) ?? [],
  })

  // Hydrate gamification store
  useGamificationStore.setState({
    xp: state.xp ?? 0,
    earnedBadges: (state.earned_badges as string[]) ?? [],
    selectedTheme: (state.selected_theme as string) ?? 'default',
    dailySessionCount: (state.daily_session_count as number) ?? 0,
    weeklySessionCount: (state.weekly_session_count as number) ?? 0,
    lastDailyReset: (state.last_daily_reset as string) ?? '',
    lastWeeklyReset: (state.last_weekly_reset as string) ?? '',
  })

  // Hydrate settings store
  const settings = (state.settings ?? {}) as Record<string, unknown>
  if (Object.keys(settings).length > 0) {
    useSettingsStore.setState({
      theme: (settings.theme as 'dark' | 'light') ?? 'dark',
      soundEnabled: (settings.soundEnabled as boolean) ?? true,
      soundVolume: (settings.soundVolume as number) ?? 0.3,
      hapticsEnabled: (settings.hapticsEnabled as boolean) ?? true,
    })
  }
}
