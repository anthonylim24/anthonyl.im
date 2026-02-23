# OAuth Profiles Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Google OAuth via Clerk, user profiles, and Supabase data persistence to the Breathwork app while keeping anonymous usage fully functional.

**Architecture:** Clerk handles authentication (Google OAuth), Supabase stores user data (profiles, sessions, gamification state). Zustand stores keep their current API and localStorage persistence. A `useCloudSync` hook syncs store data to/from Supabase when the user is signed in. On first login, existing localStorage data merges into the cloud.

**Tech Stack:** `@clerk/clerk-react` for auth, `@supabase/supabase-js` for database, existing Zustand stores, React 19 + Vite + TypeScript.

**Design doc:** `docs/plans/2026-02-22-oauth-profiles-design.md`

---

### Task 1: Install dependencies and configure environment

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/.env.local.example`

**Step 1: Install Clerk and Supabase packages**

Run from `frontend/`:

```bash
bun add @clerk/clerk-react @supabase/supabase-js
```

**Step 2: Create environment variable example file**

Create `frontend/.env.local.example`:

```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

**Step 3: Create actual `.env.local` with real keys**

The developer must create `frontend/.env.local` with their actual Clerk publishable key, Supabase URL, and Supabase anon key. These come from:
- Clerk Dashboard > API Keys > Publishable Key
- Supabase Dashboard > Settings > API > Project URL and `anon` key

**Step 4: Verify `.env.local` is gitignored**

Check that `frontend/.gitignore` includes `.env.local`. If not, add it.

**Step 5: Run the existing test suite to confirm nothing is broken**

Run from `frontend/`:

```bash
bun run test:run
```

Expected: All existing tests pass.

**Step 6: Commit**

```bash
git add frontend/package.json frontend/bun.lockb frontend/.env.local.example
git commit -m "feat: add Clerk and Supabase dependencies"
```

---

### Task 2: Supabase database schema setup

**Files:**
- Create: `supabase/schema.sql`

This SQL file is run manually in the Supabase Dashboard SQL Editor (or via Supabase CLI). It is not executed by the app.

**Step 1: Create the schema file**

Create `supabase/schema.sql`:

```sql
-- ============================================================
-- Breathwork App Schema
-- Run this in the Supabase Dashboard SQL Editor
-- ============================================================

-- Profiles: stores Clerk user info
create table if not exists public.profiles (
  user_id    text primary key,
  email      text,
  name       text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users manage own profile"
  on public.profiles for all to authenticated
  using ((select auth.jwt()->>'sub') = user_id)
  with check ((select auth.jwt()->>'sub') = user_id);

-- Sessions: one row per completed breathing session
create table if not exists public.sessions (
  id               text primary key,
  user_id          text not null,
  technique_id     text not null,
  date             timestamptz not null,
  duration_seconds integer not null,
  rounds           integer not null,
  hold_times       jsonb default '[]',
  max_hold_time    real not null,
  avg_hold_time    real not null,
  created_at       timestamptz default now()
);

alter table public.sessions enable row level security;

create policy "Users manage own sessions"
  on public.sessions for all to authenticated
  using ((select auth.jwt()->>'sub') = user_id)
  with check ((select auth.jwt()->>'sub') = user_id);

-- User state: single row per user combining gamification + settings
create table if not exists public.user_state (
  user_id              text primary key,
  xp                   integer default 0,
  earned_badges        jsonb default '[]',
  selected_theme       text default 'default',
  daily_session_count  integer default 0,
  weekly_session_count integer default 0,
  last_daily_reset     text,
  last_weekly_reset    text,
  personal_bests       jsonb default '{}',
  vo2_max_manual       real,
  vo2_max_history      jsonb default '[]',
  settings             jsonb default '{}',
  updated_at           timestamptz default now()
);

alter table public.user_state enable row level security;

create policy "Users manage own state"
  on public.user_state for all to authenticated
  using ((select auth.jwt()->>'sub') = user_id)
  with check ((select auth.jwt()->>'sub') = user_id);
```

**Notes:**
- `sessions.id` is `text` (not uuid) to match the `crypto.randomUUID()` strings already generated client-side by `historyStore.ts:46`.
- `sessions.user_id` has no default expression — the app sets it explicitly during insert to avoid relying on `auth.jwt()` default in case of merge/migration.
- `user_state.user_id` also has no default for the same reason.

**Step 2: Configure Clerk as third-party auth in Supabase**

In the Supabase Dashboard:
1. Go to Authentication > Sign In / Sign Up > Third Party Auth
2. Add Clerk as a provider
3. Paste your Clerk domain (from Clerk Dashboard > Supabase integration page)

In the Clerk Dashboard:
1. Go to Integrations > Supabase
2. Activate the integration — this adds the `role: "authenticated"` claim to JWTs

**Step 3: Run the SQL in Supabase Dashboard**

Open the SQL Editor in your Supabase project dashboard. Paste the contents of `supabase/schema.sql` and run it. Verify all three tables and their RLS policies exist under Table Editor.

**Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add Supabase schema for profiles, sessions, user_state"
```

---

### Task 3: Supabase client factory

**Files:**
- Create: `frontend/src/lib/supabase.ts`
- Test: `frontend/src/lib/__tests__/supabase.test.ts`

**Step 1: Write the failing test**

Create `frontend/src/lib/__tests__/supabase.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

// Mock @supabase/supabase-js before importing
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}))

import { createClient } from '@supabase/supabase-js'
import { createClerkSupabaseClient } from '../supabase'

describe('createClerkSupabaseClient', () => {
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
```

**Step 2: Run test to verify it fails**

```bash
cd frontend && bun run vitest run src/lib/__tests__/supabase.test.ts
```

Expected: FAIL — `../supabase` module not found.

**Step 3: Write the implementation**

Create `frontend/src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export function createClerkSupabaseClient(
  session: { getToken: () => Promise<string | null> },
) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    async accessToken() {
      return (await session.getToken()) ?? null
    },
  })
}
```

**Step 4: Run test to verify it passes**

```bash
cd frontend && bun run vitest run src/lib/__tests__/supabase.test.ts
```

Expected: PASS (3 tests).

**Step 5: Run full test suite**

```bash
cd frontend && bun run test:run
```

Expected: All tests pass.

**Step 6: Commit**

```bash
git add frontend/src/lib/supabase.ts frontend/src/lib/__tests__/supabase.test.ts
git commit -m "feat: add Supabase client factory with Clerk token integration"
```

---

### Task 4: Wrap app with ClerkProvider

**Files:**
- Modify: `frontend/src/main.tsx`

**Step 1: Add ClerkProvider to main.tsx**

Modify `frontend/src/main.tsx` to wrap the entire app with `<ClerkProvider>`. The provider must wrap `<BrowserRouter>` so Clerk is available everywhere.

Replace the full file content:

```tsx
import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.tsx'
import { BreathworkLayout } from './components/layout/BreathworkLayout'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// Lazy load breathwork pages for better initial bundle size
const Home = lazy(() => import('./pages/Home').then(m => ({ default: m.Home })))
const Session = lazy(() => import('./pages/Session').then(m => ({ default: m.Session })))
const Progress = lazy(() => import('./pages/Progress').then(m => ({ default: m.Progress })))
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))

// Loading fallback for route transitions
const RouteLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
)

const AppRoutes = () => (
  <BrowserRouter>
    <Routes>
      {/* Main chat app */}
      <Route path="/" element={<App />} />
      <Route path="/chatbot" element={<App />} />

      {/* Breathwork app - routes lazy loaded */}
      <Route path="/breathwork" element={<BreathworkLayout />}>
        <Route index element={<Suspense fallback={<RouteLoader />}><Home /></Suspense>} />
        <Route path="session" element={<Suspense fallback={<RouteLoader />}><Session /></Suspense>} />
        <Route path="progress" element={<Suspense fallback={<RouteLoader />}><Progress /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<RouteLoader />}><Settings /></Suspense>} />
      </Route>
    </Routes>
  </BrowserRouter>
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {CLERK_PUBLISHABLE_KEY ? (
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/breathwork">
        <AppRoutes />
      </ClerkProvider>
    ) : (
      <AppRoutes />
    )}
  </StrictMode>,
)
```

**Key decisions:**
- If `VITE_CLERK_PUBLISHABLE_KEY` is not set, the app renders without ClerkProvider — anonymous-only mode still works.
- `afterSignOutUrl` redirects to `/breathwork` after sign-out.
- Routes extracted to `<AppRoutes>` to avoid duplication between the two branches.

**Step 2: Verify app starts**

```bash
cd frontend && bun run dev
```

Open `http://localhost:5173/breathwork` in a browser. The app should render normally. If `VITE_CLERK_PUBLISHABLE_KEY` is set, Clerk will initialize silently (no visible change yet).

**Step 3: Run full test suite**

```bash
cd frontend && bun run test:run
```

Expected: All tests pass. (Tests don't use ClerkProvider — they render components directly.)

**Step 4: Commit**

```bash
git add frontend/src/main.tsx
git commit -m "feat: wrap app with ClerkProvider for Clerk authentication"
```

---

### Task 5: Add sign-in/sign-out to the Header

**Files:**
- Modify: `frontend/src/components/layout/Header.tsx`

**Step 1: Update Header with auth controls**

Modify `frontend/src/components/layout/Header.tsx`. Add Clerk's `<SignedIn>`, `<SignedOut>`, `<SignInButton>`, and `<UserButton>` components to the right side of the header.

The full updated file:

```tsx
import { Link, useLocation } from 'react-router-dom'
import { Wind, BarChart3, Home, Settings } from 'lucide-react'
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react'
import { cn } from '@/lib/utils'
import { ACCENT, ACCENT_BRIGHT } from '@/lib/palette'

export function Header() {
  const location = useLocation()

  const navItems = [
    { path: '/breathwork', label: 'Home', icon: Home },
    { path: '/breathwork/session', label: 'Breathe', icon: Wind },
    { path: '/breathwork/progress', label: 'Progress', icon: BarChart3 },
    { path: '/breathwork/settings', label: 'Settings', icon: Settings },
  ]

  const isActive = (path: string) => {
    if (path === '/breathwork') {
      return location.pathname === '/breathwork'
    }
    return location.pathname.startsWith(path)
  }

  return (
    <header className="sticky top-0 z-50 w-full" style={{ transform: 'translateZ(0)' }}>
      <div
        className="safe-top"
        style={{
          background: 'linear-gradient(145deg, rgba(10, 14, 30, 0.82) 0%, rgba(8, 12, 26, 0.75) 100%)',
          backdropFilter: 'blur(32px) saturate(200%)',
          WebkitBackdropFilter: 'blur(32px) saturate(200%)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          boxShadow: 'inset 0 -1px 0 rgba(255, 255, 255, 0.04), 0 4px 24px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div className="container flex h-16 items-center justify-between px-6">
          <div className="flex items-center">
            {/* Logo */}
            <Link to="/breathwork" className="flex items-center gap-3 mr-8 group">
              <div className="relative">
                <div
                  className="absolute inset-0 rounded-xl blur-lg opacity-40 group-hover:opacity-50 transition-opacity duration-300"
                  style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_BRIGHT})` }}
                />
                <div
                  className="relative h-10 w-10 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform duration-300"
                  style={{
                    background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_BRIGHT})`,
                    boxShadow: `0 8px 20px -4px ${ACCENT}40`,
                  }}
                >
                  <Wind className="h-5 w-5 text-white" />
                </div>
              </div>
              <span className="font-display font-bold text-lg tracking-tight hidden sm:block gradient-text-breath">
                BreathFlow
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300',
                    isActive(path)
                      ? 'text-white'
                      : 'text-white/35 hover:text-white/70 hover:bg-white/5'
                  )}
                  style={isActive(path) ? {
                    background: `linear-gradient(135deg, ${ACCENT}20, ${ACCENT_BRIGHT}15)`,
                    color: ACCENT_BRIGHT,
                  } : undefined}
                >
                  <Icon className={cn(
                    "h-4 w-4 transition-transform duration-300",
                    isActive(path) && "scale-110"
                  )} />
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Auth controls */}
          <div className="flex items-center">
            <SignedOut>
              <SignInButton mode="modal">
                <button
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-all duration-300"
                >
                  Sign In
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: 'h-8 w-8',
                  },
                }}
              />
            </SignedIn>
          </div>
        </div>
      </div>
    </header>
  )
}
```

**Key decisions:**
- `<SignInButton mode="modal">` opens a Clerk modal rather than redirecting — keeps users on the page.
- `<UserButton>` provides avatar click → profile/sign-out dropdown, managed entirely by Clerk.
- Sign-in button styled subtly (`text-white/60`) to match the dark header aesthetic.
- If `ClerkProvider` is absent (no key), `<SignedIn>` and `<SignedOut>` render nothing — the header works as before.

**Step 2: Verify visually**

```bash
cd frontend && bun run dev
```

Open `http://localhost:5173/breathwork`. With Clerk key set, you should see "Sign In" on the right side of the header. Clicking it opens the Clerk modal. After signing in, it shows your Google avatar.

**Step 3: Run test suite**

```bash
cd frontend && bun run test:run
```

Expected: All tests pass.

**Step 4: Commit**

```bash
git add frontend/src/components/layout/Header.tsx
git commit -m "feat: add sign-in/sign-out controls to Header via Clerk"
```

---

### Task 6: Add Account section to Settings page

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`

**Step 1: Update Settings with Account section**

Add a new Account section at the top of the Settings page (above Theme). When signed out, it shows a prompt to sign in. When signed in, it shows the user's avatar, name, email, and a "Cloud sync active" indicator.

Add these imports at the top of `frontend/src/pages/Settings.tsx`:

```ts
import { SignedIn, SignedOut, SignInButton, useUser } from '@clerk/clerk-react'
import { User, Cloud } from 'lucide-react'
```

Add the `User` and `Cloud` icons to the existing lucide-react import (merge with existing icons).

Insert the Account section right after the page title `<motion.div>` (before the Theme section), inside the `<motion.div className="space-y-6 pb-8" ...>`:

```tsx
      {/* Account */}
      <motion.section variants={fadeUp} className="sculpted-card rounded-[22px] p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <User className="h-5 w-5 text-white/40" />
          <h2 className="font-display text-base font-bold text-white">Account</h2>
        </div>
        <SignedOut>
          <div className="flex flex-col items-center gap-3 py-2">
            <p className="text-sm text-white/45 text-center">
              Sign in with Google to sync your progress across devices
            </p>
            <SignInButton mode="modal">
              <button
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 border border-white/10 hover:border-white/20 hover:bg-white/5 text-white"
              >
                <Cloud className="h-4 w-4" />
                Sign in to sync
              </button>
            </SignInButton>
          </div>
        </SignedOut>
        <SignedIn>
          <AccountInfo />
        </SignedIn>
      </motion.section>
```

Add the `AccountInfo` component inside `Settings.tsx` (above the `Settings` function):

```tsx
function AccountInfo() {
  const { user } = useUser()
  if (!user) return null

  return (
    <div className="flex items-center gap-4">
      <img
        src={user.imageUrl}
        alt={user.fullName ?? 'Profile'}
        className="h-12 w-12 rounded-full ring-2 ring-white/10"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">
          {user.fullName}
        </p>
        <p className="text-xs text-white/40 truncate">
          {user.primaryEmailAddress?.emailAddress}
        </p>
      </div>
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[11px] text-emerald-400 font-medium">Synced</span>
      </div>
    </div>
  )
}
```

**Step 2: Verify visually**

```bash
cd frontend && bun run dev
```

Navigate to `http://localhost:5173/breathwork/settings`. When signed out, you should see the "Sign in with Google to sync across devices" card. When signed in, you should see your Google avatar, name, email, and a green "Synced" indicator.

**Step 3: Run test suite**

```bash
cd frontend && bun run test:run
```

Expected: All tests pass.

**Step 4: Commit**

```bash
git add frontend/src/pages/Settings.tsx
git commit -m "feat: add Account section to Settings page with Clerk auth"
```

---

### Task 7: Cloud sync — write the merge logic

This is the core sync logic. It handles merging localStorage data into Supabase on first login, fetching cloud data on subsequent logins, and writing back changes.

**Files:**
- Create: `frontend/src/hooks/useCloudSync.ts`
- Test: `frontend/src/hooks/__tests__/useCloudSync.test.ts`

**Step 1: Write tests for merge utilities**

Create `frontend/src/hooks/__tests__/useCloudSync.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mergeUserState, mergeSessionHistory } from '../useCloudSync'

describe('mergeUserState', () => {
  it('takes the higher XP value', () => {
    const local = { xp: 500, earned_badges: [], selected_theme: 'default', personal_bests: {}, settings: {} }
    const cloud = { xp: 300, earned_badges: [], selected_theme: 'default', personal_bests: {}, settings: {} }
    const result = mergeUserState(local, cloud)
    expect(result.xp).toBe(500)
  })

  it('unions badge arrays without duplicates', () => {
    const local = { xp: 0, earned_badges: ['a', 'b'], selected_theme: 'default', personal_bests: {}, settings: {} }
    const cloud = { xp: 0, earned_badges: ['b', 'c'], selected_theme: 'default', personal_bests: {}, settings: {} }
    const result = mergeUserState(local, cloud)
    expect(result.earned_badges).toEqual(['a', 'b', 'c'])
  })

  it('takes the best personal best per technique', () => {
    const local = {
      xp: 0, earned_badges: [], selected_theme: 'default', settings: {},
      personal_bests: {
        box_breathing: { techniqueId: 'box_breathing', maxHoldTime: 30, date: '2026-01-01' },
      },
    }
    const cloud = {
      xp: 0, earned_badges: [], selected_theme: 'default', settings: {},
      personal_bests: {
        box_breathing: { techniqueId: 'box_breathing', maxHoldTime: 45, date: '2026-01-15' },
        co2_tolerance: { techniqueId: 'co2_tolerance', maxHoldTime: 60, date: '2026-01-10' },
      },
    }
    const result = mergeUserState(local, cloud)
    expect(result.personal_bests.box_breathing.maxHoldTime).toBe(45)
    expect(result.personal_bests.co2_tolerance.maxHoldTime).toBe(60)
  })

  it('prefers local settings over cloud', () => {
    const local = { xp: 0, earned_badges: [], selected_theme: 'aurora', personal_bests: {}, settings: { theme: 'dark', soundVolume: 0.8 } }
    const cloud = { xp: 0, earned_badges: [], selected_theme: 'default', personal_bests: {}, settings: { theme: 'light', soundVolume: 0.5 } }
    const result = mergeUserState(local, cloud)
    expect(result.settings.theme).toBe('dark')
    expect(result.settings.soundVolume).toBe(0.8)
    expect(result.selected_theme).toBe('aurora')
  })
})

describe('mergeSessionHistory', () => {
  it('deduplicates sessions by id', () => {
    const local = [
      { id: 'a', techniqueId: 'box_breathing', date: '2026-01-01T00:00:00Z', durationSeconds: 300, rounds: 4, holdTimes: [], maxHoldTime: 0, avgHoldTime: 0 },
      { id: 'b', techniqueId: 'co2_tolerance', date: '2026-01-02T00:00:00Z', durationSeconds: 600, rounds: 8, holdTimes: [], maxHoldTime: 0, avgHoldTime: 0 },
    ]
    const cloud = [
      { id: 'b', techniqueId: 'co2_tolerance', date: '2026-01-02T00:00:00Z', durationSeconds: 600, rounds: 8, holdTimes: [], maxHoldTime: 0, avgHoldTime: 0 },
      { id: 'c', techniqueId: 'power_breathing', date: '2026-01-03T00:00:00Z', durationSeconds: 120, rounds: 30, holdTimes: [], maxHoldTime: 0, avgHoldTime: 0 },
    ]
    const result = mergeSessionHistory(local, cloud)
    expect(result).toHaveLength(3)
    expect(result.map(s => s.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('returns sessions sorted by date descending', () => {
    const local = [
      { id: 'old', techniqueId: 'box_breathing', date: '2026-01-01T00:00:00Z', durationSeconds: 300, rounds: 4, holdTimes: [], maxHoldTime: 0, avgHoldTime: 0 },
    ]
    const cloud = [
      { id: 'new', techniqueId: 'co2_tolerance', date: '2026-02-01T00:00:00Z', durationSeconds: 600, rounds: 8, holdTimes: [], maxHoldTime: 0, avgHoldTime: 0 },
    ]
    const result = mergeSessionHistory(local, cloud)
    expect(result[0].id).toBe('new')
    expect(result[1].id).toBe('old')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd frontend && bun run vitest run src/hooks/__tests__/useCloudSync.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write the merge utilities and cloud sync hook**

Create `frontend/src/hooks/useCloudSync.ts`:

```ts
import { useEffect, useRef, useCallback } from 'react'
import { useAuth, useUser, useSession } from '@clerk/clerk-react'
import { createClerkSupabaseClient } from '@/lib/supabase'
import { useHistoryStore, type CompletedSession } from '@/stores/historyStore'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { STORAGE_KEYS } from '@/lib/constants'
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

    await supabase.from('profiles').upsert({
      user_id: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? null,
      name: user.fullName ?? null,
      avatar_url: user.imageUrl ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  }, [user])

  // ─── Fetch cloud data and hydrate stores ──────────────────────
  const fetchAndHydrate = useCallback(async () => {
    const supabase = supabaseRef.current
    if (!supabase || !user) return

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

      // Clear localStorage after successful merge
      localStorage.removeItem(STORAGE_KEYS.SESSION_HISTORY)
      localStorage.removeItem('breathwork-gamification')
      localStorage.removeItem('breathwork-settings')

      hasMergedRef.current = true
    } else if (cloudState) {
      // Subsequent login: hydrate from cloud
      const sessions = (cloudSessions ?? []).map(mapCloudSession)
      hydrateStores(cloudState, sessions)
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

      // Upsert user state
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

      // Insert any new sessions (idempotent via ON CONFLICT)
      // Only insert the most recent session since sync runs after each session
      const latestSession = history.sessions[0]
      if (latestSession) {
        await supabase.from('sessions').upsert({
          id: latestSession.id,
          user_id: user.id,
          technique_id: latestSession.techniqueId,
          date: latestSession.date,
          duration_seconds: latestSession.durationSeconds,
          rounds: latestSession.rounds,
          hold_times: latestSession.holdTimes,
          max_hold_time: latestSession.maxHoldTime,
          avg_hold_time: latestSession.avgHoldTime,
        }, { onConflict: 'id' })
      }
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
  }, [isSignedIn, user, upsertProfile, fetchAndHydrate])

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
  // Hydrate history store
  const historyStore = useHistoryStore.getState()
  // Use setState directly to replace store data
  useHistoryStore.setState({
    sessions,
    personalBests: (state.personal_bests ?? {}) as typeof historyStore.personalBests,
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
```

**Step 4: Run tests to verify they pass**

```bash
cd frontend && bun run vitest run src/hooks/__tests__/useCloudSync.test.ts
```

Expected: PASS (all merge tests pass).

**Step 5: Run full test suite**

```bash
cd frontend && bun run test:run
```

Expected: All tests pass.

**Step 6: Commit**

```bash
git add frontend/src/hooks/useCloudSync.ts frontend/src/hooks/__tests__/useCloudSync.test.ts
git commit -m "feat: add cloud sync hook with merge logic for Supabase persistence"
```

---

### Task 8: Wire useCloudSync into the app

**Files:**
- Modify: `frontend/src/components/layout/BreathworkLayout.tsx`

**Step 1: Add useCloudSync to BreathworkLayout**

The `BreathworkLayout` component is the shared layout for all breathwork routes. Adding `useCloudSync()` here ensures sync runs whenever the breathwork app is active.

Modify `frontend/src/components/layout/BreathworkLayout.tsx`:

Add import:
```ts
import { useCloudSync } from '@/hooks/useCloudSync'
```

Add the hook call inside the `BreathworkLayout` function, after the existing hook calls:
```ts
useCloudSync()
```

The full function should look like:

```tsx
export function BreathworkLayout() {
  useTheme()
  useFavicon()
  useCloudSync()
  const { bottomOffset } = useViewportOffset()
  // ... rest unchanged
```

**Step 2: Verify end-to-end**

```bash
cd frontend && bun run dev
```

1. Open `http://localhost:5173/breathwork`
2. Do a breathing session while signed out — data saves to localStorage as before
3. Sign in with Google via the header button
4. Check Supabase Dashboard Table Editor — your profile, user_state, and sessions should appear
5. Do another breathing session while signed in — it should appear in Supabase within 2 seconds
6. Sign out — app returns to anonymous mode

**Step 3: Run full test suite**

```bash
cd frontend && bun run test:run
```

Expected: All tests pass.

**Step 4: Commit**

```bash
git add frontend/src/components/layout/BreathworkLayout.tsx
git commit -m "feat: wire cloud sync into BreathworkLayout"
```

---

### Task 9: Verify existing tests still pass, clean up

**Files:**
- Possibly modify: test files if any need Clerk mocking

**Step 1: Run the full test suite**

```bash
cd frontend && bun run test:run
```

If any tests fail because they render components that now import from `@clerk/clerk-react`, add a mock for Clerk to the test setup file.

If needed, add to `frontend/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom'

// Mock Clerk for tests that don't need real auth
vi.mock('@clerk/clerk-react', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => null,
  SignedOut: ({ children }: { children: React.ReactNode }) => children,
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  UserButton: () => null,
  useAuth: () => ({ isSignedIn: false }),
  useUser: () => ({ user: null }),
  useSession: () => ({ session: null }),
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
}))
```

**Step 2: Run typecheck**

```bash
cd frontend && bun run typecheck
```

Expected: No type errors.

**Step 3: Run lint**

```bash
cd frontend && bun run lint
```

Fix any lint issues.

**Step 4: Commit if changes were needed**

```bash
git add -A && git commit -m "fix: add Clerk mocks for test environment"
```

(Only if changes were made.)

---

### Task 10: Final integration verification

**Step 1: Full clean build**

```bash
cd frontend && bun run build
```

Expected: Build succeeds with no errors.

**Step 2: Manual end-to-end verification checklist**

Test each of these scenarios:

1. **Anonymous usage works**: Open app without signing in. Do a session. Check progress page. All data persists in localStorage.
2. **Sign in**: Click "Sign In" in header. Google OAuth popup opens. Sign in succeeds. Avatar appears in header.
3. **First-login merge**: After signing in, check Supabase tables. Your anonymous sessions, XP, badges should be in the cloud.
4. **Cloud persistence**: Do a session while signed in. Check Supabase `sessions` table — new row appears.
5. **Settings sync**: Change theme or sound settings. Check Supabase `user_state.settings` — updated.
6. **Sign out**: Click avatar > Sign Out. App returns to anonymous mode with empty stores.
7. **Sign back in**: Sign in again. Cloud data loads back into stores. All history, XP, badges restored.
8. **No Clerk key**: Remove `VITE_CLERK_PUBLISHABLE_KEY` from `.env.local`. Restart dev server. App works in anonymous-only mode with no Clerk UI visible.

**Step 3: Final commit**

```bash
git add -A && git commit -m "feat: complete OAuth profiles with Clerk + Supabase integration"
```

(Only if there are uncommitted changes from the verification steps.)
