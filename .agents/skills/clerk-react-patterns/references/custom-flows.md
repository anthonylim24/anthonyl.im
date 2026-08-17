# Custom Flows (HIGH)

Current `@clerk/react` `useSignIn()` / `useSignUp()` return `{ signIn, errors, fetchStatus }` / `{ signUp, errors, fetchStatus }`. Do not destructure `isLoaded` or `setActive` from these hooks — that is the legacy API. `isLoaded` from `useAuth()` / `useUser()` is still current.

- Methods resolve to `{ error: ClerkError | null }`. Check `error` / `errors.fields`; do not rely on try/catch for Clerk API errors.
- `fetchStatus` is `'idle' | 'fetching'` — disable submit while fetching.
- `finalize({ navigate })` activates the session. It replaces `setActive({ session })`.

Legacy `signIn.create()` / `signUp.create()` + `prepare*` / `attempt*` + `setActive` belongs only to a legacy SDK import, not new `@clerk/react` code.

## Custom Sign-In with useSignIn

```tsx
import { useSignIn } from '@clerk/react'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

export function CustomSignIn() {
  const { signIn, errors, fetchStatus } = useSignIn()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const { error } = await signIn.password({ emailAddress: email, password })
    if (error) return

    if (signIn.status === 'complete') {
      await signIn.finalize({
        navigate: ({ session, decorateUrl }) => {
          if (session?.currentTask) return
          const url = decorateUrl('/dashboard')
          if (url.startsWith('http')) window.location.href = url
          else navigate(url)
        },
      })
    } else if (signIn.status === 'needs_second_factor') {
      // MFA — see status table
    } else if (signIn.status === 'needs_client_trust') {
      const emailFactor = signIn.supportedSecondFactors?.find((f) => f.strategy === 'email_code')
      if (emailFactor) await signIn.mfa.sendEmailCode()
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="Email"
      />
      {errors.fields.identifier && <p>{errors.fields.identifier.message}</p>}
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="Password"
      />
      {errors.fields.password && <p>{errors.fields.password.message}</p>}
      <button type="submit" disabled={fetchStatus === 'fetching'}>Sign In</button>
    </form>
  )
}
```

## Custom Sign-Up with useSignUp

```tsx
import { useSignUp } from '@clerk/react'

export function CustomSignUp() {
  const { signUp, errors, fetchStatus } = useSignUp()

  async function handleSubmit(email: string, password: string) {
    const { error } = await signUp.password({ emailAddress: email, password })
    if (error) return // surface errors.fields.emailAddress / errors.fields.password

    if (signUp.status === 'complete') {
      await signUp.finalize()
    } else if (
      signUp.status === 'missing_requirements' &&
      signUp.unverifiedFields.includes('email_address')
    ) {
      await signUp.verifications.sendEmailCode()
    }
  }

  // Disable submit while fetchStatus === 'fetching'
}
```

## Email Verification

```tsx
async function verifyEmail(code: string) {
  const { error } = await signUp.verifications.verifyEmailCode({ code })
  if (error) return

  if (signUp.status === 'complete') {
    await signUp.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) return
        const url = decorateUrl('/dashboard')
        if (url.startsWith('http')) window.location.href = url
        else navigate(url)
      },
    })
  }
}
```

Resend: `signUp.verifications.sendEmailCode()`. Phone variants: `sendPhoneCode()` / `verifyPhoneCode({ code })`.

## signIn.status Values

| Status | Meaning |
|--------|---------|
| `'complete'` | Auth successful — call `finalize()` |
| `'needs_first_factor'` | First factor required (e.g., password) |
| `'needs_second_factor'` | MFA required — `signIn.mfa.send*` / `verify*` |
| `'needs_client_trust'` | New-device verification without MFA — same `mfa` send/verify methods |
| `'needs_new_password'` | Password reset required |

Always check `signIn.status === 'complete'` before calling `finalize()`. For `needs_client_trust`, inspect `signIn.supportedSecondFactors` and verify with `signIn.mfa.sendEmailCode()` / `verifyEmailCode({ code })` (or the phone equivalents).

[Docs](https://clerk.com/docs/react/getting-started/quickstart)
