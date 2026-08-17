# Vinxi Server (HIGH)

## clerkMiddleware() Setup

TanStack Start uses Vinxi as its build tool and server runtime. Register `clerkMiddleware` in `src/start.ts`:

```typescript
import { clerkMiddleware } from '@clerk/tanstack-react-start/server'
import { createStart } from '@tanstack/react-start'

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [clerkMiddleware()],
  }
})
```

Without this, `auth()` returns an empty object in all server functions.

## ClerkProvider in Root

Add `ClerkProvider` to the root route shell component in `src/routes/__root.tsx`:

```tsx
import { ClerkProvider } from '@clerk/tanstack-react-start'
import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router'

export const Route = createRootRoute({
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <ClerkProvider>
          {children}
        </ClerkProvider>
        <Scripts />
      </body>
    </html>
  )
}
```

## Environment Variables

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
```

The publishable key is client-facing and must use the `VITE_` prefix. Keep `CLERK_SECRET_KEY` unprefixed and server-only.

## API Routes

TanStack Start API routes live in `src/routes/api/`:

```typescript
// src/routes/api/protected.ts
import { createFileRoute } from '@tanstack/react-router'
import { auth } from '@clerk/tanstack-react-start/server'

export const Route = createFileRoute('/api/protected')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { isAuthenticated, userId } = await auth()

        if (!isAuthenticated) {
          return new Response('Unauthorized', { status: 401 })
        }

        return new Response(JSON.stringify({ userId }), {
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
```

[Docs](https://clerk.com/docs/tanstack-react-start/getting-started/quickstart)
