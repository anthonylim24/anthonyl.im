# Nuxt Middleware (CRITICAL)

## Named Auth Route Middleware

Create `app/middleware/auth.ts` and attach it with `definePageMeta`. Use `useAuth()` + `navigateTo()` — do not use `clerkMiddleware()` for client-side navigations.

```ts
// app/middleware/auth.ts
export default defineNuxtRouteMiddleware(() => {
  const { isSignedIn } = useAuth()

  if (!isSignedIn.value) {
    return navigateTo('/sign-in')
  }
})
```

```vue
<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
</script>
```

## Custom Route Middleware

Create `app/middleware/require-org.ts` for custom logic:

```typescript
export default defineNuxtRouteMiddleware(() => {
  const { isSignedIn, orgId } = useAuth()

  if (!isSignedIn.value) {
    return navigateTo('/sign-in')
  }

  if (!orgId.value) {
    return navigateTo('/select-org')
  }
})
```

Apply to a page:

```vue
<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'require-org'] })
</script>
```

## Server-Side Middleware (Nitro)

For API-level protection in `server/middleware/auth.ts`:

```typescript
import { clerkClient } from '@clerk/nuxt/server'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth()

  if (getRequestURL(event).pathname.startsWith('/api/protected')) {
    if (!auth?.userId) {
      throw createError({ statusCode: 401, message: 'Unauthorized' })
    }
  }
})
```

## Redirect URLs

Configure in `.env`:
```dotenv
NUXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NUXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NUXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NUXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard
```

[Docs](https://clerk.com/docs/nuxt/getting-started/quickstart)
