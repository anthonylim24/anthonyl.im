import type { ReactElement, ReactNode } from 'react'
import { CLERK_PROXY_URL, CLERK_PUBLISHABLE_KEY } from './clerk'
import { importWithRetry } from './lazyRetry'

export async function createOptionalClerkTree(children: ReactNode): Promise<ReactElement> {
  if (!CLERK_PUBLISHABLE_KEY) {
    return <>{children}</>
  }

  // Every route renders inside this provider, so a stalled download here
  // would hold the whole page blank: the import gets the chunk deadline.
  const { ClerkProvider } = await importWithRetry(() => import('@clerk/clerk-react'))

  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      proxyUrl={CLERK_PROXY_URL}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/breathwork"
    >
      {children}
    </ClerkProvider>
  )
}
