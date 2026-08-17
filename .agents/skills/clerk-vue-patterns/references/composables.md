# Composables

All composables come from `@clerk/vue`.

## useAuth

```ts
import { useAuth } from '@clerk/vue'

const { isSignedIn, isLoaded, userId, sessionId, signOut, getToken } = useAuth()
```

| Property | Type | Description |
|----------|------|-------------|
| `isSignedIn` | `Ref<boolean>` | True when user is authenticated |
| `isLoaded` | `Ref<boolean>` | True when Clerk has initialized |
| `userId` | `Ref<string \| null>` | Current user ID |
| `sessionId` | `Ref<string \| null>` | Current session ID |
| `signOut()` | `function` | Sign out and clear session |
| `getToken()` | `async function` | Get JWT for external APIs |

## useUser

```ts
import { useUser } from '@clerk/vue'

const { user, isLoaded } = useUser()
```

`user` is `Ref<UserResource | null>` with `.firstName`, `.lastName`, `.fullName`, `.imageUrl`, `.primaryEmailAddress`, etc.

## useClerk

```ts
import { useClerk } from '@clerk/vue'

const clerk = useClerk()
await clerk.value.openSignIn()
await clerk.value.openUserProfile()
```

Use for programmatic UI control (open modals, redirect, etc.).

## useOrganization

```ts
import { useOrganization } from '@clerk/vue'

const { organization, membership, isLoaded } = useOrganization()
```

`organization` is `Ref<Organization | null>`. `membership` includes `role`.

## Org switching

`useOrganizationList` is not exported from `@clerk/vue`. List memberships from `useUser()` and switch with `useClerk().setActive()`:

```ts
import { useClerk, useOrganization, useUser } from '@clerk/vue'

const clerk = useClerk()
const { organization, membership, isLoaded } = useOrganization()
const { user } = useUser()

async function switchOrg(orgId: string) {
  await clerk.value?.setActive({ organization: orgId })
}

const memberships = user.value?.organizationMemberships ?? []
```

## useSignIn / useSignUp

```ts
import { useSignIn } from '@clerk/vue'

const { signIn, setActive, isLoaded } = useSignIn()

async function submit(email: string, password: string) {
  const result = await signIn.value!.create({
    identifier: email,
    password,
  })
  if (result.status === 'complete') {
    await setActive.value!({ session: result.createdSessionId })
  }
}
```

## CRITICAL

- All composables return refs — access values with `.value` outside of templates
- Check `isLoaded` before rendering auth-gated UI to prevent flashes
- Do not import `useOrganizationList` — switch orgs with `useClerk().setActive()` and `user.organizationMemberships`
