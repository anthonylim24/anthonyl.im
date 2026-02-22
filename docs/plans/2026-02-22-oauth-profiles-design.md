# OAuth Profiles Design

Google OAuth via Clerk, user profiles, and Supabase persistence for the Breathwork app.

## Requirements

- Google OAuth login using Clerk (`@clerk/clerk-react`)
- Persist profile and progress data in Supabase
- Login is optional — app works anonymously with localStorage as today
- On first login, merge existing localStorage data into Supabase
- Once logged in, Supabase is the source of truth (cloud-first)
- Profile data is Clerk-provided only (Google avatar, name, email) — no editable fields

## Architecture

```
┌─────────────────────────────────────────────┐
│                  Frontend                    │
│                                             │
│  ClerkProvider (wraps BrowserRouter)        │
│    ├── useAuth() → signed in?               │
│    │   ├── No  → Zustand + localStorage     │
│    │   └── Yes → Zustand + Supabase sync    │
│    ├── <UserButton /> in Header             │
│    └── <SignInButton /> when signed out      │
│                                             │
│  Zustand stores (unchanged API surface)     │
│    └── localStorage persistence (as today)  │
│    └── useCloudSync hook syncs to Supabase  │
└──────────────────┬──────────────────────────┘
                   │ Clerk session token (JWT)
                   ▼
┌─────────────────────────────────────────────┐
│              Supabase                        │
│  ├── profiles (user_id, created_at)         │
│  ├── sessions (breathing session history)   │
│  ├── user_state (XP, badges, settings JSON) │
│  └── RLS: auth.jwt()->>'sub' = user_id      │
└─────────────────────────────────────────────┘
```

**Approach**: Native Clerk-Supabase integration (JWKS-based, not the deprecated JWT template). Frontend talks to Supabase directly using Clerk-issued tokens. Zustand stores keep their current API — a sync hook handles reading from and writing to Supabase when signed in.

## Database Schema

### `profiles`

```sql
create table public.profiles (
  user_id    text primary key,
  email      text,
  name       text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;
create policy "Users manage own profile" on public.profiles
  for all to authenticated
  using ((select auth.jwt()->>'sub') = user_id)
  with check ((select auth.jwt()->>'sub') = user_id);
```

Created via upsert on first login from Clerk user data. Read-only from the app's perspective.

### `sessions`

```sql
create table public.sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          text not null default (auth.jwt()->>'sub'),
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
create policy "Users manage own sessions" on public.sessions
  for all to authenticated
  using ((select auth.jwt()->>'sub') = user_id)
  with check ((select auth.jwt()->>'sub') = user_id);
```

One row per completed breathing session. Append-only from the frontend.

### `user_state`

```sql
create table public.user_state (
  user_id              text primary key default (auth.jwt()->>'sub'),
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
create policy "Users manage own state" on public.user_state
  for all to authenticated
  using ((select auth.jwt()->>'sub') = user_id)
  with check ((select auth.jwt()->>'sub') = user_id);
```

Single row per user combining gamification, personal bests, and settings.

## Auth Flow

### Login

1. User clicks Sign In button in Header or Settings
2. Clerk's `<SignInButton>` opens Google OAuth popup
3. On success, `useAuth().isSignedIn` becomes `true`
4. `<AuthSync>` component detects sign-in, triggers first-login merge:
   - Read localStorage data (sessions, gamification, settings)
   - Upsert `profiles` from Clerk user data
   - Upsert `user_state`, merging: XP (take max), badges (union), personal bests (best per technique), settings (take localStorage version)
   - Insert localStorage sessions into `sessions` table (`ON CONFLICT (id) DO NOTHING`)
   - Clear localStorage stores after successful merge
5. Subsequent logins load from Supabase directly

### Sign Out

1. User clicks Sign Out via Clerk's `<UserButton>`
2. Clerk clears the session
3. App falls back to localStorage (empty stores = fresh anonymous state)

## Sync Pattern

Stores keep localStorage persistence as-is. A `useCloudSync()` hook runs when signed in:

- **On mount (signed in)**: Fetch from Supabase, hydrate stores
- **On store changes (signed in)**: Debounced write-back to Supabase
- **On sign-out**: Stop syncing, stores fall back to localStorage

This avoids modifying existing store definitions.

## Supabase Client

New file `frontend/src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

export function createClerkSupabaseClient(
  session: { getToken: () => Promise<string | null> }
) {
  return createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
      async accessToken() {
        return (await session.getToken()) ?? null
      },
    },
  )
}
```

## UI Changes

### Header (`Header.tsx`)

- Right side: `<SignInButton>` when signed out, `<UserButton />` when signed in
- Styled to match existing header aesthetic (semi-transparent, indigo accent)

### Settings Page (`Settings.tsx`)

- New Account section at the top (above Theme)
- Signed out: Card with "Sign in with Google to sync across devices" + sign-in button
- Signed in: Card showing avatar, name, email, "Cloud sync active" indicator

### No new pages or routes

Clerk handles OAuth via popup/redirect. No dedicated login page needed.

## Error Handling

- **Supabase unreachable**: Fall back to localStorage silently. Show subtle toast ("Offline — changes saved locally")
- **Clerk session expired**: Clerk handles refresh. If token fetch fails, treat as signed-out
- **First-login merge failure**: Retry once. If fails again, keep localStorage intact, show warning
- **Duplicate session inserts**: `ON CONFLICT (id) DO NOTHING` for idempotent merging

## Testing

- Unit tests for sync logic (merge strategy, conflict resolution) with mocked Supabase client
- Existing store tests remain valid (store API unchanged)
- Manual testing for OAuth flow (requires real browser)

## New Dependencies

```
@clerk/clerk-react
@supabase/supabase-js
```

## New Environment Variables

```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```
