import { SignIn, SignUp } from '@clerk/clerk-react'
import { Navigate } from 'react-router-dom'
import { CLERK_ENABLED } from '@/lib/clerk'
import { sx } from '@/lib/utils'
import { routeFallback } from '@/styles/chatbot.stylex'

// Clerk finishes Google sign-in at `<signInUrl>#/sso-callback`. Hosting these
// pages on our own origin keeps the whole flow off accounts.anthonyl.im,
// which some networks block.
const modes = {
  'sign-in': () => <SignIn routing="hash" signUpUrl="/sign-up" fallbackRedirectUrl="/trips" />,
  'sign-up': () => <SignUp routing="hash" signInUrl="/sign-in" fallbackRedirectUrl="/trips" />,
}

export type AuthMode = keyof typeof modes

export function AuthPage({ mode }: { mode: AuthMode }) {
  if (!CLERK_ENABLED) return <Navigate to="/" replace />
  const Form = modes[mode]
  return (
    <main {...sx(routeFallback.shell, 'trips')}>
      <Form />
    </main>
  )
}
