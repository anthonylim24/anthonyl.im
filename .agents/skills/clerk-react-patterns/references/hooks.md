# Hooks (CRITICAL)

## isLoaded Guard

Always check `isLoaded` before trusting auth state. Rendering before Clerk initializes gives wrong results:

```tsx
import { useAuth } from '@clerk/react'

export function Page() {
  const { isLoaded, isSignedIn, userId } = useAuth()

  if (!isLoaded) return <div>Loading...</div>
  if (!isSignedIn) return <div>Please sign in</div>

  return <div>Hello {userId}</div>
}
```

## useAuth()

Returns auth primitives:

| Property | Type | Description |
|----------|------|-------------|
| `isLoaded` | `boolean` | `false` while Clerk initializes |
| `isSignedIn` | `boolean \| undefined` | `undefined` until `isLoaded` is true |
| `userId` | `string \| null` | Current user ID |
| `sessionId` | `string \| null` | Current session ID |
| `orgId` | `string \| null` | Active organization ID |
| `orgRole` | `string \| null` | Active org role |
| `getToken` | `Function` | Fetches session JWT |
| `signOut` | `Function` | Signs the user out |

## useUser()

Returns full user profile:

```tsx
import { useUser } from '@clerk/react'

export function Profile() {
  const { isLoaded, isSignedIn, user } = useUser()

  if (!isLoaded || !isSignedIn) return null

  return (
    <div>
      <img src={user.imageUrl} alt={user.fullName ?? ''} />
      <p>{user.firstName} {user.lastName}</p>
      <p>{user.primaryEmailAddress?.emailAddress}</p>
    </div>
  )
}
```

## useClerk()

Access the Clerk instance for programmatic control:

```tsx
import { useClerk } from '@clerk/react'

export function NavBar() {
  const { signOut, openUserProfile, openOrganizationProfile } = useClerk()

  return (
    <nav>
      <button onClick={() => openUserProfile()}>Profile</button>
      <button onClick={() => signOut()}>Sign out</button>
    </nav>
  )
}
```

## getToken() for API Calls

```tsx
import { useAuth } from '@clerk/react'

function isAllowedUrl(url: string): boolean {
  if (url.startsWith('/') && !url.startsWith('//')) return true
  try {
    const allowed = new Set([
      window.location.origin,
      // 'https://api.example.com',
    ])
    return allowed.has(new URL(url).origin)
  } catch {
    return false
  }
}

export function useAuthFetch() {
  const { getToken } = useAuth()

  return async function authFetch(url: string, init?: RequestInit) {
    if (!isAllowedUrl(url)) {
      throw new Error('Blocked request to untrusted origin')
    }

    const token = await getToken()
    if (!token) throw new Error('Not authenticated')

    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${token}`)

    return fetch(url, { ...init, headers })
  }
}
```

`getToken()` returns `null` when unauthenticated — always null-check.

[Docs](https://clerk.com/docs/react/getting-started/quickstart)
